import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, addEdge, Connection } from 'reactflow';
import { useTrafficWebSocket, TrafficData } from './hooks/useTrafficWebSocket';

interface TrafficContextType {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  isSpawnMode: boolean;
  setIsSpawnMode: (mode: boolean) => void;
  cityPainIndex: number;
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
  const [totalCarsFinished, setTotalCarsFinished] = useState<number>(0);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  
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

  useEffect(() => {
    const handleTransfer = (e: any) => {
      const { nodeId, sourceEdgeId, color, speed, startTime, totalWaitTime, type } = e.detail;
      const possibleEdges = edgesRef.current.filter(edge => 
        edge.id !== sourceEdgeId && (edge.source === nodeId || edge.target === nodeId)
      );
      
      if (possibleEdges.length > 0) {
        const targetEdge = possibleEdges[Math.floor(Math.random() * possibleEdges.length)];
        const direction = targetEdge.source === nodeId ? 1 : -1;
        const nextNodeId = targetEdge.source === nodeId ? targetEdge.target : targetEdge.source;
        
        // Derive the direction the cars will arrive FROM (the target handle of the edge)
        const targetHandleDir = (targetEdge.data?.targetHandle || 'N') as string;
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
    
    const handleCompleted = () => {
      setTotalCarsFinished(prevTotal => prevTotal + 1);
    };

    TransferBus.addEventListener('transfer', handleTransfer);
    TransferBus.addEventListener('vehicle_completed', handleCompleted);

    const painMap = new Map<string, { pain: number, carCount: number }>();
    const handlePainReport = (e: any) => {
      const { edgeId, pain, carCount } = e.detail;
      painMap.set(edgeId, { pain, carCount });
      
      let totalPain = 0;
      let totalCars = 0;
      painMap.forEach(v => {
        totalPain += v.pain;
        totalCars += v.carCount;
      });

      const avgWaitSeconds = totalCars > 0 ? (totalPain / totalCars) : 0;
      setCityPainIndex(Math.round(avgWaitSeconds * 10) / 10);
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
      cityPainIndex, totalCarsFinished, metricsHistory,
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
