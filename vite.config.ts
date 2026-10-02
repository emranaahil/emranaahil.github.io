import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { writeLocalizedPages } from "./scripts/localize-pages.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

const permissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), accelerometer=(), autoplay=()";

/** Production policy. Matches public/_headers. No eval, no dev websockets. */
const productionCsp =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; upgrade-insecure-requests";

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": permissionsPolicy,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-DNS-Prefetch-Control": "off",
  "X-XSS-Protection": "0",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": productionCsp,
};

/**
 * GitHub Pages does not send public/_headers.
 * These three can be enforced from the document. X-Frame-Options and
 * X-Content-Type-Options cannot. Dev HTML stays free of CSP so Vite HMR works.
 */
function localizedPagesPlugin(projectRoot: string): Plugin {
  let wrote = false;
  return {
    name: "localized-pages",
    apply: "build",
    closeBundle() {
      if (wrote) return;
      const indexPath = path.resolve(projectRoot, "dist", "index.html");
      if (!existsSync(indexPath)) return;
      wrote = true;
      writeLocalizedPages(path.resolve(projectRoot, "dist"), projectRoot);
    },
  };
}

function securityMetaPlugin(): Plugin {
  return {
    name: "security-meta",
    apply: "build",
    transformIndexHtml(html) {
      if (html.includes("http-equiv=\"Content-Security-Policy\"")) return html;
      const tags = [
        `<meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`,
        `<meta name="referrer" content="no-referrer" />`,
        `<meta http-equiv="Permissions-Policy" content="${permissionsPolicy}" />`,
      ].join("\n    ");
      return html.replace("<head>", `<head>\n    ${tags}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), securityMetaPlugin(), localizedPagesPlugin(root)],
  base: "/",
  server: {
    headers: {
      ...securityHeaders,
      "Content-Security-Policy":
        "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; child-src 'self' blob:; upgrade-insecure-requests",
    },
  },
  preview: {
    headers: securityHeaders,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@qpdf-engine": path.join(root, "node_modules/@jspawn/qpdf-wasm/qpdf.js"),
    },
  },
  worker: { format: "es" },
  optimizeDeps: {
    include: ["pdfjs-dist", "pdf-lib", "fabric"],
    exclude: ["@jspawn/qpdf-wasm"],
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});
