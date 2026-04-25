"use client";

import type { CSSProperties } from "react";
import { Toaster } from "react-hot-toast";

/**
 * Compact, solid-white toast.
 * Variants (success/error) share the same body and differ only by the icon
 * color, so the visual weight stays consistent.
 */
const toastBaseStyle: CSSProperties = {
  borderRadius: 12,
  padding: "8px 14px",
  minHeight: 0,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: "-0.005em",
  maxWidth: 420,
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  boxShadow:
    "0 8px 24px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)",
};

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 16 }}
      toastOptions={{
        duration: 3600,
        style: toastBaseStyle,
        success: {
          duration: 3000,
          iconTheme: { primary: "#059669", secondary: "#ffffff" },
        },
        error: {
          duration: 4200,
          iconTheme: { primary: "#dc2626", secondary: "#ffffff" },
        },
      }}
    />
  );
}
