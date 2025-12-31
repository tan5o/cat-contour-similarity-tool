import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * 予期しないランタイムエラーが発生した場合でも、UI全体のクラッシュを防ぐエラーバウンダリ。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>申し訳ありません、予期しないエラーが発生しました。</h1>
          <p>再読み込みするか、もう一度お試しください。</p>
          {this.state.message && <code className="error-message">{this.state.message}</code>}
          <button onClick={this.handleRetry}>再試行する</button>
        </div>
      );
    }

    return this.props.children;
  }
}
