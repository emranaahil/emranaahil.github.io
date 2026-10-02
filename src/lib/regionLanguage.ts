/** Timezone and browser language. Same rules the site already used before language URLs. */
export function detectRegionLanguage(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Kolkata") || tz.includes("Calcutta")) {
      if (typeof navigator !== "undefined") {
        const nav = (navigator.languages || [navigator.language]).join(",").toLowerCase();
        if (nav.includes("mr")) return "mr";
        if (nav.includes("bn")) return "bn";
        if (nav.includes("te")) return "te";
        if (nav.includes("ta")) return "ta";
      }
      return "hi";
    }
    if (tz.includes("Jakarta") || tz.includes("Makassar") || tz.includes("Jayapura")) {
      return "id";
    }
    if (
      tz.includes("Sao_Paulo") ||
      tz.includes("Fortaleza") ||
      tz.includes("Manaus") ||
      tz.includes("Recife") ||
      tz.includes("Belem") ||
      tz.includes("Cuiaba")
    ) {
      return "pt-BR";
    }
    if (tz.includes("Ho_Chi_Minh") || tz.includes("Saigon") || tz.includes("Hanoi")) {
      return "vi";
    }
    if (tz.includes("Manila")) {
      return "tl";
    }
    if (
      tz.includes("Madrid") ||
      tz.includes("Canary") ||
      tz.includes("Mexico") ||
      tz.includes("Bogota") ||
      tz.includes("Buenos_Aires") ||
      tz.includes("Santiago") ||
      tz.includes("Lima") ||
      tz.includes("Caracas") ||
      tz.includes("Montevideo") ||
      tz.includes("Asuncion") ||
      tz.includes("La_Paz") ||
      tz.includes("Guayaquil") ||
      tz.includes("Tegucigalpa") ||
      tz.includes("Guatemala") ||
      tz.includes("Managua") ||
      tz.includes("San_Jose") ||
      tz.includes("San_Salvador") ||
      tz.includes("Panama") ||
      tz.includes("Santo_Domingo") ||
      tz.includes("Havana")
    ) {
      return "es";
    }
  } catch {
    /* fall through to the browser language list */
  }

  if (typeof navigator !== "undefined") {
    const langs = navigator.languages || [navigator.language];
    for (const l of langs) {
      const code = l?.toLowerCase();
      if (!code) continue;
      if (code.startsWith("hi")) return "hi";
      if (code.startsWith("mr")) return "mr";
      if (code.startsWith("bn")) return "bn";
      if (code.startsWith("te")) return "te";
      if (code.startsWith("ta")) return "ta";
      if (code.startsWith("id")) return "id";
      if (code.startsWith("pt")) return "pt-BR";
      if (code.startsWith("es")) return "es";
      if (code.startsWith("vi")) return "vi";
      if (code.startsWith("tl") || code.startsWith("fil")) return "tl";
      if (code.startsWith("en")) return "en";
    }
  }

  return "en";
}
