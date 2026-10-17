import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import { loadData } from './data/seed';
import { DemoProvider } from './demo/DemoContext';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<p className="p-8 text-center text-muted">Loading JalRakshak…</p>);

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
