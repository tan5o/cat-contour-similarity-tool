import type { PropsWithChildren } from 'react';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';

/**
 * グローバルなProviderをまとめるエントリ。
 * 追加のProviderはここでラップする。
 */
export function AppProviders({ children }: PropsWithChildren) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
