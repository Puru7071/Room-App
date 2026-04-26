"use client";

import { useContext, type ReactNode } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { ThemeContext } from "@/components/client/theme/ThemeContext";
import { LogoutButton } from "@/components/client/home/LogoutButton";
import { UserAvatar } from "@/components/client/home/UserAvatar";

type HomeHeaderActionsProps = {
  /** Left of private toggle / theme (e.g. member facepile). */
  beforePrivateToggle?: ReactNode;
  /** Rendered to the left of the theme switcher (e.g. room private toggle). */
  beforeTheme?: ReactNode;
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
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => toggleTheme(e.clientX, e.clientY)}
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card/90 text-muted shadow-sm transition hover:border-border hover:bg-card sm:h-10 sm:w-10"
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
