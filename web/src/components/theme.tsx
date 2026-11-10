"use client";

import { useSyncExternalStore } from "react";

/** localStorage key for an explicit light or dark choice. No key means the default, dark. */
export const THEME_KEY = "criclysis-theme";
const EVENT = "criclysis-theme";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  // Another tab changed the choice: apply it here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    if (e.newValue === "light" || e.newValue === "dark") document.documentElement.dataset.theme = e.newValue;
    else delete document.documentElement.dataset.theme;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Switches between light and dark and remembers the choice. Dark is the
 * default (app/globals.css sets color-scheme: dark and the tokens use
 * light-dark()), so the server never needs to know the theme.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);
  const dark = theme === "dark";

  const toggle = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or storage disabled: the choice lasts for this page only.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === null ? undefined : dark}
      title={theme === null ? "Dark theme" : dark ? "Switch to the light theme" : "Switch to the dark theme"}
      className="icon-btn text-muted hover:text-fg"
    >
      <span className="sr-only">Dark theme</span>
      <svg className="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
