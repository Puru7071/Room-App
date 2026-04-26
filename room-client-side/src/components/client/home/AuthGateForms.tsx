"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { login, signup, verifyOtp } from "@/lib/api";
import { setAuthToken } from "@/lib/auth-storage";
import { GateMode } from "./auth/modes/GateMode";
import { LoginMode } from "./auth/modes/LoginMode";
import { OtpMode } from "./auth/modes/OtpMode";
import { RoomsGateMode } from "./auth/modes/RoomsGateMode";
import { SignupMode } from "./auth/modes/SignupMode";
import {
  EMAIL_INVALID_MSG,
  EMAIL_RE,
  normalizeUsername,
  OTP_INCOMPLETE_MSG,
  OTP_LENGTH,
  PASSWORD_MIN_MSG,
  PASSWORD_REQUIRED_MSG,
  USERNAME_RULE_MSG,
} from "./auth/validation";

type AuthMode = "gate" | "signup" | "login" | "otp" | "rooms-gate";

/**
 * Orchestrator for the home-page auth gate. Owns shared state (current mode,
 * user-typed credentials, error strings, in-flight flag, OTP digits) and
 * dispatches to one of five mode components. Each mode lives in its own
 * file under `auth/modes/` and reuses small, focused parts under
 * `auth/parts/`. Style constants and validation helpers live in
 * `auth/styles.ts` and `auth/validation.ts`.
 */
export function AuthGateForms() {
  const [mode, setMode] = useState<AuthMode>("gate");

  // Credentials are lifted here because they're shared across modes:
  // signup → otp uses email/username/password to call /auth/signup, and
  // resending the OTP from the otp mode hits the same endpoint.
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Per-field error strings. Lifted (rather than kept in each mode) so they
  // survive when the user navigates back-and-forth and the orchestrator can
  // route server `field` errors to the right slot.
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [otpError, setOtpError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // OTP digits as an array of 6 single-character strings — one input per
  // digit makes auto-advance + backspace handling straightforward.
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array(OTP_LENGTH).fill(""),
  );
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function clearFieldErrors() {
    setEmailError("");
    setUsernameError("");
    setPasswordError("");
    setFormError("");
    setOtpError("");
  }

  function goGate() {
    clearFieldErrors();
    setMode("gate");
  }

  /**
   * Bidirectional sync between the auth token and the visible mode:
   *
   *   - **Token appears** (page loaded with a stored JWT, login completed in
   *     another tab, or this tab just finished login/verify-otp) and we're
   *     not already on the rooms-gate → snap to rooms-gate. This is what
   *     keeps "logged in across refreshes" working without an `/auth/me`
   *     roundtrip; the JWT in `localStorage` is the source of truth.
   *   - **Token disappears** (logout fired from the header's `LogoutButton`,
   *     or a logout in another tab) while we're on the rooms-gate → drop
   *     back to the gate so the user sees Log in / Sign up again.
   *
   * Either transition resets typed credentials so the forms come up clean.
   * The hook listens to the storage event, so cross-tab cases work for
   * free.
   */
  const { hasToken } = useAuthToken();
  useEffect(() => {
    if (hasToken && mode !== "rooms-gate") {
      setEmail("");
      setUsername("");
      setPassword("");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      clearFieldErrors();
      setMode("rooms-gate");
      return;
    }
    if (!hasToken && mode === "rooms-gate") {
      setEmail("");
      setUsername("");
      setPassword("");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      clearFieldErrors();
      setMode("gate");
    }
    // `clearFieldErrors` and the setters are stable references; deps below
    // are the only inputs that should re-trigger this guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, mode]);

  function applyServerError(
    error: string,
    field?: "email" | "username" | "password" | "otp",
  ) {
    if (field === "email") setEmailError(error);
    else if (field === "username") setUsernameError(error);
    else if (field === "password") setPasswordError(error);
    else if (field === "otp") setOtpError(error);
    else setFormError(error);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    clearFieldErrors();
    const emailTrimmed = email.trim();
    const normalizedUsername = normalizeUsername(username);
    let ok = true;
    if (!EMAIL_RE.test(emailTrimmed)) {
      setEmailError(EMAIL_INVALID_MSG);
      ok = false;
    }
    if (!normalizedUsername) {
      setUsernameError(USERNAME_RULE_MSG);
      ok = false;
    }
    if (password.length < 6) {
      setPasswordError(PASSWORD_MIN_MSG);
      ok = false;
    }
    if (!ok || !normalizedUsername) return;

    setSubmitting(true);
    const result = await signup({
      email: emailTrimmed,
      username: normalizedUsername,
      password,
    });
    setSubmitting(false);

    if (!result.ok) {
      applyServerError(result.error, result.field);
      return;
    }

    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setMode("otp");
    toast.success("Verification code sent to your inbox");
    queueMicrotask(() => otpInputRefs.current[0]?.focus());
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearFieldErrors();
    const emailTrimmed = email.trim();
    let ok = true;
    if (!EMAIL_RE.test(emailTrimmed)) {
      setEmailError(EMAIL_INVALID_MSG);
      ok = false;
    }
    if (!password) {
      setPasswordError(PASSWORD_REQUIRED_MSG);
      ok = false;
    }
    if (!ok) return;

    setSubmitting(true);
    const result = await login({ email: emailTrimmed, password });
    setSubmitting(false);

    if (!result.ok) {
      // Server returns a single generic error for both unknown-email and
      // wrong-password (no `field`), so it lands in `formError` and shows
      // as a banner above the buttons.
      applyServerError(result.error, result.field);
      return;
    }

    // Authenticated. Stash JWT and drop into rooms-gate.
    setAuthToken(result.token);
    setPassword("");
    clearFieldErrors();
    setMode("rooms-gate");
    toast.success(`Welcome back, ${result.user.username}`);
  }

  function handleOtpDigitChange(index: number, raw: string) {
    if (otpError) setOtpError("");
    if (formError) setFormError("");

    // A single `change` event can fire for a paste of multiple digits — if
    // we got more than one char, distribute them across remaining boxes.
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    setOtpDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = digits[i];
      }
      return next;
    });
    const nextFocus = Math.min(index + digits.length, OTP_LENGTH - 1);
    otpInputRefs.current[nextFocus]?.focus();
    otpInputRefs.current[nextFocus]?.select();
  }

  function handleOtpKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      // Backspace on an empty box → jump to the previous box and clear it.
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOtpError("");
    setFormError("");
    const otp = otpDigits.join("");
    if (otp.length !== OTP_LENGTH) {
      setOtpError(OTP_INCOMPLETE_MSG);
      return;
    }

    setSubmitting(true);
    const result = await verifyOtp({ email: email.trim(), otp });
    setSubmitting(false);

    if (!result.ok) {
      // Expired codes route to a toast (the user can't recover by retyping —
      // they need a fresh code), and we clear the boxes + focus the first
      // one so the visible state matches "start over." Mismatch (and any
      // other field error) stays inline since the user can just edit.
      if (result.reason === "expired") {
        toast.error("This code expired — request a new one.");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        queueMicrotask(() => otpInputRefs.current[0]?.focus());
        return;
      }
      applyServerError(result.error, result.field);
      return;
    }

    // Verified. Auto-login: stash the JWT for future authed requests and go
    // to the rooms-gate (the post-signup, logged-in destination).
    setAuthToken(result.token);
    setPassword("");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    clearFieldErrors();
    setMode("rooms-gate");
    toast.success("Signed up — create or join a room to continue");
  }

  async function handleResendCode() {
    if (submitting) return;
    clearFieldErrors();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return;
    setSubmitting(true);
    const result = await signup({
      email: email.trim(),
      username: normalizedUsername,
      password,
    });
    setSubmitting(false);
    if (!result.ok) {
      applyServerError(result.error, result.field);
      return;
    }
    toast.success("A new code is on its way");
  }

  function togglePassword() {
    setShowPassword((s) => !s);
  }

  switch (mode) {
    case "gate":
      return (
        <GateMode
          onLogin={() => {
            clearFieldErrors();
            setMode("login");
          }}
          onSignup={() => {
            clearFieldErrors();
            setMode("signup");
          }}
        />
      );
    case "login":
      return (
        <LoginMode
          email={email}
          setEmail={setEmail}
          emailError={emailError}
          setEmailError={setEmailError}
          password={password}
          setPassword={setPassword}
          passwordError={passwordError}
          setPasswordError={setPasswordError}
          formError={formError}
          showPassword={showPassword}
          onTogglePassword={togglePassword}
          onSubmit={handleLogin}
          onBack={goGate}
          submitting={submitting}
        />
      );
    case "signup":
      return (
        <SignupMode
          email={email}
          setEmail={setEmail}
          emailError={emailError}
          setEmailError={setEmailError}
          username={username}
          setUsername={setUsername}
          usernameError={usernameError}
          setUsernameError={setUsernameError}
          password={password}
          setPassword={setPassword}
          passwordError={passwordError}
          setPasswordError={setPasswordError}
          formError={formError}
          showPassword={showPassword}
          onTogglePassword={togglePassword}
          onSubmit={handleSignup}
          onBack={goGate}
          submitting={submitting}
        />
      );
    case "otp":
      return (
        <OtpMode
          digits={otpDigits}
          onDigitChange={handleOtpDigitChange}
          onKeyDown={handleOtpKeyDown}
          inputRefs={otpInputRefs}
          otpError={otpError}
          formError={formError}
          submitting={submitting}
          onSubmit={handleOtpSubmit}
          onBack={() => {
            clearFieldErrors();
            setOtpDigits(Array(OTP_LENGTH).fill(""));
            setMode("signup");
          }}
          onResend={handleResendCode}
        />
      );
    case "rooms-gate":
      return <RoomsGateMode />;
  }
}
