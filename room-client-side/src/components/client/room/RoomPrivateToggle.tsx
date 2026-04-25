"use client";

type RoomPrivateToggleProps = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
};

/**
 * Compact switch: private (on) vs public (off). Shown only to the room owner.
 */
export function RoomPrivateToggle({
  checked,
  disabled,
  onCheckedChange,
}: RoomPrivateToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={
        checked
          ? "Private room — toggle off to make the room public"
          : "Public room — toggle on to make the room private"
      }
      onClick={() => onCheckedChange(!checked)}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card/90 px-2.5 text-left shadow-sm transition hover:border-border hover:bg-card disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:px-3 dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
    >
      <span className="select-none text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-xs">
        Private
      </span>
      <span
        className={[
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-emerald-600 dark:bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600",
        ].join(" ")}
        aria-hidden
      >
        <span
          className={[
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
