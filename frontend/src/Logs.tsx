import { useState } from 'react';
import { useTrafficContext } from './TrafficContext';
import { Link } from 'react-router-dom';

export default function Logs() {
  const { eventLogs, realtimeNodes } = useTrafficContext();
  const [selectedNode, setSelectedNode] = useState<string>('');

  const nodeIds = Object.keys(realtimeNodes);
  if (nodeIds.length > 0 && !selectedNode) {
    setSelectedNode(nodeIds[0]);
  }

  const selectedNodeData = selectedNode ? realtimeNodes[selectedNode] : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#121212', color: 'white' }}>
      <header style={{ padding: '15px 30px', backgroundColor: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
        <h2 style={{ margin: 0, color: '#03a9f4' }}>Debug & System Logs</h2>
        <div>
          <Link to="/" style={{ color: '#fff', textDecoration: 'none', padding: '8px 16px', backgroundColor: '#333', borderRadius: '4px', marginRight: '10px' }}>Back to Dashboard</Link>
          <Link to="/sandbox" style={{ color: '#fff', textDecoration: 'none', padding: '8px 16px', backgroundColor: '#333', borderRadius: '4px' }}>Sandbox</Link>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Pane: Event Logs */}
        <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginTop: 0 }}>System Action Logs</h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', fontSize: '13px', fontFamily: 'monospace', backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '6px' }}>
            {[...eventLogs].reverse().map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', borderBottom: '1px solid #2a2a2a', paddingBottom: '4px' }}>
                <span style={{ color: '#888' }}>[{log.time}]</span> <strong style={{ color: '#ffb300' }}>{log.node}</strong>: <span style={{ color: '#ccc' }}>{log.msg}</span>
              </div>
            ))}
            {eventLogs.length === 0 && <div style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>Waiting for actions...</div>}
          </div>
        </div>

        {/* Right Pane: Telemetry Inspector */}
        <div style={{ width: '400px', padding: '20px', backgroundColor: '#1a1a1a', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginTop: 0, color: '#4caf50' }}>Live Telemetry Inspector</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ marginRight: '10px' }}>Select Node:</label>
            <select 
              value={selectedNode} 
              onChange={e => setSelectedNode(e.target.value)}
              style={{ padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', width: '200px' }}
            >
              <option value="">-- None --</option>
              {nodeIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {selectedNodeData ? (
            <div style={{ backgroundColor: '#222', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#ffb300' }}>{selectedNodeData.node} Details</h4>
              <p><strong>Density:</strong> {selectedNodeData.density}%</p>
              <p><strong>Status:</strong> {selectedNodeData.status || 'N/A'}</p>
              <p style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <strong>Light State:</strong> 
                <pre style={{ margin: 0, color: '#aaa' }}>{JSON.stringify(selectedNodeData.light, null, 2)}</pre>
              </p>
              
              <h4 style={{ margin: '20px 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Live Status</h4>
              <p style={{ margin: '0 0 10px 0' }}><strong>Proactive Incoming:</strong> {selectedNodeData.incoming || 0} messages pending</p>
              {selectedNodeData.cv_telemetry ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {Object.entries(selectedNodeData.cv_telemetry).map(([dir, data]: [string, any]) => {
                    const lightColor = typeof selectedNodeData.light === 'object' ? (selectedNodeData.light as Record<string, string>)[dir] || 'Red' : 'Red';
                    const isGreen = lightColor === 'Green';
                    return (
                      <div key={dir} style={{ backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontWeight: 'bold', color: '#03a9f4' }}>Lane {dir}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: isGreen ? '#4caf50' : '#f44336', boxShadow: `0 0 5px ${isGreen ? '#4caf50' : '#f44336'}` }} />
                            <span style={{ fontSize: '12px', color: isGreen ? '#4caf50' : '#f44336' }}>{lightColor}</span>
                          </div>
                        </div>
                        {isGreen && selectedNodeData.remaining_time !== undefined && (
                          <div style={{ fontSize: '12px', color: '#ffd54f', marginBottom: '4px' }}>
                            Switching in: {selectedNodeData.remaining_time}s
                          </div>
                        )}
                        <div style={{ fontSize: '13px' }}>Cars: <span style={{ color: '#fff' }}>{data.car_count}</span></div>
                        <div style={{ fontSize: '13px' }}>Density: <span style={{ color: '#fff' }}>{(data.density * 100).toFixed(0)}%</span></div>
                        {data.ambulance && <div style={{ fontSize: '12px', color: '#f44336', marginTop: '5px', fontWeight: 'bold' }}>AMBULANCE DETECTED</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#666' }}>No CV telemetry available yet.</p>
              )}
            </div>
          ) : (
            <p style={{ color: '#666' }}>Select a node to inspect its variables.</p>
          )}
        </div>
      </div>
    </div>
  );
}
