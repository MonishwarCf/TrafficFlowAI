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

const initialNodes: Node[] = [
  { id: 'Node1', type: 'junction', position: { x: 200, y: 200 }, data: { label: 'Node1', light: { N: 'Red', S: 'Red', E: 'Red', W: 'Red' } } },
  { id: 'Node2', type: 'junction', position: { x: 600, y: 200 }, data: { label: 'Node2', light: { N: 'Red', S: 'Red', E: 'Red', W: 'Red' } } },
  { id: 'Node3', type: 'junction', position: { x: 400, y: 500 }, data: { label: 'Node3', light: { N: 'Red', S: 'Red', E: 'Red', W: 'Red' } } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'Node1', target: 'Node2', sourceHandle: 'E_out', targetHandle: 'W_in', type: 'vehicle', data: { targetNodeId: 'Node2', targetLight: 'Red' } },
  { id: 'e2-3', source: 'Node2', target: 'Node3', sourceHandle: 'S_out', targetHandle: 'N_in', type: 'vehicle', data: { targetNodeId: 'Node3', targetLight: 'Red' } },
  { id: 'e3-1', source: 'Node3', target: 'Node1', sourceHandle: 'N_out', targetHandle: 'S_in', type: 'vehicle', data: { targetNodeId: 'Node1', targetLight: 'Red' } },
];

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
