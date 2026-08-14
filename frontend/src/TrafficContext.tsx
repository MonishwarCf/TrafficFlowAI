import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, addEdge, Connection } from 'reactflow';

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
}

export const TransferBus = new EventTarget();

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const TrafficContext = createContext<TrafficContextType | undefined>(undefined);

export function TrafficProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [isSpawnMode, setIsSpawnMode] = useState<boolean>(false);

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

  return (
    <TrafficContext.Provider value={{
      nodes, setNodes, onNodesChange,
      edges, setEdges, onEdgesChange, onConnect,
      isSpawnMode, setIsSpawnMode
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
