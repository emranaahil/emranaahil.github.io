import fs from "node:fs";
import path from "node:path";
import {
  LOCALES,
  absoluteUrl,
  hreflangMarkup,
  localeMeta,
  seoFromMessages,
  type LangCode,
  type SeoCopy,
} from "../src/lib/localePath.ts";

type GraphNode = {
  "@type"?: string;
  "@id"?: string;
  url?: string;
  description?: string;
  inLanguage?: string;
  featureList?: unknown;
  mainEntity?: unknown;
};

function readMessages(root: string, code: LangCode): Record<string, unknown> {
  const file = path.join(root, "src", "locales", code, "translation.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const re = new RegExp(
    `(<meta\\b[^>]*?\\b${attr}=["']${key}["'][^>]*?\\bcontent=["'])([\\s\\S]*?)(["'])`,
    "i",
  );
  if (!re.test(html)) throw new Error(`Missing meta ${attr}=${key}`);
  return html.replace(re, (_match, start: string, _old: string, end: string) => `${start}${esc(content)}${end}`);
}

function localizeJsonLd(html: string, lang: LangCode, pageUrl: string, seo: SeoCopy): string {
  return html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    (_match, json: string) => {
      const data = JSON.parse(json) as { "@graph": GraphNode[] };
      const keepFaq = lang === "en" || seo.faqs.length > 0;
      data["@graph"] = data["@graph"].filter((node) => node["@type"] !== "FAQPage" || keepFaq);
      for (const node of data["@graph"]) {
        if (node["@type"] === "WebApplication") {
          node["@id"] = `${pageUrl}#webapp`;
          node.url = pageUrl;
          node.inLanguage = localeMeta(lang).hreflang;
          if (lang !== "en") {
            node.description = seo.description;
            delete node.featureList;
          }
        }
        if (node["@type"] === "FAQPage") {
          node["@id"] = `${pageUrl}#faq`;
          if (lang !== "en") {
            node.mainEntity = seo.faqs.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            }));
          }
        }
      }
      return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>`;
    },
  );
}

function heroBlock(seo: SeoCopy): string {
  return `<div id="root"><main class="ui-wrap py-8"><h1 class="ui-hero text-text-primary">${esc(seo.heroTitle)}<span class="mt-1 block">${esc(seo.heroLine)}</span></h1><p class="ui-body mt-3 max-w-xl text-text-secondary">${esc(seo.heroSupport)}</p></main></div>`;
}

function localize(template: string, lang: LangCode, messages: Record<string, unknown>): string {
  const seo = seoFromMessages(lang, messages);
  const pageUrl = absoluteUrl(lang);
  const meta = localeMeta(lang);
  let html = template.replace(/<html lang="[^"]*">/, `<html lang="${meta.htmlLang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`);
  html = setMeta(html, "name", "description", seo.description);
  html = setMeta(html, "name", "keywords", seo.keywords);
  html = setMeta(html, "property", "og:url", pageUrl);
  html = setMeta(html, "property", "og:title", seo.title);
  html = setMeta(html, "property", "og:description", seo.ogDescription);
  html = setMeta(html, "property", "og:locale", meta.og);
  html = setMeta(html, "name", "twitter:title", seo.title);
  html = setMeta(html, "name", "twitter:description", seo.ogDescription);
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    (_m, start: string, end: string) => `${start}${pageUrl}${end}`,
  );
  html = localizeJsonLd(html, lang, pageUrl, seo);
  if (!html.includes('hreflang="x-default"')) {
    const alternates = LOCALES.filter((item) => item.code !== lang)
      .map((item) => `<meta property="og:locale:alternate" content="${item.og}" />`)
      .join("\n    ");
    html = html.replace(
      /(<meta property="og:locale" content="[^"]*" \/>)/,
      `$1\n    ${alternates}`,
    );
    html = html.replace("</head>", `    ${hreflangMarkup()}\n  </head>`);
  }
  if (!/<div id="root">\s*<\/div>/.test(html)) {
    throw new Error("Could not find an empty #root for the language heading");
  }
  html = html.replace(/<div id="root">\s*<\/div>/, heroBlock(seo));
  return html;
}

function sitemapXml(): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const alternates = [
    ...LOCALES.map(
      (item) => `    <xhtml:link rel="alternate" hreflang="${item.hreflang}" href="${absoluteUrl(item.code)}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl("en")}" />`,
  ].join("\n");
  const urls = LOCALES.map((item) => {
    const priority = item.code === "en" ? "1.0" : "0.8";
    return `  <url>\n    <loc>${absoluteUrl(item.code)}</loc>\n${alternates}\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/** Write /hi/index.html and the other language folders from the built English page. */
export function writeLocalizedPages(distDir: string, projectRoot: string) {
  const template = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  for (const item of LOCALES) {
    const html = localize(template, item.code, readMessages(projectRoot, item.code));
    if (item.code === "en") {
      fs.writeFileSync(path.join(distDir, "index.html"), html);
      continue;
    }
    const dir = path.join(distDir, item.code);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
  const xml = sitemapXml();
  fs.writeFileSync(path.join(distDir, "sitemap.xml"), xml);
  fs.writeFileSync(path.join(projectRoot, "public", "sitemap.xml"), xml);
}
