/**
 * Thin wrappers around the server's /auth endpoints.
 *
 * Normalizes the server's response shape into a discriminated union so callers
 * can `if (res.ok) { … } else { … }` without juggling HTTP statuses themselves.
 * Errors from `fetch` itself (network down, CORS blocked) surface as
 * `{ ok: false, error: "..." }` with no `field`, so the form can show a
 * generic message instead of crashing.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9900";

export type ApiFieldError = "email" | "username" | "password" | "otp";

/**
 * `reason` lets the client distinguish error sub-types that share a `field`.
 * Currently used by `/auth/verify-otp` to separate a code mismatch (user can
 * retype) from an expired code (user must request a new one).
 */
export type ApiErrorReason = "invalid" | "expired";

export type ApiResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      field?: ApiFieldError;
      reason?: ApiErrorReason;
    };

export type SignupArgs = { email: string; username: string; password: string };

export type AuthUser = {
  userId: string;
  email: string;
  username: string;
  profilePicUrl: string | null;
};

export type VerifyOtpResult = { token: string; user: AuthUser };

async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }

  // Rate-limiter middleware responds with the same JSON shape, but some edge
  // cases (e.g. a Cloudflare HTML error page) aren't JSON — guard for that.
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: `Unexpected server response (HTTP ${response.status}).` };
  }

  return data as ApiResult<T>;
}

export function signup(args: SignupArgs) {
  return postJson<Record<string, never>>("/auth/signup", args);
}

export function verifyOtp(args: { email: string; otp: string }) {
  return postJson<VerifyOtpResult>("/auth/verify-otp", args);
}
