import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls,
  Panel,
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTrafficWebSocket } from './hooks/useTrafficWebSocket';
import { Link } from 'react-router-dom';
import CustomJunctionNode from './CustomJunctionNode';
import VehicleEdge from './VehicleEdge';
import ExitNode from './ExitNode';
import StartNode from './StartNode';
import { useTrafficContext, TransferBus } from './TrafficContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Sandbox() {
  const { sendTopologyUpdate, nodes: realtimeNodes, connected, eventLogs } = useTrafficWebSocket();
  const { 
    nodes, setNodes, onNodesChange, 
    edges, setEdges, onEdgesChange, onConnect,
    isSpawnMode, setIsSpawnMode 
  } = useTrafficContext();
  
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [spawnCount, setSpawnCount] = useState<number>(5);
  const [totalCarsFinished, setTotalCarsFinished] = useState<number>(0);
  const [globalMode, setGlobalMode] = useState<'STATIC' | 'AI'>('STATIC');
  const [cityPainIndex, setCityPainIndex] = useState<number>(0);
  const [spawnAmbulance, setSpawnAmbulance] = useState<boolean>(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);

  const nodeTypes = useMemo(() => ({ junction: CustomJunctionNode, exit: ExitNode, start: StartNode }), []);
  const edgeTypes = useMemo(() => ({ vehicle: VehicleEdge }), []);

  const sentEdges = useRef<Set<string>>(new Set());
  const sentNodes = useRef<Set<string>>(new Set());
  const nextNodeId = useRef<number>(1000);

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

  const reportWaitingCars = useCallback((_edgeId: string, targetNodeId: string, direction: string, waitingCars: number, density: number, hasAmbulance: boolean) => {
    sendTopologyUpdate({
      type: 'vision_sensor',
      nodeId: targetNodeId,
      direction: direction,
      waitingCars: waitingCars,
      density: density,
      hasAmbulance: hasAmbulance
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

  const edgesRef = useRef(edges);
  edgesRef.current = edges;

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
        
        sendTopologyUpdate({
            type: 'proactive_message',
            source: nodeId,
            target: nextNodeId,
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

    return () => {
       TransferBus.removeEventListener('transfer', handleTransfer);
       TransferBus.removeEventListener('vehicle_completed', handleCompleted);
       TransferBus.removeEventListener('pain_report', handlePainReport);
    }
  }, [sendTopologyUpdate]);

  const cityPainRef = useRef(0);
  const throughputRef = useRef(0);
  cityPainRef.current = cityPainIndex;
  throughputRef.current = totalCarsFinished;

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
    setTotalCarsFinished(0);
    sentNodes.current.clear();
    sentEdges.current.clear();
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
          <div style={{ background: '#333', padding: '5px 15px', borderRadius: '4px', fontSize: '14px' }}>
            City Pain Index: <strong style={{ color: '#ffeb3b', fontSize: '18px' }}>{Math.round(cityPainIndex)}</strong> 
            <span style={{ marginLeft: '10px', color: '#888' }}>(Throughput: {totalCarsFinished})</span>
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
           </Panel>
           <Panel position="bottom-left" style={{ width: '450px', height: '250px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '8px', zIndex: 10 }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'white', textAlign: 'center' }}>Live Performance Metrics</h4>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="time" stroke="#aaa" tick={{fontSize: 10}} />
                <YAxis yAxisId="left" stroke="#ffeb3b" width={40} />
                <YAxis yAxisId="right" orientation="right" stroke="#4caf50" width={40} />
                <Tooltip contentStyle={{ backgroundColor: '#222', border: 'none', color: '#fff' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="pain" stroke="#ffeb3b" name="Pain Index" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="throughput" stroke="#4caf50" name="Throughput" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
          <Panel position="bottom-right" style={{ width: '350px', height: '250px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '8px', zIndex: 10, display: 'flex', flexDirection: 'column' }}>
             <h4 style={{ margin: '0 0 10px 0', color: '#03a9f4', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px' }}>System Logs</h4>
             <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', fontSize: '11px', fontFamily: 'monospace' }}>
               {[...eventLogs].reverse().map((log, i) => (
                 <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid #222', paddingBottom: '2px' }}>
                   <span style={{ color: '#888' }}>[{log.time}]</span> <strong style={{ color: '#ffb300' }}>{log.node}</strong>: <span style={{ color: '#ccc' }}>{log.msg}</span>
                 </div>
               ))}
               {eventLogs.length === 0 && <div style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>No logs yet...</div>}
             </div>
           </Panel>
           <Background color="#333" gap={16} />
           <Controls />
         </ReactFlow>
      </div>
    </div>
  );
}
