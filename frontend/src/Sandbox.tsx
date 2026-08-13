import { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Node, 
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTrafficWebSocket } from './hooks/useTrafficWebSocket';
import { Link } from 'react-router-dom';
import CustomJunctionNode from './CustomJunctionNode';
import VehicleEdge from './VehicleEdge';
import ExitNode from './ExitNode';
import { addEdge, Connection } from 'reactflow';

const initialNodes: Node[] = [
  { id: 'Node1', type: 'junction', position: { x: 200, y: 200 }, data: { label: 'Node1', light: 'Red' } },
  { id: 'Node2', type: 'junction', position: { x: 600, y: 200 }, data: { label: 'Node2', light: 'Red' } },
  { id: 'Node3', type: 'junction', position: { x: 400, y: 500 }, data: { label: 'Node3', light: 'Red' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'Node1', target: 'Node2', type: 'vehicle', data: { targetNodeId: 'Node2', targetLight: 'Red' } },
  { id: 'e2-3', source: 'Node2', target: 'Node3', type: 'vehicle', data: { targetNodeId: 'Node3', targetLight: 'Red' } },
  { id: 'e3-1', source: 'Node3', target: 'Node1', type: 'vehicle', data: { targetNodeId: 'Node1', targetLight: 'Red' } },
];

export default function Sandbox() {
  const { sendTopologyUpdate, nodes: realtimeNodes } = useTrafficWebSocket();
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [spawnCount, setSpawnCount] = useState<number>(5);

  const nodeTypes = useMemo(() => ({ junction: CustomJunctionNode, exit: ExitNode }), []);
  const edgeTypes = useMemo(() => ({ vehicle: VehicleEdge }), []);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, type: 'vehicle', data: { targetNodeId: connection.target, targetLight: 'Red' } }, eds));
  }, [setEdges]);

  useEffect(() => {
    // Send topology updates for these nodes when mounted
    initialNodes.forEach(n => {
      sendTopologyUpdate({ type: 'add_node', id: n.id });
    });
  }, [sendTopologyUpdate]);

  useEffect(() => {
    setNodes(nds => nds.map(n => {
      const realTimeNode = realtimeNodes[n.id];
      if (realTimeNode) {
        return { ...n, data: { ...n.data, light: realTimeNode.light } };
      }
      return n;
    }));

    setEdges(eds => eds.map(e => {
      const targetNode = realtimeNodes[e.target];
      const targetNodeType = nodes.find(n => n.id === e.target)?.type;
      
      let updatedData = { ...e.data, targetNodeType };
      if (targetNode) {
        updatedData.targetLight = targetNode.light;
      }
      return { ...e, data: updatedData };
    }));
  }, [realtimeNodes, nodes]);

  const reportWaitingCars = useCallback((_edgeId: string, targetNodeId: string, waitingCars: number) => {
    sendTopologyUpdate({
      type: 'vision_sensor',
      nodeId: targetNodeId,
      waitingCars: waitingCars
    });
  }, [sendTopologyUpdate]);

  useEffect(() => {
    setEdges(eds => eds.map(e => ({
      ...e,
      data: { ...e.data, reportWaitingCars }
    })));
  }, [reportWaitingCars]);

  const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  };

  const onPaneClick = () => {
    setSelectedEdgeId(null);
  };

  const handleInject = () => {
    if (!selectedEdgeId) return;
    setEdges(eds => eds.map(e => {
      if (e.id === selectedEdgeId) {
        return {
          ...e,
          data: {
            ...e.data,
            spawnTrigger: (e.data.spawnTrigger || 0) + 1,
            spawnCount: spawnCount
          }
        };
      }
      return e;
    }));
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#121212', color: 'white' }}>
      <header style={{ padding: '15px 30px', backgroundColor: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h2 style={{ margin: 0, color: '#4caf50' }}>Traffic AI Sandbox (React Flow)</h2>
        <div>
           <Link to="/" style={{ color: '#fff', textDecoration: 'none', padding: '8px 16px', backgroundColor: '#333', borderRadius: '4px' }}>Back to Dashboard</Link>
        </div>
      </header>
      
      <div style={{ padding: '20px 30px', display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: '#1e1e1e' }}>
         <div>
            <label style={{ marginRight: '10px' }}>Selected Edge:</label>
            <span style={{ color: '#aaa', fontWeight: 'bold' }}>{selectedEdgeId || 'None'}</span>
         </div>
         <div>
            <label style={{ marginRight: '10px' }}>Vehicles to Inject:</label>
            <input type="number" value={spawnCount} onChange={e => setSpawnCount(Number(e.target.value))} style={{ width: '80px', padding: '5px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }}/>
         </div>
         <button 
           onClick={handleInject} 
           disabled={!selectedEdgeId}
           style={{ padding: '8px 24px', cursor: !selectedEdgeId ? 'not-allowed' : 'pointer', backgroundColor: !selectedEdgeId ? '#555' : '#4caf50', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
         >
           Inject Vehicles
         </button>
      </div>

      <div style={{ flexGrow: 1, position: 'relative' }}>
         <ReactFlow 
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={() => true}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
         >
           <Background color="#333" gap={16} />
           <Controls />
         </ReactFlow>
      </div>
    </div>
  );
}
