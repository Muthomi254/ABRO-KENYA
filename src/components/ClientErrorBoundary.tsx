import React, { useEffect, useState } from "react";

interface ClientErrorBoundaryProps {
  children: React.ReactNode;
}

interface ClientErrorBoundaryState {
  hasError: boolean;
}

class ClientErrorBoundary extends React.Component<ClientErrorBoundaryProps, ClientErrorBoundaryState> {
  declare props: ClientErrorBoundaryProps;
  declare setState: (state: ClientErrorBoundaryState) => void;

  state: ClientErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ClientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Unhandled client render error:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          className="flex min-h-screen items-center justify-center bg-[#030e1a] px-5 text-slate-100"
          role="alert"
        >
          <section className="w-full max-w-lg rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-2xl">
            <h1 className="text-lg font-bold text-rose-300">The app hit an unexpected error</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This page could not render correctly. Try again or reload the app. If this keeps
              happening, contact support.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500"
              >
                Reload app
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function ClientRuntimeErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      if (event.target !== window) return;

      console.error("Unhandled client runtime error:", event.error || event.message);
      setMessage("A part of the app encountered an unexpected error. Try again or reload the app.");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled client promise rejection:", event.reason);
      setMessage("An operation could not be completed. Try again or reload the app.");
    };

    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      className="fixed left-1/2 top-3 z-[100] flex w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-rose-400/30 bg-[#3b1018] px-4 py-3 text-sm text-rose-100 shadow-xl"
      role="alert"
      aria-live="assertive"
    >
      <span>{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-400"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="rounded-md px-2 py-1.5 text-xs font-semibold text-rose-100 hover:bg-white/10"
          aria-label="Dismiss error message"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function AppClientErrorBoundary({ children }: ClientErrorBoundaryProps) {
  return (
    <ClientErrorBoundary>
      <ClientRuntimeErrorNotice />
      {children}
    </ClientErrorBoundary>
  );
}
