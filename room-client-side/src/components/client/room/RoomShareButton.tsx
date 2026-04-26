"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";

type RoomShareButtonProps = {
  /** The room's UUID — what gets written to the clipboard. */
  roomId: string;
};

/**
 * Circular share button in the room header's right cluster. Same chrome
 * dimensions as the theme / logout / avatar / settings buttons so the
 * cluster reads as one row of equal-sized circles. Visible to **all**
 * members.
 *
 * Click → copy the bare room ID and run the 2-second confirm flash:
 *   - Button background flips emerald + icon swaps from link → check.
 *   - A "Copied" pill fades in absolutely-positioned just below the
 *     button. Absolute = doesn't push any sibling layout.
 *   - After 2 s, both revert smoothly.
 *
 * Layout invariant: nothing in this component changes its in-flow size
 * across the click. The pill is `position: absolute`, so the row of
 * header buttons stays put. Failures still toast (no inline UI for
 * the error case — the green-flash language doesn't apply).
 */
const FLASH_DURATION_MS = 2000;

export function RoomShareButton({ roomId }: RoomShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, FLASH_DURATION_MS);
    } catch {
      toast.error("Couldn't copy. Try again.");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleClick()}
        aria-label="Copy room ID"
        title="Copy room ID"
        className={[
          "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors duration-200 sm:h-10 sm:w-10",
          copied
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-border bg-card/90 text-muted hover:border-border hover:bg-card",
        ].join(" ")}
      >
        <AppIcon
          icon={copied ? "lucide:check" : "lucide:link"}
          className="h-[18px] w-[18px] sm:h-5 sm:w-5"
          aria-hidden
        />
      </button>

      {/*
        Absolutely-positioned confirmation label — plain text in the
        theme color, no chip background. `pointer-events-none` keeps it
        out of the way of any other clicks in the cluster; opacity
        transition fades it without resizing anything.
      */}
      <span
        role="status"
        aria-live="polite"
        className={[
          "pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-foreground transition-opacity duration-200",
          copied ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
