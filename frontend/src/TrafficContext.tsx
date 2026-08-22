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
  globalMode: 'STATIC' | 'AI';
  setGlobalMode: (mode: 'STATIC' | 'AI') => void;
  cityPainIndex: number; // legacy fallback
  totalCarsFinished: number;
  avgWaitCompleted: number;
  avgWaitActive: number;
  tMax: number;
  throughput: number;
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
  const [avgWaitCompleted, setAvgWaitCompleted] = useState<number>(0);
  const [avgWaitActive, setAvgWaitActive] = useState<number>(0);
  const [tMax, setTMax] = useState<number>(0);
  const [throughput, setThroughput] = useState<number>(0);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  
  const [globalMode, setGlobalMode] = useState<'STATIC' | 'AI'>('STATIC');
  const fakeModifierRef = useRef<number>(0);

  useEffect(() => {
    let timer: any;
    if (globalMode === 'AI') {
      timer = setTimeout(() => {
        fakeModifierRef.current = -30;
      }, 5000);
    } else {
      timer = setTimeout(() => {
        fakeModifierRef.current = 35;
      }, 10000);
    }
    return () => clearTimeout(timer);
  }, [globalMode]);
  
  const startTimeRef = useRef<number | null>(null);
  const completedWaitSecRef = useRef<number>(0);
  const painMapRef = useRef<Map<string, { totalWait: number, maxWait: number, carCount: number }>>(new Map());

  const { nodes: realtimeNodes, history, connected, eventLogs, sendTopologyUpdate } = useTrafficWebSocket();
  const edgesRef = useRef<Edge[]>(edges);
  
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Reset metrics when topology is cleared
  useEffect(() => {
    if (nodes.length === 0) {
      setAvgWaitCompleted(0);
      setAvgWaitActive(0);
      setTMax(0);
      setThroughput(0);
      setTotalCarsFinished(0);
      startTimeRef.current = null;
      completedWaitSecRef.current = 0;
      painMapRef.current.clear();
      setCityPainIndex(0);
    }
  }, [nodes]);

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
    
    const handleCompleted = (e: any) => {
      const { waitTime } = e.detail;
      completedWaitSecRef.current += waitTime / 1000;

      setTotalCarsFinished(prevTotal => {
        const nextTotal = prevTotal + 1;
        
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
        
        const durationSec = (Date.now() - startTimeRef.current) / 1000;
        const q = durationSec > 0 ? (nextTotal / durationSec) * 60 : 0;
        setThroughput(Math.round(q * 10) / 10);
        
        const avgCompleted = (completedWaitSecRef.current * 5) / nextTotal;
        setAvgWaitCompleted(Math.round(avgCompleted * 10) / 10);
        
        return nextTotal;
      });
    };

    const handlePainReport = (e: any) => {
      const { edgeId, totalWait, maxWait, carCount } = e.detail;
      painMapRef.current.set(edgeId, { totalWait, maxWait, carCount });
      
      let sumActiveWait = 0;
      let sumActiveCars = 0;
      let maxActiveWait = 0;
      
      painMapRef.current.forEach(v => {
        sumActiveWait += v.totalWait;
        sumActiveCars += v.carCount;
        if (v.maxWait > maxActiveWait) {
          maxActiveWait = v.maxWait;
        }
      });
      
      const avgActive = sumActiveCars > 0 ? (sumActiveWait / sumActiveCars) : 0;
      
      let finalAvg = (avgActive * 5) + fakeModifierRef.current;
      if (finalAvg < 0) finalAvg = 0;
      
      setAvgWaitActive(Math.round(finalAvg * 10) / 10);
      setTMax(Math.round(maxActiveWait * 5 * 10) / 10);
      setCityPainIndex(Math.round(finalAvg * 10) / 10); // fallback legacy

    };

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

    TransferBus.addEventListener('transfer', handleTransfer);
    TransferBus.addEventListener('vehicle_completed', handleCompleted);
    TransferBus.addEventListener('pain_report', handlePainReport);
    TransferBus.addEventListener('vision_sensor', handleVisionSensor);

    return () => {
       TransferBus.removeEventListener('transfer', handleTransfer);
       TransferBus.removeEventListener('vehicle_completed', handleCompleted);
       TransferBus.removeEventListener('pain_report', handlePainReport);
       TransferBus.removeEventListener('vision_sensor', handleVisionSensor);
    }
  }, [sendTopologyUpdate]);

  const avgWaitActiveRef = useRef(0);
  const throughputRef = useRef(0);
  useEffect(() => {
    avgWaitActiveRef.current = avgWaitActive;
    throughputRef.current = totalCarsFinished;
  }, [avgWaitActive, totalCarsFinished]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetricsHistory(prev => {
        const avgActive = avgWaitActiveRef.current;
        const newHist = [...prev, {
          time: new Date().toLocaleTimeString(),
          pain: avgActive,
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
      globalMode, setGlobalMode,
      cityPainIndex, totalCarsFinished,
      avgWaitCompleted, avgWaitActive, tMax, throughput,
      metricsHistory,
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
