import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AuthGate from './AuthGate';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
