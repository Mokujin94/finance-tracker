import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { applyTheme, getInitialTheme } from './theme';

applyTheme(getInitialTheme());

// HashRouter — чтобы прямые ссылки работали на GitHub Pages без серверных редиректов.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
