import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const AdminApp = React.lazy(() => import('./admin/AdminApp'));
const TrackingApp = React.lazy(() => import('./TrackingApp'));
const isAdmin = window.location.pathname.startsWith('/admin');
const isTracking = window.location.pathname === '/acompanhar' || window.location.pathname.startsWith('/pedido/');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#171513' }} />}><AdminApp /></React.Suspense> : isTracking ? <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#f2e9dc' }} />}><TrackingApp /></React.Suspense> : <App />}
  </React.StrictMode>,
);
