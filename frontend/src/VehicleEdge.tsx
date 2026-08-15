import { useEffect, useRef, useState } from 'react';
import { getSmoothStepPath, EdgeProps, BaseEdge } from 'reactflow';
import { TransferBus } from './TrafficContext';

export interface Vehicle {
  id: number;
  distance: number;
  color: string;
  speed: number;
  stopped: boolean;
  direction: 1 | -1;
  startTime: number;
  totalWaitTime: number;
  type?: string;
}

export default function VehicleEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style: _style = {},
  markerEnd,
  data,
  sourceHandleId,
  targetHandleId
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
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
  const sourceNodeId = source;
  const targetLight = data?.targetLight || 'Red';
  const sourceLight = data?.sourceLight || 'Red';
  const spawnTrigger = data?.spawnTrigger || 0;
  const spawnCount = data?.spawnCount || 0;
  const spawnType = data?.spawnType || 'Car';
  const reportWaitingCars = data?.reportWaitingCars;
  const targetNodeType = data?.targetNodeType;
  const sourceNodeType = data?.sourceNodeType;
  const targetHandleDir = targetHandleId ? targetHandleId.split('_')[0] : 'N';
  const sourceHandleDir = sourceHandleId ? sourceHandleId.split('_')[0] : 'S';

  useEffect(() => {
    if (spawnTrigger > lastSpawnTrigger.current) {
      lastSpawnTrigger.current = spawnTrigger;
      
      const newCars: Vehicle[] = [];
      for(let i = 0; i < spawnCount; i++) {
        const direction = i % 2 === 0 ? 1 : -1;
        const isAmb = (i === 0 && spawnType === 'Ambulance');
        
        newCars.push({
          id: nextId.current++,
          distance: -20 - Math.floor(i/2) * 35,
          color: isAmb ? '#ff0000' : `hsl(${Math.random() * 360}, 100%, 60%)`,
          speed: isAmb ? 2 : (1 + Math.random() * 1),
          stopped: false,
          direction,
          startTime: Date.now(),
          totalWaitTime: 0,
          type: isAmb ? 'Ambulance' : 'Car'
        });
      }
      vehiclesRef.current = [...vehiclesRef.current, ...newCars];
    }
  }, [spawnTrigger, spawnCount, spawnType]);

  useEffect(() => {
    const onSpawn = (e: any) => {
      const { color, speed, direction, startTime, totalWaitTime, type } = e.detail;
      vehiclesRef.current.push({
        id: nextId.current++,
        distance: -10,
        color,
        speed,
        direction,
        stopped: false,
        startTime: startTime || Date.now(),
        totalWaitTime: totalWaitTime || 0,
        type: type || 'Car'
      });
    };
    TransferBus.addEventListener(`spawn-${id}`, onSpawn);
    return () => TransferBus.removeEventListener(`spawn-${id}`, onSpawn);
  }, [id]);

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
      let waitingTarget = 0;
      let waitingSource = 0;
      let ambTarget = false;
      let ambSource = false;
      let localPainIndex = 0;

      for (let i = 0; i < vehiclesRef.current.length; i++) {
        const car = vehiclesRef.current[i];
        
        let distToNext = Infinity;
        const sameDirCars = vehiclesRef.current.filter(c => c.direction === car.direction);
        const myIndex = sameDirCars.indexOf(car);
        if (myIndex > 0) {
           const carInFront = sameDirCars[myIndex - 1];
           distToNext = carInFront.distance - car.distance - 25; // car length + gap
        }

        const distToEnd = totalLength - car.distance;
        let stopped = false;
        
        const lightAtEnd = car.direction === 1 ? targetLight : sourceLight;
        const isHeadingToExit = car.direction === 1 ? (targetNodeType === 'exit') : (sourceNodeType === 'exit');
        
        if (isHeadingToExit) {
          if (distToNext < 5) stopped = true;
        } else {
          if (distToEnd < 30 && lightAtEnd === 'Red') {
            stopped = true;
          } else if (distToNext < 5) {
            stopped = true;
          }
        }

        car.stopped = stopped;
        
        if (!stopped) {
          car.distance += car.speed;
        } else {
          car.totalWaitTime += 16;
        }

        const weight = car.type === 'Ambulance' ? 50 : 1;
        localPainIndex += (car.totalWaitTime / 1000) * weight;

        if (stopped && distToEnd >= 0 && distToEnd < 200 && !isHeadingToExit) {
          if (car.direction === 1) {
             waitingTarget++;
             if (car.type === 'Ambulance') ambTarget = true;
          } else {
             waitingSource++;
             if (car.type === 'Ambulance') ambSource = true;
          }
        }
      }

      vehiclesRef.current = vehiclesRef.current.filter(c => {
        const isHeadingToExit = c.direction === 1 ? (targetNodeType === 'exit') : (sourceNodeType === 'exit');
        if (isHeadingToExit && c.distance >= totalLength - 5) {
           TransferBus.dispatchEvent(new CustomEvent('vehicle_completed', { 
             detail: { waitTime: c.totalWaitTime, tripTime: Date.now() - c.startTime }
           }));
           return false;
        }
        
        if (c.distance > totalLength + 5) {
          const exitNode = c.direction === 1 ? targetNodeId : sourceNodeId;
          TransferBus.dispatchEvent(new CustomEvent('transfer', { 
            detail: { nodeId: exitNode, sourceEdgeId: id, color: c.color, speed: c.speed, startTime: c.startTime, totalWaitTime: c.totalWaitTime, type: c.type } 
          }));
          return false;
        }
        
        return c.distance < totalLength + 50;
      });
      
      setVehicles([...vehiclesRef.current]);

      if (time - lastReportTime > 500) {
        TransferBus.dispatchEvent(new CustomEvent('pain_report', { 
            detail: { edgeId: id, pain: localPainIndex } 
        }));

        if (reportWaitingCars) {
          if (targetNodeId) {
             const densityTarget = Math.min(1.0, waitingTarget / 15.0);
             reportWaitingCars(id, targetNodeId, targetHandleDir, waitingTarget, densityTarget, ambTarget);
          }
          if (sourceNodeId) {
             const densitySource = Math.min(1.0, waitingSource / 15.0);
             reportWaitingCars(id, sourceNodeId, sourceHandleDir, waitingSource, densitySource, ambSource);
          }
        }
        lastReportTime = time;
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetLight, sourceLight, id, targetNodeId, sourceNodeId, reportWaitingCars, targetNodeType, sourceNodeType]);

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

        const pointDist = car.direction === 1 ? car.distance : length - car.distance;
        const point = pathRef.current.getPointAtLength(pointDist);
        const nextDist = car.direction === 1 ? Math.min(car.distance + 1, length) : Math.max(length - car.distance - 1, 0);
        const nextPoint = pathRef.current.getPointAtLength(nextDist);
        
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offsetDist = 8;
        const offsetX = nx * offsetDist;
        const offsetY = ny * offsetDist;

        return (
          <rect 
            key={car.id}
            x={point.x - 10 + offsetX} 
            y={point.y - 6 + offsetY} 
            width={20} 
            height={12} 
            fill={car.color}
            transform={`rotate(${angle} ${point.x + offsetX} ${point.y + offsetY})`}
            style={{ transition: 'none' }}
          />
        );
      })}
    </g>
  );
}
