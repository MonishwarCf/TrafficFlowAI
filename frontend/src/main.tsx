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
      <div style={{ 
        position: location.pathname === '/sandbox' ? 'relative' : 'absolute',
        opacity: location.pathname === '/sandbox' ? 1 : 0,
        pointerEvents: location.pathname === '/sandbox' ? 'auto' : 'none',
        zIndex: location.pathname === '/sandbox' ? 1 : -9999,
        width: '100%',
        height: '100vh'
      }}>
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
