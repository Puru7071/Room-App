"use client";

import { FieldRow } from "../parts/FieldRow";
import { IconButton } from "../parts/IconButton";
import { PasswordToggle } from "../parts/PasswordToggle";
import { authBlockOuter, formButtonsRow, formFieldsRow } from "../styles";

type SignupModeProps = {
  email: string;
  setEmail: (v: string) => void;
  emailError: string;
  setEmailError: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  usernameError: string;
  setUsernameError: (v: string) => void;
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
 * Signup form: email + username + password fields, with a submit (tick) and
 * back button absolute-right on sm+. The submit button shows the
 * `line-md:loading-twotone-loop` animation while the API call is in flight.
 */
export function SignupMode({
  email,
  setEmail,
  emailError,
  setEmailError,
  username,
  setUsername,
  usernameError,
  setUsernameError,
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
}: SignupModeProps) {
  return (
    <form className={authBlockOuter} onSubmit={onSubmit} noValidate>
      <div className={formFieldsRow}>
        <FieldRow
          id="auth-signup-email"
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
          id="auth-signup-username"
          name="username"
          label="Username"
          autoComplete="username"
          placeholder="Username"
          value={username}
          onChange={(v) => {
            setUsername(v);
            if (usernameError) setUsernameError("");
          }}
          error={usernameError}
        />
        <FieldRow
          id="auth-signup-password"
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
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
          variant="create"
          type="submit"
          icon="lucide:check"
          label="Sign up"
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
