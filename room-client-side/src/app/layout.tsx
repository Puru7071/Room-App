import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { AppErrorBoundary } from "@/components/client/AppErrorBoundary";
import { AppToaster } from "@/components/client/AppToaster";
import { ThemeProvider } from "@/components/client/theme/ThemeContext";
import { APP_DISPLAY_NAME } from "@/lib/app-constants";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  adjustFontFallback: true,
});

/** Distinct from Geist — used only for the chat composer GIF label. */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["600", "700"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description:
    "Watch YouTube in sync with friends or groups—parties, playlists, news, class, or memes—in one shared room.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <ThemeProvider>
          <AppErrorBoundary>{children}</AppErrorBoundary>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
