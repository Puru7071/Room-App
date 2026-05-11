"use client";

import { useContext, type ReactNode } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { ThemeContext } from "@/components/client/theme/ThemeContext";
import { HEADER_CLUSTER_CIRCLE_LAYOUT } from "@/components/client/home/headerClusterStyles";
import { LogoutButton } from "@/components/client/home/LogoutButton";
import { UserAvatar } from "@/components/client/home/UserAvatar";

type HomeHeaderActionsProps = {
  /** Left of private toggle / theme (e.g. member facepile). */
  beforePrivateToggle?: ReactNode;
  /** Rendered to the left of the theme switcher (e.g. room private toggle). */
  beforeTheme?: ReactNode;
  /** Rendered immediately before the theme button (e.g. room member facepile). */
  beforeThemeToggle?: ReactNode;
  /** Rendered to the right of the theme switcher, before logout/avatar
   *  (e.g. room settings gear). */
  afterTheme?: ReactNode;
  /**
   * Show a circular logout button + user avatar to the right of the theme
   * toggler. Both home and room headers opt in.
   */
  showLogout?: boolean;
};

export function HomeHeaderActions({
  beforePrivateToggle,
  beforeTheme,
  beforeThemeToggle,
  afterTheme,
  showLogout,
}: HomeHeaderActionsProps) {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("HomeHeaderActions requires ThemeProvider");
  }
  const { theme, toggleTheme } = ctx;
  const isDark = theme === "dark";

  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
      {beforePrivateToggle}
      {beforeTheme}
      {beforeThemeToggle}
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => toggleTheme(e.clientX, e.clientY)}
        className={`${HEADER_CLUSTER_CIRCLE_LAYOUT} cursor-pointer border border-border bg-card/90 text-muted shadow-sm transition hover:border-border hover:bg-card`}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? (
          <AppIcon
            icon="line-md:sunny-filled-loop"
            className="h-[18px] w-[18px] sm:h-5 sm:w-5"
            aria-hidden
          />
        ) : (
          <AppIcon
            icon="line-md:moon-rising-filled-loop"
            className="h-[18px] w-[18px] sm:h-5 sm:w-5"
            aria-hidden
          />
        )}
      </button>
      {afterTheme}
      {showLogout ? (
        <>
          <LogoutButton />
          <UserAvatar />
        </>
      ) : null}
    </div>
  );
}
