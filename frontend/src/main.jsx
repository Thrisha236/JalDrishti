import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles/fonts.css';
import './styles/theme.css';
import './index.css';
import { loadData } from './data/seed';
import { DemoProvider } from './demo/DemoContext';
import { Ripple } from './components/water';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-muted">
    <Ripple tone="soft" />
    <p className="text-sm">Loading JalRakshak…</p>
  </div>,
);

loadData().then(() => {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <DemoProvider>
          <App />
        </DemoProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
});
