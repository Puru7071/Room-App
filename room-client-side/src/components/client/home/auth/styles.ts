/**
 * All chrome class constants for the auth gate. Pulled out of AuthGateForms
 * so each mode/part can import only what it needs and the orchestrator stays
 * focused on logic, not Tailwind strings.
 *
 * Naming convention:
 * - `chrome*` — the rounded card background that wraps inputs and buttons.
 * - `cta*` — gradient call-to-action variants (gate buttons, inline buttons).
 * - `cta*Inline` — gradient buttons sized to fit beside an input (no `w-full`).
 * - `ctaIcon*` — circular icon-only buttons (tick / back / loading).
 * - `auth*` / `gate*` — layout wrappers shared across modes.
 * - `cell*` — the input and its surrounding chrome.
 */

const chromeShell =
  "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_40px_-15px_rgba(15,23,42,0.14)] dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.35)]";

const chromeCard = `${chromeShell} flex min-w-0 items-stretch`;

export const rowChrome = `${chromeCard} w-full min-h-[2.875rem] sm:min-h-[3.125rem]`;

/** Gate-screen full-width gradient buttons (Log in / Sign up). */
export const ctaJoin =
  "flex h-full min-h-[2.875rem] w-full min-w-[6.5rem] cursor-pointer items-center justify-center border-0 bg-gradient-to-b from-violet-500 via-violet-600 to-purple-900 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-[0_10px_26px_-8px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[3.125rem] sm:min-w-[7rem] sm:px-3.5 sm:py-3 sm:text-[15px]";

export const ctaCreate =
  "flex h-full min-h-[2.875rem] w-full min-w-[6.5rem] cursor-pointer items-center justify-center border-0 bg-gradient-to-b from-sky-500 via-blue-600 to-indigo-700 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-[0_10px_26px_-8px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-80 sm:min-h-[3.125rem] sm:min-w-[7rem] sm:px-3.5 sm:py-3 sm:text-[15px]";

/** Circular icon-button base + variants for the tick/back/loading buttons. */
const ctaIconBase =
  "flex aspect-square h-[2.875rem] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[3.125rem]";

export const ctaIconJoin = `${ctaIconBase} bg-gradient-to-b from-violet-500 via-violet-600 to-purple-900 text-white shadow-[0_10px_26px_-8px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

export const ctaIconCreate = `${ctaIconBase} bg-gradient-to-b from-sky-500 via-blue-600 to-indigo-700 text-white shadow-[0_10px_26px_-8px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

export const ctaIconBack = `${ctaIconBase} bg-zinc-600 text-zinc-50 hover:bg-zinc-500 active:bg-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600`;

/**
 * Inline gradient buttons for the rooms-gate — sized to their content and
 * pinned to the right of an inline input. `shrink-0 self-stretch` plus
 * horizontal-only padding so the chrome's `min-h` sets the height.
 */
const ctaInlineBase =
  "flex shrink-0 cursor-pointer items-center justify-center self-stretch border-0 px-5 min-w-[6rem] text-sm font-semibold tracking-tight text-white outline-none transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-80 sm:px-6 sm:min-w-[7rem] sm:text-[15px]";

export const ctaInlineCreate = `${ctaInlineBase} bg-gradient-to-b from-sky-500 via-blue-600 to-indigo-700 shadow-[0_10px_26px_-8px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

export const ctaInlineJoin = `${ctaInlineBase} bg-gradient-to-b from-violet-500 via-violet-600 to-purple-900 shadow-[0_10px_26px_-8px_rgba(139,92,246,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]`;

/**
 * Identical margins/max-width across every mode so switching modes never
 * jumps the page layout.
 */
export const authBlockOuter =
  "relative mx-auto mt-2 mb-6 flex w-full min-w-0 max-w-[min(100%,56rem)] flex-col sm:mt-2.5 sm:mb-8 sm:max-w-[62rem] overflow-y-visible";

/** Gate-screen + rooms-gate row of two cards. */
export const gateRowInner =
  "flex w-full flex-row flex-wrap items-start justify-center gap-3 pb-6 sm:items-center sm:gap-5 sm:pb-7";

/** Fields row for login + signup: stack on mobile, row on sm+. pb-7 reserves
 *  space for the absolute error line so adding/removing errors doesn't shift. */
export const formFieldsRow =
  "flex w-full min-w-0 flex-col items-start gap-3 pb-6 sm:flex-row sm:flex-nowrap sm:gap-3 sm:pb-7";

/**
 * Form button row (tick + back). Below fields on mobile (right-aligned),
 * absolute-right on sm+ via translate so the fields row stays full width.
 */
export const formButtonsRow =
  "mt-3 flex w-full flex-row justify-end gap-2.5 sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:w-auto sm:translate-x-[calc(100%+0.75rem)] sm:gap-3";

export const authFieldColumn =
  "flex min-w-0 max-w-full flex-1 flex-col gap-0 basis-0 sm:min-w-[7.5rem]";

export const authInputFieldStack = "relative w-full min-w-0 overflow-visible";

/** Absolute-positioned inline error line, anchored just below a field cell. */
export const fieldErrorAbsolute =
  "absolute left-3 top-full mt-1 whitespace-nowrap text-left text-xs leading-none text-red-600 sm:left-3.5 sm:text-sm dark:text-red-400";

export const cellField = `${chromeShell} min-h-[2.875rem] w-full min-w-0 sm:min-h-[3.125rem]`;

export const cellInput =
  "h-full min-h-[2.875rem] w-full min-w-0 border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted focus:ring-0 sm:min-h-[3.125rem] sm:px-3.5 sm:py-2.5 sm:text-[15px]";

/** Gate column constraint — caps each gate-screen card's max width. */
export const gateCol =
  "flex w-full min-w-0 max-w-[min(100%,20rem)] flex-col gap-0 sm:max-w-[22rem]";

/** One OTP digit cell — mirrors the boxed style used in `OTPMail.ejs`. */
export const otpDigitCell =
  "flex h-[2.875rem] w-[2.75rem] min-w-0 items-center justify-center rounded-xl border border-border bg-card text-center font-mono text-lg font-semibold text-foreground outline-none shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/30 sm:h-[3.125rem] sm:w-[3rem] sm:text-xl";

/** Eye toggle that lives inside the password `cellField` flex row. */
export const passwordToggleButton =
  "flex h-full shrink-0 cursor-pointer items-center justify-center px-3 text-muted outline-none transition hover:text-foreground focus-visible:text-foreground sm:px-3.5";
