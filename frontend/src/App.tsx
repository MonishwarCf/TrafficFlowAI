import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTrafficWebSocket } from './hooks/useTrafficWebSocket';
import './App.css';

function App() {
  const { nodes, history, connected } = useTrafficWebSocket();

  const getStatusColor = (status: string) => {
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
        <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </header>
      <div className="nodes-grid">
        {Object.values(nodes).map((nodeData) => (
          <div className="node-card" key={nodeData.node} style={{ borderTopColor: getStatusColor(nodeData.status) }}>
            <h2>{nodeData.node}</h2>
            <div className="density-meter">
              <div 
                className="density-fill" 
                style={{ 
                  width: `${nodeData.density}%`, 
                  backgroundColor: getStatusColor(nodeData.status) 
                }}
              ></div>
            </div>
            <div className="node-details">
              <p>Density: {nodeData.density}%</p>
              <p>Status: <strong>{nodeData.status}</strong></p>
              <p className="timestamp">Last updated: {new Date(nodeData.timestamp * 1000).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="chart-container" style={{ marginTop: '40px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Real-Time Traffic Density (Last 20 Readings)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="density" stroke="#8884d8" activeDot={{ r: 8 }} name="Density (%)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
