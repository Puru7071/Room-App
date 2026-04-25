"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";
import { signup, verifyOtp } from "@/lib/api";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUsername(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (s.length < 3 || s.length > 30) return null;
  if (!USERNAME_RE.test(s)) return null;
  return s;
}

type AuthMode = "gate" | "signup" | "login" | "otp";

const EMAIL_INVALID_MSG = "Enter a valid email address.";
const USERNAME_RULE_MSG = "Use 3–30 letters, numbers, or underscores.";
const PASSWORD_MIN_MSG = "Use at least 6 characters.";
const PASSWORD_REQUIRED_MSG = "Enter your password.";

/** Length of the OTP — matches the 6-digit generator in `server-side/src/auth/otp.ts`. */
const OTP_LENGTH = 6;

/** Auth token persistence key. Read by future-`/is-auth-user` equivalents. */
const AUTH_TOKEN_KEY = "roomapp.authToken";

const chromeShell =
  "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_40px_-15px_rgba(15,23,42,0.14)] dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.35)]";

const chromeCard = `${chromeShell} flex min-w-0 items-stretch`;

const rowChrome = `${chromeCard} w-full min-h-[2.875rem] sm:min-h-[3.125rem]`;

const ctaJoin =
  "flex h-full min-h-[2.875rem] w-full min-w-[6.5rem] cursor-pointer items-center justify-center border-0 bg-gradient-to-b from-violet-500 via-violet-600 to-purple-900 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-[0_10px_26px_-8px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[3.125rem] sm:min-w-[7rem] sm:px-3.5 sm:py-3 sm:text-[15px]";

const ctaCreate =
  "flex h-full min-h-[2.875rem] w-full min-w-[6.5rem] cursor-pointer items-center justify-center border-0 bg-gradient-to-b from-sky-500 via-blue-600 to-indigo-700 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-[0_10px_26px_-8px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-80 sm:min-h-[3.125rem] sm:min-w-[7rem] sm:px-3.5 sm:py-3 sm:text-[15px]";

const ctaIconBase =
  "flex aspect-square h-[2.875rem] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[3.125rem]";

const ctaIconJoin = `${ctaIconBase} bg-gradient-to-b from-violet-500 via-violet-600 to-purple-900 text-white shadow-[0_10px_26px_-8px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

const ctaIconCreate = `${ctaIconBase} bg-gradient-to-b from-sky-500 via-blue-600 to-indigo-700 text-white shadow-[0_10px_26px_-8px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

const ctaIconBack = `${ctaIconBase} bg-zinc-600 text-zinc-50 hover:bg-zinc-500 active:bg-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600`;

/** Identical margins/max-width across gate + forms so switching modes doesn't jump. */
const authBlockOuter =
  "relative mx-auto mt-2 mb-6 flex w-full min-w-0 max-w-[min(100%,56rem)] flex-col sm:mt-2.5 sm:mb-8 sm:max-w-[62rem] overflow-y-visible";

const gateRowInner =
  "flex w-full flex-row flex-wrap items-start justify-center gap-3 pb-6 sm:items-center sm:gap-5 sm:pb-7";

/** Fields row for login + signup: stack on mobile, row on sm+. pb-7 reserves space for error line. */
const formFieldsRow =
  "flex w-full min-w-0 flex-col items-start gap-3 pb-6 sm:flex-row sm:flex-nowrap sm:gap-3 sm:pb-7";

/**
 * Form buttons: below fields on mobile (right-aligned), absolute-right on sm+.
 * Absolute + positive translate pins the button pair entirely outside the form's
 * right edge so the fields row stays the full width and its layout doesn't shift.
 */
const formButtonsRow =
  "mt-3 flex w-full flex-row justify-end gap-2.5 sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-auto sm:translate-x-[calc(100%+0.75rem)] sm:gap-3";

const authFieldColumn =
  "flex min-w-0 max-w-full flex-1 flex-col gap-0 basis-0 sm:min-w-[7.5rem]";

const authInputFieldStack = "relative w-full min-w-0 overflow-visible";

const fieldErrorAbsolute =
  "absolute left-3 top-full mt-1 whitespace-nowrap text-left text-xs leading-none text-red-600 sm:left-3.5 sm:text-sm dark:text-red-400";

const cellField = `${chromeShell} min-h-[2.875rem] w-full min-w-0 sm:min-h-[3.125rem]`;

const cellInput =
  "h-full min-h-[2.875rem] w-full min-w-0 border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted focus:ring-0 sm:min-h-[3.125rem] sm:px-3.5 sm:py-2.5 sm:text-[15px]";

const gateCol =
  "flex w-full min-w-0 max-w-[min(100%,18.5rem)] flex-col gap-0 sm:max-w-[20rem]";

/** One OTP digit cell — mirrors the boxed style used in `OTPMail.ejs`. */
const otpDigitCell =
  "flex h-[2.875rem] w-[2.75rem] min-w-0 items-center justify-center rounded-xl border border-border bg-card text-center font-mono text-lg font-semibold text-foreground outline-none shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/30 sm:h-[3.125rem] sm:w-[3rem] sm:text-xl";

/** Eye toggle that lives inside the password `cellField` flex row. */
const passwordToggleButton =
  "flex h-full shrink-0 cursor-pointer items-center justify-center px-3 text-muted outline-none transition hover:text-foreground focus-visible:text-foreground sm:px-3.5";

export function AuthGateForms() {
  const [mode, setMode] = useState<AuthMode>("gate");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // OTP state. Kept as an array of 6 single-character strings so each <input>
  // owns exactly one digit — simplifies auto-advance + backspace handling.
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array(OTP_LENGTH).fill(""),
  );
  const [otpError, setOtpError] = useState("");
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

  function applyServerError(error: string, field?: "email" | "username" | "password" | "otp") {
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

    // Success: email queued + StagedUser row created. Move to OTP entry.
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setMode("otp");
    toast.success("Verification code sent to your inbox");
    // Defer focus so the inputs have mounted before we grab the first one.
    queueMicrotask(() => otpInputRefs.current[0]?.focus());
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearFieldErrors();
    let ok = true;
    if (!normalizeUsername(username)) {
      setUsernameError(USERNAME_RULE_MSG);
      ok = false;
    }
    if (!password) {
      setPasswordError(PASSWORD_REQUIRED_MSG);
      ok = false;
    }
    if (!ok) return;
  }

  function handleOtpDigitChange(index: number, raw: string) {
    if (otpError) setOtpError("");
    if (formError) setFormError("");

    // Browsers fire a single `change` for paste events too — if we got more
    // than one char, distribute them across the remaining boxes.
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
      // Backspace on empty box → jump to previous box and clear it.
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
      setOtpError("Enter the 6-digit code.");
      return;
    }

    setSubmitting(true);
    const result = await verifyOtp({ email: email.trim(), otp });
    setSubmitting(false);

    if (!result.ok) {
      // Expired codes route to a toast (the user can't recover by retyping —
      // they need a fresh code), and we clear the boxes + focus the first
      // one so the visible state matches "start over." Mismatch (and any
      // other field error) stays inline since the user can just edit the digits.
      if (result.reason === "expired") {
        toast.error("This code expired — request a new one.");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        queueMicrotask(() => otpInputRefs.current[0]?.focus());
        return;
      }
      applyServerError(result.error, result.field);
      return;
    }

    // Verified. Stash the JWT for future authed requests and bounce home state.
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    } catch {
      // localStorage can throw in private-mode Safari; non-fatal for now.
    }
    setPassword("");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    clearFieldErrors();
    setMode("gate");
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

  if (mode === "gate") {
    return (
      <div className={authBlockOuter}>
        <div className={gateRowInner}>
          <div className={gateCol}>
            <div className={rowChrome}>
            <button
              type="button"
              className={ctaJoin}
              onClick={() => {
                clearFieldErrors();
                setMode("login");
              }}
            >
              Log in
            </button>
            </div>
          </div>
          <div className={gateCol}>
            <div className={rowChrome}>
            <button
              type="button"
              className={ctaCreate}
              onClick={() => {
                clearFieldErrors();
                setMode("signup");
              }}
            >
              Sign up
            </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <form className={authBlockOuter} onSubmit={handleLogin} noValidate>
        <div className={formFieldsRow}>
          <div className={authFieldColumn}>
            <div className={authInputFieldStack}>
              <div className={cellField}>
                <label htmlFor="auth-login-username" className="sr-only">
                  Username
                </label>
                <input
                  id="auth-login-username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (usernameError) setUsernameError("");
                  }}
                  placeholder="Username"
                  className={cellInput}
                  aria-invalid={usernameError ? true : undefined}
                  aria-describedby={
                    usernameError ? "auth-login-username-err" : undefined
                  }
                />
              </div>
              {usernameError ? (
                <p
                  id="auth-login-username-err"
                  className={fieldErrorAbsolute}
                  role="alert"
                >
                  {usernameError}
                </p>
              ) : null}
            </div>
          </div>
          <div className={authFieldColumn}>
            <div className={authInputFieldStack}>
              <div className={`${cellField} flex items-center`}>
                <label htmlFor="auth-login-password" className="sr-only">
                  Password
                </label>
                <input
                  id="auth-login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="Password"
                  className={`${cellInput} flex-1`}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={
                    passwordError ? "auth-login-password-err" : undefined
                  }
                />
                <button
                  type="button"
                  className={passwordToggleButton}
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                >
                  <AppIcon
                    icon={showPassword ? "line-md:watch-off-loop" : "line-md:watch-loop"}
                    className="h-5 w-5"
                    aria-hidden
                  />
                </button>
              </div>
              {passwordError ? (
                <p
                  id="auth-login-password-err"
                  className={fieldErrorAbsolute}
                  role="alert"
                >
                  {passwordError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className={formButtonsRow}>
          <button
            type="submit"
            className={ctaIconJoin}
            aria-label="Log in"
            title="Log in"
          >
            <AppIcon icon="lucide:check" className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className={ctaIconBack}
            aria-label="Back"
            title="Back"
            onClick={goGate}
          >
            <AppIcon icon="lucide:arrow-left" className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </form>
    );
  }

  if (mode === "otp") {
    return (
      <form className={authBlockOuter} onSubmit={handleOtpSubmit} noValidate>
        {/*
          Zero-shift layout: the form's flow height matches the signup form
          (input-row + pb-6 sm:pb-7) so the parent's justify-center doesn't
          reshuffle the hero above and the feature cards below.
          sm+: 3-column grid [1fr | boxes | 1fr] — 1fr columns balance the
          leftover width, so the boxes land at the page's horizontal center
          and the buttons (placed in col 3, justify-self-start) sit right
          beside them. The error + resend are absolute-anchored inside the
          grid's pb-7 reserve, so they render tight under the boxes without
          adding height.
        */}
        <div className="relative flex flex-col items-center gap-3 pb-6 sm:grid sm:w-full sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0 sm:pb-7">
          <div className="hidden sm:col-start-1 sm:row-start-1 sm:block" />
          <div className="flex items-center gap-2 sm:col-start-2 sm:row-start-1 sm:gap-2.5">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpInputRefs.current[i] = el;
                }}
                id={`auth-otp-${i}`}
                name={`otp-${i}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onFocus={(e) => e.currentTarget.select()}
                className={otpDigitCell}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                aria-invalid={otpError ? true : undefined}
              />
            ))}
          </div>
          <div className="flex items-center gap-2.5 sm:col-start-3 sm:row-start-1 sm:justify-self-start sm:gap-3 sm:pl-3">
            <button
              type="submit"
              className={ctaIconCreate}
              aria-label="Verify code"
              title="Verify code"
              disabled={submitting}
              aria-busy={submitting}
            >
              <AppIcon
                icon={submitting ? "line-md:loading-twotone-loop" : "lucide:check"}
                className="h-5 w-5"
                aria-hidden
              />
            </button>
            <button
              type="button"
              className={ctaIconBack}
              aria-label="Back to sign up"
              title="Back"
              onClick={() => {
                clearFieldErrors();
                setOtpDigits(Array(OTP_LENGTH).fill(""));
                setMode("signup");
              }}
              disabled={submitting}
            >
              <AppIcon icon="lucide:arrow-left" className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/*
            Error + resend.
            Mobile: in flow below the buttons.
            sm+: absolute, anchored just under the boxes row (top-14 = 3.5rem, ~6px below
            the 3.125rem-tall boxes). Sits inside the grid's pb-7 reserve so it doesn't
            push the form taller.
          */}
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
                onClick={handleResendCode}
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

  return (
    <form className={authBlockOuter} onSubmit={handleSignup} noValidate>
      <div className={formFieldsRow}>
        <div className={authFieldColumn}>
          <div className={authInputFieldStack}>
            <div className={cellField}>
              <label htmlFor="auth-signup-email" className="sr-only">
                Email
              </label>
              <input
                id="auth-signup-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                placeholder="Email"
                className={cellInput}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={
                  emailError ? "auth-signup-email-err" : undefined
                }
              />
            </div>
            {emailError ? (
              <p
                id="auth-signup-email-err"
                className={fieldErrorAbsolute}
                role="alert"
              >
                {emailError}
              </p>
            ) : null}
          </div>
        </div>
        <div className={authFieldColumn}>
          <div className={authInputFieldStack}>
            <div className={cellField}>
              <label htmlFor="auth-signup-username" className="sr-only">
                Username
              </label>
              <input
                id="auth-signup-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) setUsernameError("");
                }}
                placeholder="Username"
                className={cellInput}
                aria-invalid={usernameError ? true : undefined}
                aria-describedby={
                  usernameError ? "auth-signup-username-err" : undefined
                }
              />
            </div>
            {usernameError ? (
              <p
                id="auth-signup-username-err"
                className={fieldErrorAbsolute}
                role="alert"
              >
                {usernameError}
              </p>
            ) : null}
          </div>
        </div>
        <div className={authFieldColumn}>
          <div className={authInputFieldStack}>
            <div className={`${cellField} flex items-center`}>
              <label htmlFor="auth-signup-password" className="sr-only">
                Password
              </label>
              <input
                id="auth-signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Password"
                className={`${cellInput} flex-1`}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={
                  passwordError ? "auth-signup-password-err" : undefined
                }
              />
              <button
                type="button"
                className={passwordToggleButton}
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={-1}
              >
                <AppIcon
                  icon={showPassword ? "line-md:watch-off-loop" : "line-md:watch-loop"}
                  className="h-5 w-5"
                  aria-hidden
                />
              </button>
            </div>
            {passwordError ? (
              <p
                id="auth-signup-password-err"
                className={fieldErrorAbsolute}
                role="alert"
              >
                {passwordError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {formError ? (
        <p
          className="-mt-5 mb-4 text-left text-xs text-red-600 sm:text-sm dark:text-red-400"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
      <div className={formButtonsRow}>
        <button
          type="submit"
          className={ctaIconCreate}
          aria-label="Sign up"
          title="Sign up"
          disabled={submitting}
          aria-busy={submitting}
        >
          <AppIcon
            icon={submitting ? "line-md:loading-twotone-loop" : "lucide:check"}
            className="h-5 w-5"
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={ctaIconBack}
          aria-label="Back"
          title="Back"
          onClick={goGate}
          disabled={submitting}
        >
          <AppIcon icon="lucide:arrow-left" className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
