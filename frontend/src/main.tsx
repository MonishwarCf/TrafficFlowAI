import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.tsx';
import Sandbox from './Sandbox.tsx';
import Logs from './Logs.tsx';
import { TrafficProvider } from './TrafficContext.tsx';
import './index.css';

function Layout() {
  const location = useLocation();
  return (
    <>
      <div style={{ display: location.pathname === '/' ? 'block' : 'none', height: '100vh' }}>
        <App />
      </div>
      <div style={{ display: location.pathname === '/sandbox' ? 'block' : 'none', height: '100vh' }}>
        <Sandbox />
      </div>
      <div style={{ display: location.pathname === '/logs' ? 'block' : 'none', height: '100vh' }}>
        <Logs />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TrafficProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </TrafficProvider>
  </React.StrictMode>,
);
