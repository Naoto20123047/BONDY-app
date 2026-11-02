import { Component, type ErrorInfo, type ReactNode } from "react";
import "./errorBoundary.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * これが変わったら、エラーの表示を解いて描画し直す。
   * 画面の場所(パス)を渡しておくと、別の画面に移ったときに元に戻る
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 表示中の例外を受け止める(v1.4.1)。
 *
 * 以前はどこか1か所で表示の例外が出ると、アプリ全体が真っ白になった。
 * データに想定外の型の値が1件入っているだけで、その画面を開いた全員が
 * 何も操作できなくなる(セキュリティ監査 v1.4.0 の 2-1)。
 *
 * ここで受け止め、メニューは残したまま「表示できない内容があります」とだけ出す。
 * 別の画面に移れば元に戻る。データの型そのものは firestore.rules と lib/sanitize.ts で守っている。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("画面の表示中にエラーが発生しました", error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <i className="ti ti-alert-triangle error-boundary-icon" />
        <p className="error-boundary-title">この画面に表示できない内容があります</p>
        <p className="error-boundary-text">
          ほかの画面は使えます。何度も起きる場合は、開いた画面と時刻を幹部に知らせてください。
        </p>
        <button className="error-boundary-retry" onClick={() => this.setState({ hasError: false })}>
          もう一度表示する
        </button>
      </div>
    );
  }
}
