
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTrafficContext } from './TrafficContext';
import './App.css';

function App() {
  const { realtimeNodes: nodes, history, connected, metricsHistory, cityPainIndex } = useTrafficContext();

  const getStatusColor = (status: string | undefined, light: string | Record<string, string> | undefined) => {
    let dominantLight = light;
    if (typeof light === 'object') {
      // Just pick North or the first green light to represent status color
      dominantLight = Object.values(light).includes('Green') ? 'Green' : 'Red';
    }
    if (dominantLight === 'Green') return '#4caf50';
    if (dominantLight === 'Red') return '#f44336';
    switch(status) {
      case 'Normal': return '#4caf50';
      case 'Heavy': return '#ff9800';
      case 'Congested': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  // Format data for chart
  const chartData = history.map((d, index) => ({
    time: new Date(d.timestamp * 1000).toLocaleTimeString(),
    density: d.density,
    node: d.node,
    index: index, // unique key based on order
  }));

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>TrafficFlow AI Dashboard</h1>
        <div>
            <Link to="/sandbox" style={{ marginRight: 20, color: '#fff', textDecoration: 'underline' }}>Go to Sandbox</Link>
            <Link to="/logs" style={{ marginRight: 20, color: '#03a9f4', textDecoration: 'underline' }}>Debug & Logs</Link>
            <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
        </div>
      </header>
      <div className="nodes-grid">
        {Object.values(nodes).map((nodeData) => (
          <div className="node-card" key={nodeData.node} style={{ borderTopColor: getStatusColor(nodeData.status, nodeData.light) }}>
            <h2>{nodeData.node}</h2>
            <div className="density-meter">
              <div 
                className="density-fill" 
                style={{ 
                  width: `${nodeData.density}%`, 
                  backgroundColor: getStatusColor(nodeData.status, nodeData.light) 
                }}
              ></div>
            </div>
            <div className="node-details">
              <p>Density: {nodeData.density}%</p>
              <p>Light: <strong>{typeof nodeData.light === 'object' ? Object.entries(nodeData.light).map(([k,v]) => `${k}:${v}`).join(' ') : (nodeData.light || 'Unknown')}</strong></p>
              <p>Status: <strong>{nodeData.status || 'N/A'}</strong></p>
              <p className="timestamp">Last updated: {new Date(nodeData.timestamp * 1000).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="chart-container" style={{ marginTop: '40px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', gap: '20px' }}>
        
        <div style={{ flex: 1 }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Real-Time Traffic Density</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 60]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="density" stroke="#8884d8" activeDot={{ r: 8 }} name="Density (%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, borderLeft: '1px solid #eee', paddingLeft: '20px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '5px' }}>Live Performance Metrics</h2>
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>Avg Active Wait: <strong style={{ color: '#ff9800' }}>{cityPainIndex}s</strong></span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={metricsHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" stroke="#666" tick={{fontSize: 10}} />
              <YAxis stroke="#ff9800" width={40} domain={[0, 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pain" stroke="#ff9800" name="Avg Active Wait (s)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}

export default App;
