import { decideLocale } from "./lib/localePath";
import { detectRegionLanguage } from "./lib/regionLanguage";

const STORAGE_KEY = "i18nextLng";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Move / to /hi/ (and the other folders) when the saved language or the
 * timezone says so. A page that is already /hi/ stays there. Returns false
 * when the browser is leaving this URL, so the app does not boot twice.
 */
export function bootLocale(): boolean {
  const decision = decideLocale({
    pathname: window.location.pathname,
    stored: readStored(),
    region: detectRegionLanguage(),
  });
  if (!decision.redirectTo) return true;
  const next = decision.redirectTo + window.location.search + window.location.hash;
  const here = window.location.pathname + window.location.search + window.location.hash;
  if (next === here) return true;
  window.location.replace(next);
  return false;
}
