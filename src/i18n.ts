import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { applyDocumentMeta, installLocaleHistory, pushLanguageUrl, rememberLanguage } from "./lib/documentMeta";
import { canonicalLang, decideLocale, type LangCode } from "./lib/localePath";
import { detectRegionLanguage } from "./lib/regionLanguage";
import en from "./locales/en/translation.json";
import hi from "./locales/hi/translation.json";
import mr from "./locales/mr/translation.json";
import bn from "./locales/bn/translation.json";
import te from "./locales/te/translation.json";
import ta from "./locales/ta/translation.json";
import es from "./locales/es/translation.json";
import id from "./locales/id/translation.json";
import ptBR from "./locales/pt-BR/translation.json";
import vi from "./locales/vi/translation.json";
import tl from "./locales/tl/translation.json";

function initialLanguage(): string {
  if (typeof window === "undefined") return "en";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("i18nextLng");
  } catch {
    stored = null;
  }
  return decideLocale({
    pathname: window.location.pathname,
    stored,
    region: detectRegionLanguage(),
  }).lang;
}

function messagesFor(lang: LangCode): Record<string, unknown> {
  return (i18n.getResourceBundle(lang, "translation") as Record<string, unknown> | undefined) ?? {};
}

function showLanguage(lang: LangCode) {
  applyDocumentMeta(lang, messagesFor(lang));
}

/** Switch language in place. The PDF stays open. The URL becomes /hi/ or /. */
export function selectLanguage(code: string) {
  const lang = canonicalLang(code) ?? "en";
  rememberLanguage(lang);
  pushLanguageUrl(lang);
  void i18n.changeLanguage(lang).then(() => showLanguage(lang));
}

export const localeReady = i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      bn: { translation: bn },
      te: { translation: te },
      ta: { translation: ta },
      es: { translation: es },
      id: { translation: id },
      "pt-BR": { translation: ptBR },
      vi: { translation: vi },
      tl: { translation: tl },
    },
    lng: initialLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  .then(() => {
    const lang = canonicalLang(i18n.resolvedLanguage || i18n.language) ?? "en";
    showLanguage(lang);
    installLocaleHistory((next) => {
      rememberLanguage(next);
      void i18n.changeLanguage(next).then(() => showLanguage(next));
    });
  });

export default i18n;
