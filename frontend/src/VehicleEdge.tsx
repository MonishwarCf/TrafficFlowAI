import { useEffect, useRef, useState } from 'react';
import { getSmoothStepPath, EdgeProps, BaseEdge } from 'reactflow';
import { TransferBus } from './TrafficContext';

export interface Vehicle {
  id: number;
  isMoving: boolean;       // true if driving, false if stopped at red light
  targetNode?: string;      // intersection node ID the car is heading toward
  distance: number;
  color: string;
  speed: number;
  stopped: boolean;
  direction: 1 | -1;
  startTime: number;
  totalWaitTime: number;
  type?: string;
}

/**
 * Modular Telemetry Interface.
 * Modular design allows swapping out this internal physics calculator 
 * for an external Computer Vision (CV) Model API in the future.
 */
export function getLaneTelemetry(vehicles: Vehicle[], dir: 1 | -1, totalLength: number, maxCapacity: number = 15) {
  const laneVehicles = vehicles.filter(v => v.direction === dir);

  const count = laneVehicles.length;
  const density = Math.min(1.0, count / maxCapacity);
  
  // Just-In-Time preemption: Only trigger override green when ambulance is within 180 units of the junction
  const hasAmbulance = laneVehicles.some(v => {
    if (v.type !== 'Ambulance') return false;
    const distToEnd = totalLength - v.distance;
    return distToEnd >= 0 && distToEnd < 180;
  });

  return { count, density, hasAmbulance };
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
          isMoving: true,
          targetNode: direction === 1 ? targetNodeId : sourceNodeId,
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
  }, [spawnTrigger, spawnCount, spawnType, targetNodeId, sourceNodeId]);

  useEffect(() => {
    const onSpawn = (e: any) => {
      const { color, speed, direction, startTime, totalWaitTime, type } = e.detail;
      vehiclesRef.current.push({
        id: nextId.current++,
        isMoving: true,
        targetNode: direction === 1 ? targetNodeId : sourceNodeId,
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
  }, [id, targetNodeId, sourceNodeId]);

  useEffect(() => {
    let frameId: number;
    let lastReportTime = 0;
    let lastTime = 0;

    const animate = (time: number) => {
      const path = pathRef.current;
      if (!path) {
        frameId = requestAnimationFrame(animate);
        return;
      }

      if (lastTime === 0) {
        lastTime = time;
      }
      const rawDt = time - lastTime;
      lastTime = time;

      // Normalize delta time to 60fps (1.0 = 16.67ms)
      // Cap at 3.0 to prevent physics teleportation when switching tabs
      const dt = Math.min(3.0, rawDt / 16.67);

      const totalLength = path.getTotalLength() || 100;

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
        car.isMoving = !stopped;
        car.targetNode = car.direction === 1 ? targetNodeId : sourceNodeId;
        
        if (!stopped) {
          car.distance += car.speed * dt;
        } else {
          car.totalWaitTime += rawDt;
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
        const activeCars = vehiclesRef.current;
        const totalWaitTime = activeCars.reduce((sum, c) => sum + c.totalWaitTime, 0);
        const maxWait = activeCars.length > 0 ? Math.max(...activeCars.map(c => c.totalWaitTime)) : 0;

        TransferBus.dispatchEvent(new CustomEvent('pain_report', { 
            detail: { 
              edgeId: id, 
              carCount: activeCars.length,
              totalWaitTime: totalWaitTime,
              maxWait: maxWait
            } 
        }));

        if (targetNodeId) {
           const targetTelemetry = getLaneTelemetry(vehiclesRef.current, 1, totalLength);
           TransferBus.dispatchEvent(new CustomEvent('vision_sensor', {
             detail: { targetNodeId, direction: targetHandleDir, count: targetTelemetry.count, density: targetTelemetry.density, hasAmbulance: targetTelemetry.hasAmbulance }
           }));
        }
        if (sourceNodeId) {
           const sourceTelemetry = getLaneTelemetry(vehiclesRef.current, -1, totalLength);
           TransferBus.dispatchEvent(new CustomEvent('vision_sensor', {
             detail: { targetNodeId: sourceNodeId, direction: sourceHandleDir, count: sourceTelemetry.count, density: sourceTelemetry.density, hasAmbulance: sourceTelemetry.hasAmbulance }
           }));
        }
        lastReportTime = time;
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetLight, sourceLight, id, targetNodeId, sourceNodeId, targetNodeType, sourceNodeType]);

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
