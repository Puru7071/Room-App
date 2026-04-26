"use client";

import type { RefObject } from "react";
import { IconButton } from "../parts/IconButton";
import { OtpDigitInput } from "../parts/OtpDigitInput";
import { authBlockOuter } from "../styles";
import { OTP_LENGTH } from "../validation";

type OtpModeProps = {
  digits: string[];
  onDigitChange: (index: number, raw: string) => void;
  onKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRefs: RefObject<Array<HTMLInputElement | null>>;
  otpError: string;
  formError: string;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onResend: () => void;
};

/**
 * OTP entry screen.
 *
 * Layout: a 3-column grid on sm+ ([1fr | boxes | 1fr]) so the boxes sit at
 * the page's horizontal center and the buttons live in col 3 immediately
 * to their right. The error + resend hint are absolute-anchored inside the
 * grid's `pb-7` reserve so showing/hiding them never grows the form, which
 * keeps the parent's `justify-center` from reshuffling the page when
 * transitioning OTP → rooms-gate.
 */
export function OtpMode({
  digits,
  onDigitChange,
  onKeyDown,
  inputRefs,
  otpError,
  formError,
  submitting,
  onSubmit,
  onBack,
  onResend,
}: OtpModeProps) {
  return (
    <form className={authBlockOuter} onSubmit={onSubmit} noValidate>
      <div className="relative flex flex-col items-center gap-3 pb-6 sm:grid sm:w-full sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0 sm:pb-7">
        <div className="hidden sm:col-start-1 sm:row-start-1 sm:block" />
        <div className="flex items-center gap-2 sm:col-start-2 sm:row-start-1 sm:gap-2.5">
          {digits.map((digit, i) => (
            <OtpDigitInput
              key={i}
              index={i}
              value={digit}
              onChange={(raw) => onDigitChange(i, raw)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputRef={(el) => {
                inputRefs.current[i] = el;
              }}
              isInvalid={Boolean(otpError)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2.5 sm:col-start-3 sm:row-start-1 sm:justify-self-start sm:gap-3 sm:pl-3">
          <IconButton
            variant="create"
            type="submit"
            icon="lucide:check"
            label="Verify code"
            disabled={submitting}
            loading={submitting}
          />
          <IconButton
            variant="back"
            icon="lucide:arrow-left"
            label="Back to sign up"
            onClick={onBack}
            disabled={submitting}
          />
        </div>

        {/* Error + resend hint: in flow on mobile, absolute (top-14) on sm+
            so they share the grid's pb-7 reserve and don't add height. */}
        <div className="flex flex-col items-center gap-0.5 sm:absolute sm:left-1/2 sm:top-14 sm:-translate-x-1/2 sm:gap-0.5">
          {otpError || formError ? (
            <p
              className="text-center text-xs text-red-600 sm:whitespace-nowrap sm:text-sm dark:text-red-400"
              role="alert"
            >
              {otpError || formError}
            </p>
          ) : null}
          <p className="text-center text-xs text-muted sm:whitespace-nowrap sm:text-sm">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              className="cursor-pointer font-semibold text-accent-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onResend}
              disabled={submitting}
            >
              Resend code
            </button>
          </p>
        </div>
      </div>
    </form>
  );
}

// Re-export so callers can import the OTP length without reaching into validation.
export { OTP_LENGTH };
