import { CatMatchingPage } from '@/pages/cat-matching';

/**
 * ルート定義。必要に応じて将来 Router に差し替えられる薄い層。
 * FSD: app層はルーティング定義のみ、画面実装は pages層 に委譲
 */
export function AppRoutes() {
  return <CatMatchingPage />;
}
