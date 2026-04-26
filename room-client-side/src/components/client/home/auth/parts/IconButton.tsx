"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { ctaIconBack, ctaIconCreate, ctaIconJoin } from "../styles";

type IconButtonVariant = "join" | "create" | "back";

type IconButtonProps = {
  variant: IconButtonVariant;
  /** Icon name (e.g. `"lucide:check"`, `"lucide:arrow-left"`). Replaced
   *  by an animated loader when `loading` is true. */
  icon: string;
  /** Used for both `aria-label` and `title` so screen readers and tooltips
   *  pick up the same copy. */
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  /** When true, swap the icon for the line-md loading-twotone-loop animation
   *  and set `aria-busy`. The button stays interactive only if it's not also
   *  `disabled`. */
  loading?: boolean;
};

/**
 * Circular gradient/grey icon button. Three variants:
 * - `"join"` — violet gradient (Log in tick).
 * - `"create"` — blue gradient (Sign up / Verify code tick).
 * - `"back"` — neutral grey (left-arrow back button).
 */
export function IconButton({
  variant,
  icon,
  label,
  type = "button",
  onClick,
  disabled,
  loading,
}: IconButtonProps) {
  const className =
    variant === "join"
      ? ctaIconJoin
      : variant === "create"
        ? ctaIconCreate
        : ctaIconBack;
  const renderedIcon = loading ? "line-md:loading-twotone-loop" : icon;
  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-busy={loading || undefined}
    >
      <AppIcon icon={renderedIcon} className="h-5 w-5" aria-hidden />
    </button>
  );
}
