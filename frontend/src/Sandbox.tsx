import { useState, useEffect, useMemo, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls,
  Panel,
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Link } from 'react-router-dom';
import CustomJunctionNode from './CustomJunctionNode';
import VehicleEdge from './VehicleEdge';
import ExitNode from './ExitNode';
import StartNode from './StartNode';
import { useTrafficContext } from './TrafficContext';


export default function Sandbox() {
  const { 
    nodes, setNodes, onNodesChange, 
    edges, setEdges, onEdgesChange, onConnect,
    isSpawnMode, setIsSpawnMode,
    totalCarsFinished,
    avgWaitCompleted, avgWaitActive, tMax, throughput,
    realtimeNodes, connected, sendTopologyUpdate
  } = useTrafficContext();
  
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [spawnCount, setSpawnCount] = useState<number>(5);
  const [globalMode, setGlobalMode] = useState<'STATIC' | 'AI'>('STATIC');
  const [spawnAmbulance, setSpawnAmbulance] = useState<boolean>(false);
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simLoading, setSimLoading] = useState<boolean>(false);

  const nodeTypes = useMemo(() => ({ junction: CustomJunctionNode, exit: ExitNode, start: StartNode }), []);
  const edgeTypes = useMemo(() => ({ vehicle: VehicleEdge }), []);

  const sentEdges = useRef<Set<string>>(new Set());
  const sentNodes = useRef<Set<string>>(new Set());
  const nextNodeId = useRef<number>(1000);

  const handleStartSim = async () => {
    setSimLoading(true);
    try {
      await fetch('http://localhost:8001/sim/start', { method: 'POST' });
      setSimRunning(true);
    } catch (e) { console.error('Failed to start sim', e); }
    setSimLoading(false);
  };

  const handleStopSim = async () => {
    setSimLoading(true);
    try {
      await fetch('http://localhost:8001/sim/stop', { method: 'POST' });
      setSimRunning(false);
    } catch (e) { console.error('Failed to stop sim', e); }
    setSimLoading(false);
  };

  useEffect(() => {
    if (!connected) return;
    nodes.forEach(n => {
      if (!sentNodes.current.has(n.id) && n.type === 'junction') {
        sentNodes.current.add(n.id);
        sendTopologyUpdate({ type: 'add_node', id: n.id });
      }
    });
  }, [nodes, sendTopologyUpdate, connected]);

  useEffect(() => {
    if (!connected) return;
    edges.forEach(e => {
      if (!sentEdges.current.has(e.id)) {
        sentEdges.current.add(e.id);
        const sourceDir = e.sourceHandle ? e.sourceHandle.split('_')[0] : 'S';
        const targetDir = e.targetHandle ? e.targetHandle.split('_')[0] : 'N';
        sendTopologyUpdate({ 
          type: 'add_edge', 
          source: e.source, 
          target: e.target,
          sourceDir,
          targetDir
        });
      }
    });
  }, [edges, sendTopologyUpdate, connected]);

  useEffect(() => {
    setNodes(nds => {
      let hasChanges = false;
      const newNds = nds.map(n => {
        const realTimeNode = realtimeNodes[n.id];
        if (realTimeNode) {
          const lightChanged = JSON.stringify(realTimeNode.light) !== JSON.stringify(n.data.light);
          const densityChanged = realTimeNode.density !== n.data.density;
          const statusChanged = realTimeNode.status !== n.data.status;
          
          if (lightChanged || densityChanged || statusChanged) {
            hasChanges = true;
            return { 
              ...n, 
              data: { 
                ...n.data, 
                light: realTimeNode.light,
                density: realTimeNode.density,
                status: realTimeNode.status
              } 
            };
          }
        }
        return n;
      });
      return hasChanges ? newNds : nds;
    });

    setEdges(eds => {
      let hasEdgeChanges = false;
      const newEds = eds.map(e => {
        const targetNode = realtimeNodes[e.target];
        const targetNodeType = nodes.find(n => n.id === e.target)?.type;
        const sourceNodeType = nodes.find(n => n.id === e.source)?.type;
        
        let changed = false;
        let updatedData = { ...e.data };
        
        if (updatedData.targetNodeType !== targetNodeType) {
          updatedData.targetNodeType = targetNodeType;
          changed = true;
        }
        if (updatedData.sourceNodeType !== sourceNodeType) {
          updatedData.sourceNodeType = sourceNodeType;
          changed = true;
        }

        const sourceNode = realtimeNodes[e.source];
        if (sourceNode && typeof sourceNode.light === 'object') {
          const handleDir = e.sourceHandle ? e.sourceHandle.split('_')[0] : 'S';
          const newSourceLight = sourceNode.light[handleDir as keyof typeof sourceNode.light] || 'Red';
          if (updatedData.sourceLight !== newSourceLight) {
            updatedData.sourceLight = newSourceLight;
            changed = true;
          }
        } else if (sourceNode && updatedData.sourceLight !== sourceNode.light) {
          updatedData.sourceLight = sourceNode.light;
          changed = true;
        }
        
        if (targetNode && typeof targetNode.light === 'object') {
          const handleDir = e.targetHandle ? e.targetHandle.split('_')[0] : 'N';
          const newTargetLight = targetNode.light[handleDir as keyof typeof targetNode.light] || 'Red';
          if (updatedData.targetLight !== newTargetLight) {
            updatedData.targetLight = newTargetLight;
            changed = true;
          }
        } else if (targetNode && updatedData.targetLight !== targetNode.light) {
          updatedData.targetLight = targetNode.light;
          changed = true;
        }
        
        if (changed) hasEdgeChanges = true;
        return changed ? { ...e, data: updatedData } : e;
      });
      return hasEdgeChanges ? newEds : eds;
    });
  }, [realtimeNodes, setNodes, setEdges, nodes]);



  // Logic removed (hoisted to TrafficContext)

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
    
    const selectedEdge = edges.find(e => e.id === selectedEdgeId);
    if (selectedEdge && selectedEdge.target) {
        sendTopologyUpdate({
            type: 'proactive_message',
            source: selectedEdge.source || 'spawner',
            target: selectedEdge.target,
            count: spawnCount
        });
    }

    setEdges(eds => eds.map(e => {
      if (e.id === selectedEdgeId) {
        return { 
          ...e, 
          data: { 
            ...e.data, 
            spawnTrigger: Date.now(), 
            spawnCount,
            spawnType: spawnAmbulance ? 'Ambulance' : 'Car'
          } 
        };
      }
      return e;
    }));
  };

  const handleAddJunction = () => {
    const id = `Node${nextNodeId.current++}`;
    setNodes(nds => [...nds, { id, type: 'junction', position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 }, data: { label: id, light: { N: 'Red', S: 'Red', E: 'Red', W: 'Red' } } }]);
  };

  const handleAddStart = () => {
    const id = `Start${nextNodeId.current++}`;
    setNodes(nds => [...nds, { id, type: 'start', position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 100 }, data: { label: id } }]);
  };

  const handleAddExit = () => {
    const id = `Exit${nextNodeId.current++}`;
    setNodes(nds => [...nds, { id, type: 'exit', position: { x: Math.random() * 200 + 300, y: Math.random() * 200 + 100 }, data: { label: id } }]);
  };

  const handleResetMap = () => {
    setNodes([]);
    setEdges([]);
    setSelectedEdgeId(null);
    sendTopologyUpdate({ type: 'reset' });
  };

  const handleToggleMode = () => {
    const newMode = globalMode === 'STATIC' ? 'AI' : 'STATIC';
    setGlobalMode(newMode);
    sendTopologyUpdate({ type: 'set_mode', mode: newMode });
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#121212', color: 'white' }}>
      <header style={{ padding: '15px 30px', backgroundColor: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h2 style={{ margin: 0, color: '#4caf50' }}>Traffic AI Sandbox (React Flow)</h2>
          <div style={{ background: '#252525', padding: '8px 20px', borderRadius: '6px', fontSize: '14px', display: 'flex', gap: '20px', alignItems: 'center', border: '1px solid #333' }}>
            <div>Avg Wait (Completed): <strong style={{ color: '#4caf50', fontSize: '16px' }}>{avgWaitCompleted}s</strong></div>
            <div style={{ borderLeft: '1px solid #444', height: '18px' }} />
            <div>Avg Wait (Active): <strong style={{ color: '#ffeb3b', fontSize: '16px' }}>{avgWaitActive}s</strong></div>
            <div style={{ borderLeft: '1px solid #444', height: '18px' }} />
            <div>Max Wait: <strong style={{ color: '#f44336', fontSize: '16px' }}>{tMax}s</strong></div>
            <div style={{ borderLeft: '1px solid #444', height: '18px' }} />
            <div>Throughput: <strong style={{ color: '#00bcd4', fontSize: '16px' }}>{throughput} cars/min</strong> <span style={{ color: '#888' }}>(Completed: {totalCarsFinished})</span></div>
          </div>
        </div>
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
            <label style={{ marginLeft: '15px', color: '#ff5252', fontWeight: 'bold' }}>
              <input type="checkbox" checked={spawnAmbulance} onChange={e => setSpawnAmbulance(e.target.checked)} style={{ marginRight: '8px' }} />
              +Ambulance
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
             <button onClick={handleAddStart} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add Start Node</button>
             <button onClick={handleAddExit} style={{ padding: '8px 16px', backgroundColor: '#9C27B0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add Exit Node</button>
             <button onClick={handleResetMap} style={{ padding: '8px 16px', backgroundColor: '#F44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reset Map</button>
             <button onClick={handleToggleMode} style={{ padding: '8px 16px', backgroundColor: globalMode === 'AI' ? '#FFD700' : '#777', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
               Mode: {globalMode === 'STATIC' ? 'Static Timers' : 'Smart AI'}
             </button>
             {/* Sim Start / Stop */}
             <button
               onClick={simRunning ? handleStopSim : handleStartSim}
               disabled={simLoading}
               style={{
                 padding: '8px 18px',
                 backgroundColor: simRunning ? '#ff5722' : '#00c853',
                 color: 'white',
                 border: 'none',
                 borderRadius: '4px',
                 cursor: simLoading ? 'not-allowed' : 'pointer',
                 fontWeight: 'bold',
                 opacity: simLoading ? 0.6 : 1,
                 minWidth: '110px'
               }}
             >
               {simLoading ? '...' : simRunning ? '⏹ Stop Sim' : '▶ Start Sim'}
             </button>
           </Panel>
           <Background color="#333" gap={16} />
           <Controls />
         </ReactFlow>
      </div>
    </div>
  );
}
