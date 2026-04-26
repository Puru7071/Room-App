"use client";

import { OTP_LENGTH } from "../validation";
import { otpDigitCell } from "../styles";

type OtpDigitInputProps = {
  index: number;
  value: string;
  onChange: (raw: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: (el: HTMLInputElement | null) => void;
  isInvalid?: boolean;
};

/**
 * One 44×44 OTP digit cell. `autoComplete="one-time-code"` only on the first
 * cell so iOS/Android offer to fill all six from the SMS/email autofill.
 * Auto-advance and backspace handling live in the parent (OtpMode) so all
 * six cells share the same logic and refs.
 */
export function OtpDigitInput({
  index,
  value,
  onChange,
  onKeyDown,
  inputRef,
  isInvalid,
}: OtpDigitInputProps) {
  return (
    <input
      ref={inputRef}
      id={`auth-otp-${index}`}
      name={`otp-${index}`}
      type="text"
      inputMode="numeric"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      maxLength={OTP_LENGTH}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={(e) => e.currentTarget.select()}
      className={otpDigitCell}
      aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
      aria-invalid={isInvalid || undefined}
    />
  );
}
