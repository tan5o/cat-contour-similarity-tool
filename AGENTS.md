# AGENTS.md

このファイルは、このリポジトリで作業するAIコーディングエージェント向けのガイダンスです。

## 0. 譲れないルール（境界線）

- **新しい依存関係（パッケージ）を勝手に追加しないこと**。明示的に要求された場合のみ追加する。
- `package-lock.json` を手動で修正しないこと。必ず `npm install` に任せる。
- **シークレット（秘密情報）をコミットしないこと**。本物のトークンやキーを出力・貼り付けしない。
- 変更は最小限かつ可逆的にすること。差分（Diff）は小さく保つ。
- 要件が曖昧な場合は、選択肢を提案し、最も安全なデフォルト実装を選択する。
- `package.json` の scripts に定義されたコマンドのみを使用すること。新しいコマンドを勝手に作らない。
- 機能（Feature）をまたぐ深い import を避けること。可能な限り各機能の公開 API (`index.ts`) を使用する。
- [src/ARCHITECTURE.md](src/ARCHITECTURE.md) で定義されたレイヤー依存ルールに従うこと。

## 1. 技術スタック

| カテゴリ        | 技術                      |
| :-------------- | :------------------------ | --- | ------------------------------------------ |
| React           | React 18                  |
| Build           | Vite 7                    |
| Language        | TypeScript (strict: true) |
| Package manager | **npm** ← これのみを使用  |
| Node            | ^20.19.0                  |     | >=22.12.0 (package.json の `engines` 参照) |
| Inference       | ONNX Runtime Web          |

## 2. セットアップと共通コマンド

```bash
npm install          # 依存関係のインストール
npm run dev          # 開発サーバーの起動
npm run build        # ビルド (package.json scripts 参照)
npm run build:pref   # 都道府県特徴量の事前計算 (ビルド前に必要)
npm run test         # ユニットテスト (Vitest, watchモード)
npm run test:run     # ユニットテスト (シングルラン)
npm run test:e2e     # E2Eテスト (Playwright)
```

Note: Playwright が利用可能です。UIの変更時や要求された場合は `npm run test:e2e` を実行してください。

## 3. プロジェクト構造

詳細は [src/ARCHITECTURE.md](src/ARCHITECTURE.md) を参照してください。

**クイックリファレンス:**

- `src/app/` – アプリの初期化とルーティング (ロジックは持たない)
- `src/pages/` – ルートレベルの画面
- `src/features/` – ドメインロジック (UI + hooks + lib + workers)
- `src/shared/` – ドメインに依存しないユーティリティ
- `public/assets/` – 静的ファイル (モデル, JSON)
- `tests/e2e/` – Playwright E2Eテスト

**Shared 配置ルール:** コードが2つ以上の機能で使用され、かつドメイン結合がない場合は `shared/` に移動する。

## 4. コーディング規約

- **関数コンポーネント + Hooks** を優先する。
- コンポーネントは小さく保つ。ロジックが肥大化した場合は Container/Presenter パターンで分割する。
- 命名規則:
  - Components: `PascalCase.tsx`
  - Hooks: `useXxx.ts`
  - Utils/libs: `camelCase.ts`
  - CSS: `ComponentName.css` (同階層に配置)
- 状態管理:
  - ローカルステートを優先する。必要な場合のみステートを持ち上げる（Lift state up）。
  - 重い計算は Web Workers (`features/*/workers/`) で行う。
- 現在、グローバルステート管理ライブラリは導入していない。シンプルに保つこと。

## 5. テスト戦略

| 種類               | ツール                         | 場所               |
| :----------------- | :----------------------------- | :----------------- |
| Unit / Integration | Vitest + React Testing Library | `src/**/*.test.ts` |
| E2E                | Playwright                     | `tests/e2e/`       |

- 実装の詳細ではなく、**振る舞い**のテストを優先する。
- バグ修正や複雑なロジックにはテストを追加・調整する。
- E2Eテストでは `@real-inference` タグを使用して、モックと実際のONNX推論の実行を区別している。
- `@real-inference` テストは遅く環境依存があるため、推論/モデル/記述子ロジックに触れる場合や、明示的に要求された場合のみ実行する。
- CIのマトリックスとタグは `.github/workflows/ci.yml` で定義されている（全ブラウザでモック実行、Chromiumのみで実推論実行）。

## 6. CI / 品質ゲート

CI は `.github/workflows/ci.yml` で定義されています。

変更を完了する前に、以下を確認してください:

```bash
npm run build        # TypeScript + ビルドが通ること
npm run test:run     # ユニットテストが通ること
npm run test:e2e     # E2Eテストが通ること (変更箇所に関連する場合)
```

## 7. Git / PR ワークフロー

- ブランチ名: `feature/...`, `fix/...`
- コミットメッセージ: Conventional Commits を推奨 (`feat:`, `fix:`, `docs:`, など)
- PR の説明には以下を含める:
  - **What** / **Why** (何をしたか / なぜしたか)
  - UI変更がある場合はスクリーンショット
  - テスト方法 (実行したコマンド + 範囲)

## 8. ディレクトリ固有の注意点

特定のディレクトリ下で作業する場合は、ネストされた `AGENTS.md` がないか確認し、最も近いものの指示に従うこと。

---

## 付録: 主要なドメイン概念

このプロジェクトは **猫のシルエット ↔ 都道府県の形状マッチングツール** です。

1. ユーザーが猫の写真をアップロードする。
2. セグメンテーションモデル (U2-Net) が猫のシルエットを抽出する。
3. 輪郭抽出 + 形状特徴量の計算を行う。
4. CNN埋め込み（主）+ 補助特徴量（Huモーメント、楕円フーリエ記述子等）で類似度を算出。
5. 類似度順に結果を表示する。

`features/cat-matching/` 内の主要モジュール:

- `lib/inference.ts` – U2-Net ONNX 推論ラッパー
- `lib/cnnEmbedding.ts` – 形状CNN埋め込み計算
- `lib/contour.ts` – 輪郭抽出
- `lib/descriptors.ts` – 補助特徴量（EFD, Huモーメント等）
- `lib/match.ts` – 類似度マッチング
- `workers/` – 重い計算用の Web Workers
