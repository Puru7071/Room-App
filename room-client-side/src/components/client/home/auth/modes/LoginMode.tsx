"use client";

import { FieldRow } from "../parts/FieldRow";
import { IconButton } from "../parts/IconButton";
import { PasswordToggle } from "../parts/PasswordToggle";
import { authBlockOuter, formButtonsRow, formFieldsRow } from "../styles";

type LoginModeProps = {
  email: string;
  setEmail: (v: string) => void;
  emailError: string;
  setEmailError: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  passwordError: string;
  setPasswordError: (v: string) => void;
  formError: string;
  showPassword: boolean;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  submitting: boolean;
};

/**
 * Login form: email + password. Submitting calls `POST /auth/login`. The
 * server returns a single generic `formError` ("Email or password is
 * incorrect") for both unknown-email and wrong-password cases — that's
 * surfaced as a banner above the buttons, exactly like the signup form's
 * generic-error path.
 */
export function LoginMode({
  email,
  setEmail,
  emailError,
  setEmailError,
  password,
  setPassword,
  passwordError,
  setPasswordError,
  formError,
  showPassword,
  onTogglePassword,
  onSubmit,
  onBack,
  submitting,
}: LoginModeProps) {
  return (
    <form className={authBlockOuter} onSubmit={onSubmit} noValidate>
      <div className={formFieldsRow}>
        <FieldRow
          id="auth-login-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailError) setEmailError("");
          }}
          error={emailError}
        />
        <FieldRow
          id="auth-login-password"
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (passwordError) setPasswordError("");
          }}
          error={passwordError}
          trailing={
            <PasswordToggle show={showPassword} onToggle={onTogglePassword} />
          }
        />
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
        <IconButton
          variant="join"
          type="submit"
          icon="lucide:check"
          label="Log in"
          disabled={submitting}
          loading={submitting}
        />
        <IconButton
          variant="back"
          icon="lucide:arrow-left"
          label="Back"
          onClick={onBack}
          disabled={submitting}
        />
      </div>
    </form>
  );
}
