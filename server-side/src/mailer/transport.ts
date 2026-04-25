/**
 * Nodemailer transport + EJS template rendering.
 *
 * Central outbound-email infrastructure for the server. Feature-specific senders
 * (like `sendOTPEmail`) build on top of the two exports here: `renderTemplate`
 * turns an EJS file into an HTML string, and `sendMail` hands the final HTML to
 * Gmail's SMTP.
 */

import path from "node:path";
import ejs from "ejs";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Directory that holds the `.ejs` email templates.
 * Kept next to this file so they travel together in `dist/` (see the
 * `copy:templates` script in package.json).
 */
const TEMPLATE_DIR = path.join(__dirname, "templates");

/**
 * Single Gmail SMTP transporter cached after its first use.
 * Created lazily so a missing `EMAIL_USER` / `EMAIL_PASS` fails loudly at send
 * time rather than at module import (which would crash the whole server boot).
 */
let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    throw new Error(
      "EMAIL_USER and EMAIL_PASS must be set in .env to send mail.",
    );
  }

  // Gmail on port 587 with STARTTLS (secure: false + STARTTLS upgrade).
  // `pass` must be an app-specific password, not the Gmail account password —
  // Google blocks account-password SMTP logins since 2022.
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  return cachedTransporter;
}

/**
 * Render an EJS template from `src/mailer/templates/` into an HTML string.
 *
 * Uses EJS's `async: true` mode — the returned Promise resolves to the fully
 * rendered output. (EJS's older callback signature silently returned undefined
 * from a sync wrapper; the async form makes the render awaitable and
 * error-propagating.)
 */
export async function renderTemplate(
  templateName: string,
  data: Record<string, unknown>,
): Promise<string> {
  const file = path.join(TEMPLATE_DIR, templateName);
  return ejs.renderFile(file, data, { async: true });
}

type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Send a pre-rendered HTML email via the cached Gmail transporter.
 * Resolves with Nodemailer's info object on success, rejects on any SMTP error.
 */
export async function sendMail({ to, subject, html }: SendMailArgs) {
  const transporter = getTransporter();
  // From address is always our configured Gmail account — required by SMTP
  // and (separately) by Gmail's anti-spoofing rules.
  const from = process.env.EMAIL_USER;
  return transporter.sendMail({ from, to, subject, html });
}
