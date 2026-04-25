export const THEME_STORAGE_KEY = "ai-room:theme";

export type ThemePreference = "light" | "dark";

export function readStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* private mode */
  }
  return null;
}

export function writeStoredTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function getDocumentTheme(): ThemePreference {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

export function applyHtmlClass(theme: ThemePreference): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

const THEME_CHANGE_EVENT = "ai-room:theme-change";

export function emitThemeChange(): void {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeThemeChange(onStoreChange: () => void): () => void {
  const onThemeChange = () => {
    onStoreChange();
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    const next = e.newValue === "dark" || e.newValue === "light" ? e.newValue : null;
    if (next) applyHtmlClass(next);
    else applyHtmlClass("dark");
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Read `--theme-reveal-fill` as if `theme` were active, without a paint. */
export function readRevealFillForTheme(theme: ThemePreference): string {
  const root = document.documentElement;
  const hadDark = root.classList.contains("dark");
  root.classList.toggle("dark", theme === "dark");
  const fill = getComputedStyle(root).getPropertyValue("--theme-reveal-fill").trim();
  root.classList.toggle("dark", hadDark);
  if (fill) return fill;
  return theme === "dark" ? "#0a0a0a" : "#ffffff";
}

export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var v=localStorage.getItem(k);var r=document.documentElement;if(v==="light"){r.classList.remove("dark");r.style.colorScheme="light";}else{r.classList.add("dark");r.style.colorScheme="dark";}}catch(e){try{document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}catch(x){}}})();`;
