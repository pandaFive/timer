import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error(
    'ルート要素 #root が見つかりません。index.html を確認してください。',
  );
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
