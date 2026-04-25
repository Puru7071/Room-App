"use client";

import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import toast from "react-hot-toast";

function AppErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <p className="max-w-sm text-center text-sm text-zinc-600">
        Something went wrong. You can try again, or refresh the page.
      </p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={AppErrorFallback}
      onError={(error) => {
        console.error(error);
        toast.error("Something went wrong. Please try again.");
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
