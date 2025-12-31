import { AppProviders } from './providers';
import { AppRoutes } from './routes';

/**
 * アプリ層のエントリーポイント。
 * ルーティングとプロバイダの合成だけを担当する。
 */
export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}

export default App;
