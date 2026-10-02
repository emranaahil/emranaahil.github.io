import { languageFromPath, pathFor, seoFromMessages, type LangCode } from "./localePath";

const STORAGE_KEY = "i18nextLng";

export function rememberLanguage(lang: LangCode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private browsing */
  }
}

/** Tab title, description, and html lang follow the active language. */
export function applyDocumentMeta(lang: LangCode, messages: Record<string, unknown>) {
  const seo = seoFromMessages(lang, messages);
  document.documentElement.lang = lang;
  document.title = seo.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", seo.description);
}

/** Update the address without reloading, so an open PDF stays in memory. */
export function pushLanguageUrl(lang: LangCode) {
  const path = pathFor(lang);
  const next = path + window.location.search + window.location.hash;
  const here = window.location.pathname + window.location.search + window.location.hash;
  if (next !== here) history.pushState({ locale: lang }, "", next);
}

export function installLocaleHistory(onLanguage: (lang: LangCode) => void) {
  window.addEventListener("popstate", () => {
    onLanguage(languageFromPath(window.location.pathname) ?? "en");
  });
}
