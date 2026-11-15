import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import { useGame } from './state/store.js';

// Exposed for the end-to-end tests (tests/e2e) and for debugging in the console.
if (import.meta.env.DEV) window.__game = useGame;

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
