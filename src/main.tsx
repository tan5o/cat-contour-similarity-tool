import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/app/app';
import './index.css';

/**
 * アプリケーションのエントリーポイント。
 * Reactのルートを作成し、Appコンポーネントをレンダリングする。
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
