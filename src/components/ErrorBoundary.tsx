import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** レンダリングエラー時にフォールバックUIを表示するError Boundary */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('アプリケーションエラー:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>エラーが発生しました</h2>
          <p>ページを再読み込みしてください。</p>
          <button onClick={() => window.location.reload()}>再読み込み</button>
        </div>
      );
    }
    return this.props.children;
  }
}
