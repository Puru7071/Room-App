/**
 * Sends a one-time password email to a user during the staged-signup flow.
 * Pairs with `StagedUser.expiresAt` in Prisma: the email advertises the same
 * window that the DB row's TTL filter enforces.
 */

import { renderTemplate, sendMail } from "./transport";

/** Shown in the subject line, header, and footer. Update in one place to rebrand. */
const APP_NAME = "Digi3ator";

/**
 * Default expiry (in minutes) communicated to the user in the email body.
 * Keep this in sync with the value the signup route uses when stamping
 * `StagedUser.expiresAt`, or pass `expiresInMinutes` explicitly to override.
 */
const DEFAULT_EXPIRY_MINUTES = 2;

type SendOTPEmailArgs = {
  email: string;
  otp: string;
  expiresInMinutes?: number;
};

/**
 * Renders the OTP template and hands it to the SMTP transporter.
 *
 * Resolves when Gmail accepts the message; rejects on any transport error
 * (bad creds, unreachable SMTP, malformed recipient). The caller (signup
 * handler) decides whether to surface, retry, or log.
 */
export async function sendOTPEmail({
  email,
  otp,
  expiresInMinutes = DEFAULT_EXPIRY_MINUTES,
}: SendOTPEmailArgs): Promise<void> {
  const html = await renderTemplate("OTPMail.ejs", {
    appName: APP_NAME,
    otp,
    expiresInMinutes,
  });

  await sendMail({
    to: email,
    subject: `${APP_NAME} — your verification code`,
    html,
  });
}
