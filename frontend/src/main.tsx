import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import Sandbox from './Sandbox.tsx';
import { TrafficProvider } from './TrafficContext.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TrafficProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/sandbox" element={<Sandbox />} />
        </Routes>
      </BrowserRouter>
    </TrafficProvider>
  </React.StrictMode>,
);
