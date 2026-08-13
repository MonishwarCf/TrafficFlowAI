import { useEffect, useRef, useState } from 'react';
import { getBezierPath, EdgeProps, BaseEdge } from 'reactflow';

export interface Vehicle {
  id: number;
  distance: number;
  color: string;
  speed: number;
  stopped: boolean;
}

export default function VehicleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style: _style = {},
  markerEnd,
  data
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const pathRef = useRef<SVGPathElement>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const nextId = useRef(0);
  const lastSpawnTrigger = useRef(0);

  const targetNodeId = data?.targetNodeId;
  const targetLight = data?.targetLight || 'Red';
  const spawnTrigger = data?.spawnTrigger || 0;
  const spawnCount = data?.spawnCount || 0;
  const reportWaitingCars = data?.reportWaitingCars;
  const targetNodeType = data?.targetNodeType;

  useEffect(() => {
    if (spawnTrigger > lastSpawnTrigger.current) {
      lastSpawnTrigger.current = spawnTrigger;
      
      const newCars: Vehicle[] = [];
      for(let i = 0; i < spawnCount; i++) {
        newCars.push({
          id: nextId.current++,
          distance: -20 - i * 35, // spacing
          color: `hsl(${Math.random() * 360}, 100%, 60%)`,
          speed: 1 + Math.random() * 1,
          stopped: false
        });
      }
      vehiclesRef.current = [...vehiclesRef.current, ...newCars];
    }
  }, [spawnTrigger, spawnCount]);

  useEffect(() => {
    let frameId: number;
    let lastReportTime = 0;

    const animate = (time: number) => {
      const path = pathRef.current;
      if (!path) {
        frameId = requestAnimationFrame(animate);
        return;
      }

      const totalLength = path.getTotalLength() || 100;
      let waitingCount = 0;

      for (let i = 0; i < vehiclesRef.current.length; i++) {
        const car = vehiclesRef.current[i];
        
        let distToNext = Infinity;
        if (i > 0) {
           const carInFront = vehiclesRef.current[i - 1];
           distToNext = carInFront.distance - car.distance - 25; // car length + gap
        }

        const distToEnd = totalLength - car.distance;
        let stopped = false;
        
        if (targetNodeType === 'exit') {
          if (distToNext < 5) stopped = true;
        } else {
          if (distToEnd < 30 && targetLight === 'Red') {
            stopped = true;
          } else if (distToNext < 5) {
            stopped = true;
          }
        }

        car.stopped = stopped;
        
        if (!stopped) {
          car.distance += car.speed;
        }

        if (stopped && distToEnd >= 0 && distToEnd < 200 && targetNodeType !== 'exit') {
          waitingCount++;
        }
      }

      vehiclesRef.current = vehiclesRef.current.filter(c => {
        if (targetNodeType === 'exit' && c.distance >= totalLength - 5) return false;
        return c.distance < totalLength + 50;
      });
      
      setVehicles([...vehiclesRef.current]);

      if (time - lastReportTime > 500) {
        if (reportWaitingCars && targetNodeId) {
          reportWaitingCars(id, targetNodeId, waitingCount);
        }
        lastReportTime = time;
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetLight, id, targetNodeId, reportWaitingCars]);

  return (
    <g>
      <BaseEdge path={edgePath} style={{ strokeWidth: 40, stroke: '#222' }} />
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ strokeWidth: 16, stroke: '#222' }} />
      <BaseEdge path={edgePath} style={{ strokeWidth: 22, stroke: '#fff', strokeDasharray: '10, 10' }} />
      <BaseEdge path={edgePath} style={{ strokeWidth: 18, stroke: '#222' }} />
      <BaseEdge path={edgePath} style={{ strokeWidth: 2, stroke: '#ffd700' }} />
      
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" />

      {vehicles.map(car => {
        if (!pathRef.current) return null;
        if (car.distance < 0) return null; 
        
        const length = pathRef.current.getTotalLength();
        if (car.distance > length) return null;

        const point = pathRef.current.getPointAtLength(car.distance);
        const nextPoint = pathRef.current.getPointAtLength(Math.min(car.distance + 1, length));
        const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI);

        return (
          <rect 
            key={car.id}
            x={point.x - 10} 
            y={point.y - 6} 
            width={20} 
            height={12} 
            fill={car.color}
            transform={`rotate(${angle} ${point.x} ${point.y})`}
            style={{ transition: 'none' }}
          />
        );
      })}
    </g>
  );
}
