/** Language URLs for GitHub Pages. English stays on /. Other languages use /hi/, /bn/, and so on. */

export const ORIGIN = "https://emranaahil.github.io";

export const ENGLISH_TITLE = "PDF Studio — 100% Private Browser PDF Editor";
export const ENGLISH_DESCRIPTION =
  "PDF Studio — 100% Client-Side Browser PDF Editor. View, edit, compress, merge, split, sign, lock, and convert PDFs directly in your browser. No file uploads, maximum privacy.";
export const ENGLISH_OG_DESCRIPTION =
  "Edit, compress, merge, split, sign, lock, and convert PDFs 100% in your browser. Files never leave your device.";
export const ENGLISH_KEYWORDS =
  "PDF editor, online PDF editor, free PDF editor, private PDF editor, compress PDF, merge PDF, edit PDF text, sign PDF, client-side PDF editor, PDF security, qpdf wasm";

export const LOCALES = [
  { code: "en", hreflang: "en", og: "en_US", htmlLang: "en" },
  { code: "hi", hreflang: "hi", og: "hi_IN", htmlLang: "hi" },
  { code: "mr", hreflang: "mr", og: "mr_IN", htmlLang: "mr" },
  { code: "bn", hreflang: "bn", og: "bn_IN", htmlLang: "bn" },
  { code: "te", hreflang: "te", og: "te_IN", htmlLang: "te" },
  { code: "ta", hreflang: "ta", og: "ta_IN", htmlLang: "ta" },
  { code: "id", hreflang: "id", og: "id_ID", htmlLang: "id" },
  { code: "pt-BR", hreflang: "pt-BR", og: "pt_BR", htmlLang: "pt-BR" },
  { code: "es", hreflang: "es", og: "es_ES", htmlLang: "es" },
  { code: "vi", hreflang: "vi", og: "vi_VN", htmlLang: "vi" },
  { code: "tl", hreflang: "tl", og: "fil_PH", htmlLang: "tl" },
] as const;

export type LangCode = (typeof LOCALES)[number]["code"];

const KEYWORD_KEYS = [
  "app_name",
  "hero_title",
  "tool_compress",
  "tool_merge",
  "tool_rotate",
  "tool_sign",
  "tool_protect",
  "tool_unlock",
  "tool_hide",
  "tool_pages",
  "tool_bw",
  "tool_text_editor",
] as const;

export function localeMeta(code: LangCode) {
  const found = LOCALES.find((item) => item.code === code);
  return found ?? LOCALES[0];
}

/** Map a browser or saved tag onto a language this site publishes. */
export function canonicalLang(input: string | null | undefined): LangCode | null {
  if (!input) return null;
  const raw = input.trim().replace(/_/g, "-");
  if (!raw) return null;
  const exact = LOCALES.find((item) => item.code.toLowerCase() === raw.toLowerCase());
  if (exact) return exact.code;
  const base = raw.split("-")[0]?.toLowerCase() ?? "";
  if (base === "pt") return "pt-BR";
  if (base === "fil") return "tl";
  const byBase = LOCALES.find((item) => item.code.toLowerCase() === base);
  return byBase?.code ?? null;
}

/** First path segment, so /hi/ and /hi both mean Hindi. Ignores /assets/. */
export function languageFromPath(pathname: string): LangCode | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  try {
    return canonicalLang(decodeURIComponent(segment));
  } catch {
    return null;
  }
}

export function pathFor(lang: LangCode): string {
  return lang === "en" ? "/" : `/${lang}/`;
}

export function absoluteUrl(lang: LangCode): string {
  return lang === "en" ? `${ORIGIN}/` : `${ORIGIN}${pathFor(lang)}`;
}

export type LocaleDecision = {
  lang: LangCode;
  /** Set when the address should move to the language folder. Null when the URL already matches. */
  redirectTo: string | null;
};

/**
 * The URL wins. A saved choice wins over the timezone guess.
 * English stays on /. Any other language gets its own folder.
 */
export function decideLocale(input: {
  pathname: string;
  stored: string | null;
  region: string | null;
}): LocaleDecision {
  const fromPath = languageFromPath(input.pathname);
  if (fromPath) return { lang: fromPath, redirectTo: null };
  const lang = canonicalLang(input.stored) ?? canonicalLang(input.region) ?? "en";
  if (lang !== "en") return { lang, redirectTo: pathFor(lang) };
  return { lang: "en", redirectTo: null };
}

export type SeoCopy = {
  title: string;
  description: string;
  ogDescription: string;
  keywords: string;
  heroTitle: string;
  heroLine: string;
  heroSupport: string;
  faqs: { q: string; a: string }[];
};

function text(messages: Record<string, unknown>, key: string): string {
  const value = messages[key];
  return typeof value === "string" ? value : "";
}

/** Title, description, and heading for one language. English keeps the existing search snippet. */
export function seoFromMessages(lang: LangCode, messages: Record<string, unknown>): SeoCopy {
  const heroTitle = text(messages, "hero_title");
  const heroLine = text(messages, "hero_line");
  const heroSupport = text(messages, "hero_support");
  const footer = text(messages, "footer_blurb");
  const keywords = [
    ...new Set(
      KEYWORD_KEYS.map((key) => text(messages, key).replace(/[।.]+$/u, "").trim()).filter((part) => part.length > 0),
    ),
  ].join(", ");
  const faqs = [1, 2, 3, 4]
    .map((n) => ({ q: text(messages, `faq_q${n}`), a: text(messages, `faq_a${n}`) }))
    .filter((item) => item.q && item.a);
  if (lang === "en") {
    return {
      title: ENGLISH_TITLE,
      description: ENGLISH_DESCRIPTION,
      ogDescription: ENGLISH_OG_DESCRIPTION,
      keywords: ENGLISH_KEYWORDS,
      heroTitle,
      heroLine,
      heroSupport,
      faqs,
    };
  }
  return {
    title: `PDF Studio — ${heroTitle}`,
    description: [heroSupport, footer].filter(Boolean).join(" "),
    ogDescription: heroSupport,
    keywords,
    heroTitle,
    heroLine,
    heroSupport,
    faqs,
  };
}

export function hreflangMarkup(): string {
  const links = LOCALES.map(
    (item) => `<link rel="alternate" hreflang="${item.hreflang}" href="${absoluteUrl(item.code)}" />`,
  );
  links.push(`<link rel="alternate" hreflang="x-default" href="${absoluteUrl("en")}" />`);
  return links.join("\n    ");
}
