import { useTranslation } from "react-i18next";
import { canonicalLang } from "../lib/localePath";
import { selectLanguage } from "../i18n";
import { Icon } from "./Icon";

const LANGS = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "HI" },
  { code: "mr", label: "मराठी", short: "MR" },
  { code: "bn", label: "বাংলা", short: "BN" },
  { code: "te", label: "తెలుగు", short: "TE" },
  { code: "ta", label: "தமிழ்", short: "TA" },
  { code: "id", label: "Bahasa Indonesia", short: "ID" },
  { code: "pt-BR", label: "Português (Brasil)", short: "PT" },
  { code: "es", label: "Español", short: "ES" },
  { code: "vi", label: "Tiếng Việt", short: "VI" },
  { code: "tl", label: "Tagalog", short: "TL" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = canonicalLang(i18n.resolvedLanguage || i18n.language) ?? "en";

  return (
    <div className="relative inline-flex items-center">
      <label className="relative flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-xs transition-all hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
        <Icon name="globe" className="h-4 w-4 shrink-0 text-primary" />
        <span className="sr-only">{t("language")}</span>
        <select
          value={current}
          onChange={(e) => selectLanguage(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-text-primary focus:outline-none"
          aria-label={t("language")}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code} className="bg-surface text-text-primary py-1 text-xs">
              {compact ? `${l.short} - ${l.label}` : `${l.label} (${l.short})`}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 text-[10px] text-text-muted">▼</span>
      </label>
    </div>
  );
}
