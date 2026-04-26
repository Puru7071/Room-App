"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { passwordToggleButton } from "../styles";

type PasswordToggleProps = {
  show: boolean;
  onToggle: () => void;
};

/**
 * Eye toggle that lives at the right edge of a password `cellField`.
 * `tabIndex={-1}` keeps tab order moving through the form fields rather than
 * detouring through the toggle.
 */
export function PasswordToggle({ show, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      className={passwordToggleButton}
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
      tabIndex={-1}
    >
      <AppIcon
        icon={show ? "line-md:watch-off-loop" : "line-md:watch-loop"}
        className="h-5 w-5"
        aria-hidden
      />
    </button>
  );
}
