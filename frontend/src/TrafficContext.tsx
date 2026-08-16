import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Node, Edge, Connection, applyNodeChanges, applyEdgeChanges, addEdge, NodeChange, EdgeChange } from 'reactflow';
import { useTrafficWebSocket, TrafficData } from './hooks/useTrafficWebSocket';

interface TrafficContextType {
  nodes: Node[];
  onNodesChange: (changes: NodeChange[]) => void;
  edges: Edge[];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  isSpawnMode: boolean;
  setIsSpawnMode: (mode: boolean) => void;
  cityPainIndex: number;          // Represents average active wait time (in seconds)
  avgWaitCompleted: number;       // Average completed wait time (in seconds)
  maxWaitActive: number;          // Maximum wait time experienced by any active car (in seconds)
  totalCarsFinished: number;
  metricsHistory: any[];
  realtimeNodes: Record<string, TrafficData>;
  history: TrafficData[];
  connected: boolean;
  eventLogs: any[];
  sendTopologyUpdate: (msg: any) => void;
}

export const TransferBus = new EventTarget();

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const TrafficContext = createContext<TrafficContextType | undefined>(undefined);

export function TrafficProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [isSpawnMode, setIsSpawnMode] = useState<boolean>(false);
  
  const [cityPainIndex, setCityPainIndex] = useState<number>(0);
  const [avgWaitCompleted, setAvgWaitCompleted] = useState<number>(0);
  const [maxWaitActive, setMaxWaitActive] = useState<number>(0);
  const [totalCarsFinished, setTotalCarsFinished] = useState<number>(0);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  
  const totalCompletedWaitTimeRef = useRef<number>(0);
  const totalCompletedCarsRef = useRef<number>(0);
  
  const { nodes: realtimeNodes, history, connected, eventLogs, sendTopologyUpdate } = useTrafficWebSocket();
  const edgesRef = useRef<Edge[]>(edges);
  
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ 
      ...connection, 
      type: 'vehicle', 
      data: { 
        targetNodeId: connection.target, 
        targetLight: 'Red',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle
      } 
    }, eds));
  }, []);

  // Listen to physics and simulation events on the TransferBus
  useEffect(() => {
    const handleTransfer = (e: any) => {
      const { nodeId, color, speed, startTime, totalWaitTime, type } = e.detail;
      const targetEdge = edgesRef.current.find(edge => edge.source === nodeId);
      
      if (targetEdge) {
        const nextNodeId = targetEdge.target;
        const targetHandleDir = targetEdge.data?.targetHandle === 'left' ? 'W' :
                               targetEdge.data?.targetHandle === 'right' ? 'E' :
                               targetEdge.data?.targetHandle === 'top' ? 'N' : 'S';
        
        const direction = targetEdge.sourceHandle === 'left' || targetEdge.sourceHandle === 'right' ? 1 : 1;
        
        sendTopologyUpdate({
          type: 'proactive_message',
          source: nodeId,
          target: nextNodeId,
          targetDir: targetHandleDir,
          count: 1
        });
        
        TransferBus.dispatchEvent(new CustomEvent(`spawn-${targetEdge.id}`, { 
          detail: { color, speed, direction, startTime, totalWaitTime, type }
        }));
      }
    };
    
    const handleCompleted = (e: any) => {
      const { waitTime } = e.detail; // in milliseconds
      setTotalCarsFinished(prevTotal => prevTotal + 1);
      
      totalCompletedCarsRef.current += 1;
      totalCompletedWaitTimeRef.current += (waitTime / 1000); // convert to seconds
      
      const avg = totalCompletedWaitTimeRef.current / totalCompletedCarsRef.current;
      setAvgWaitCompleted(Math.round(avg * 10) / 10);
    };

    TransferBus.addEventListener('transfer', handleTransfer);
    TransferBus.addEventListener('vehicle_completed', handleCompleted);

    const activeEdgeMap = new Map<string, { carCount: number, totalWaitTime: number, maxWait: number }>();
    const handlePainReport = (e: any) => {
      const { edgeId, carCount, totalWaitTime, maxWait } = e.detail;
      activeEdgeMap.set(edgeId, { carCount, totalWaitTime, maxWait });
      
      let sumWaitTime = 0;
      let sumCars = 0;
      let globalMaxWait = 0;
      
      activeEdgeMap.forEach(v => {
        sumWaitTime += v.totalWaitTime;
        sumCars += v.carCount;
        if (v.maxWait > globalMaxWait) {
          globalMaxWait = v.maxWait;
        }
      });
      
      const avgWaitActive = sumCars > 0 ? (sumWaitTime / sumCars / 1000) : 0;
      setCityPainIndex(Math.round(avgWaitActive * 10) / 10);
      setMaxWaitActive(Math.round((globalMaxWait / 1000) * 10) / 10);
    };
    TransferBus.addEventListener('pain_report', handlePainReport);

    const handleVisionSensor = (e: any) => {
      const { targetNodeId, direction, count, density, hasAmbulance } = e.detail;
      sendTopologyUpdate({
        type: 'vision_sensor',
        nodeId: targetNodeId,
        direction: direction,
        waitingCars: count,
        density: density,
        hasAmbulance: hasAmbulance
      });
    };
    TransferBus.addEventListener('vision_sensor', handleVisionSensor);

    return () => {
       TransferBus.removeEventListener('transfer', handleTransfer);
       TransferBus.removeEventListener('vehicle_completed', handleCompleted);
       TransferBus.removeEventListener('pain_report', handlePainReport);
       TransferBus.removeEventListener('vision_sensor', handleVisionSensor);
    }
  }, [sendTopologyUpdate]);

  const cityPainRef = useRef(0);
  const throughputRef = useRef(0);
  useEffect(() => {
    cityPainRef.current = cityPainIndex;
    throughputRef.current = totalCarsFinished;
  }, [cityPainIndex, totalCarsFinished]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetricsHistory(prev => {
        const totalPain = Math.round(cityPainRef.current);
        const newHist = [...prev, {
          time: new Date().toLocaleTimeString(),
          pain: totalPain,
          throughput: throughputRef.current
        }];
        if (newHist.length > 30) return newHist.slice(newHist.length - 30);
        return newHist;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TrafficContext.Provider value={{
      nodes, setNodes, onNodesChange,
      edges, setEdges, onEdgesChange, onConnect,
      isSpawnMode, setIsSpawnMode,
      cityPainIndex, avgWaitCompleted, maxWaitActive, totalCarsFinished, metricsHistory,
      realtimeNodes, history, connected, eventLogs, sendTopologyUpdate
    }}>
      {children}
    </TrafficContext.Provider>
  );
}

export function useTrafficContext() {
  const context = useContext(TrafficContext);
  if (!context) {
    throw new Error('useTrafficContext must be used within a TrafficProvider');
  }
  return context;
}
