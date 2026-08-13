import { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls,
  Panel,
  Node, 
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTrafficWebSocket } from './hooks/useTrafficWebSocket';
import { Link } from 'react-router-dom';
import CustomJunctionNode from './CustomJunctionNode';
import VehicleEdge from './VehicleEdge';
import ExitNode from './ExitNode';
import { useTrafficContext } from './TrafficContext';

export default function Sandbox() {
  const { sendTopologyUpdate, nodes: realtimeNodes } = useTrafficWebSocket();
  const { 
    nodes, setNodes, onNodesChange, 
    edges, setEdges, onEdgesChange, onConnect,
    isSpawnMode, setIsSpawnMode 
  } = useTrafficContext();
  
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [spawnCount, setSpawnCount] = useState<number>(5);

  const nodeTypes = useMemo(() => ({ junction: CustomJunctionNode, exit: ExitNode }), []);
  const edgeTypes = useMemo(() => ({ vehicle: VehicleEdge }), []);

  useEffect(() => {
    // Send topology updates for these nodes when mounted
    nodes.forEach(n => {
      sendTopologyUpdate({ type: 'add_node', id: n.id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendTopologyUpdate]);

  useEffect(() => {
    setNodes(nds => nds.map(n => {
      const realTimeNode = realtimeNodes[n.id];
      if (realTimeNode && realTimeNode.light !== n.data.light) {
        return { ...n, data: { ...n.data, light: realTimeNode.light } };
      }
      return n;
    }));

    setEdges(eds => eds.map(e => {
      const targetNode = realtimeNodes[e.target];
      const targetNodeType = nodes.find(n => n.id === e.target)?.type;
      
      let changed = false;
      let updatedData = { ...e.data };
      
      if (updatedData.targetNodeType !== targetNodeType) {
        updatedData.targetNodeType = targetNodeType;
        changed = true;
      }
      
      if (targetNode && updatedData.targetLight !== targetNode.light) {
        updatedData.targetLight = targetNode.light;
        changed = true;
      }
      
      return changed ? { ...e, data: updatedData } : e;
    }));
  }, [realtimeNodes, setNodes, setEdges, nodes]);

  const reportWaitingCars = useCallback((_edgeId: string, targetNodeId: string, waitingCars: number) => {
    sendTopologyUpdate({
      type: 'vision_sensor',
      nodeId: targetNodeId,
      waitingCars: waitingCars
    });
  }, [sendTopologyUpdate]);

  useEffect(() => {
    setEdges(eds => eds.map(e => {
      if (e.data?.reportWaitingCars !== reportWaitingCars) {
        return { ...e, data: { ...e.data, reportWaitingCars } };
      }
      return e;
    }));
  }, [reportWaitingCars, setEdges]);

  const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    if (isSpawnMode) {
      setSelectedEdgeId(edge.id);
    }
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

  const handleAddJunction = () => {
    const id = `Node${nodes.length + 1}`;
    setNodes(nds => [...nds, { id, type: 'junction', position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 }, data: { label: id, light: 'Red' } }]);
    sendTopologyUpdate({ type: 'add_node', id });
  };

  const handleAddExit = () => {
    const id = `Exit${nodes.length + 1}`;
    setNodes(nds => [...nds, { id, type: 'exit', position: { x: Math.random() * 200 + 300, y: Math.random() * 200 + 100 }, data: { label: id } }]);
  };

  const handleResetMap = () => {
    setNodes([]);
    setEdges([]);
    setSelectedEdgeId(null);
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
            <input type="number" value={spawnCount} onChange={e => setSpawnCount(Number(e.target.value))} disabled={!isSpawnMode} style={{ width: '80px', padding: '5px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }}/>
         </div>
         <button 
           onClick={handleInject} 
           disabled={!selectedEdgeId || !isSpawnMode}
           style={{ padding: '8px 24px', cursor: (!selectedEdgeId || !isSpawnMode) ? 'not-allowed' : 'pointer', backgroundColor: (!selectedEdgeId || !isSpawnMode) ? '#555' : '#4caf50', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
         >
           Inject Vehicles
         </button>
         <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
           <label>
             <input type="checkbox" checked={isSpawnMode} onChange={e => setIsSpawnMode(e.target.checked)} style={{ marginRight: '8px' }} />
             Spawn Mode
           </label>
         </div>
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
            nodesDraggable={!isSpawnMode}
            nodesConnectable={!isSpawnMode}
            elementsSelectable={true}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            fitView
         >
           <Panel position="top-left" style={{ display: 'flex', gap: '10px', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
             <button onClick={handleAddJunction} style={{ padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add Junction</button>
             <button onClick={handleAddExit} style={{ padding: '8px 16px', backgroundColor: '#9C27B0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add Exit Node</button>
             <button onClick={handleResetMap} style={{ padding: '8px 16px', backgroundColor: '#F44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reset Map</button>
           </Panel>
           <Background color="#333" gap={16} />
           <Controls />
         </ReactFlow>
      </div>
    </div>
  );
}
