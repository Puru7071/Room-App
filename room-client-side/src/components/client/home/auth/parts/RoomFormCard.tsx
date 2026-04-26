"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import {
  cellInput,
  ctaInlineCreate,
  ctaInlineJoin,
  rowChrome,
} from "../styles";

type RoomFormCardVariant = "create" | "join";

type RoomFormCardProps = {
  /** DOM id for the input + label association. */
  id: string;
  /** Visible-only-to-screen-readers label. */
  label: string;
  placeholder: string;
  /** Visible button copy when not loading. */
  buttonText: string;
  variant: RoomFormCardVariant;
  /** Controlled input value (lifted to the parent so submit handlers can read it). */
  value: string;
  onChange: (value: string) => void;
  /** Locks the form (e.g. while a submit is mid-flight). */
  disabled?: boolean;
  /** Swaps the button text for a spinner without changing the button's footprint
   *  — `ctaInlineBase`'s `min-w-` keeps the width stable across the swap. */
  loading?: boolean;
  /** Optional submit handler. Defaults to a no-op preventDefault. */
  onSubmit?: (e: React.FormEvent) => void;
};

/**
 * Single chrome row for the rooms-gate: input on the left + inline gradient
 * button pinned to the right. Two of these sit side-by-side in
 * `RoomsGateMode` (Create + Join).
 */
export function RoomFormCard({
  id,
  label,
  placeholder,
  buttonText,
  variant,
  value,
  onChange,
  disabled,
  loading,
  onSubmit,
}: RoomFormCardProps) {
  const buttonClass = variant === "create" ? ctaInlineCreate : ctaInlineJoin;
  const isLocked = Boolean(disabled || loading);
  return (
    <form onSubmit={onSubmit ?? ((e) => e.preventDefault())} noValidate>
      <div className={`${rowChrome} flex items-center`}>
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${cellInput} flex-1`}
        />
        <button type="submit" className={buttonClass} disabled={isLocked}>
          {loading ? (
            <AppIcon
              icon="line-md:loading-twotone-loop"
              className="h-5 w-5"
              aria-hidden
            />
          ) : (
            buttonText
          )}
        </button>
      </div>
    </form>
  );
}
