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

const devCsp =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; child-src 'self' blob:; upgrade-insecure-requests";

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
 * These security headers can be enforced or recognized from document meta tags.
 * Dev HTML uses devCsp so Vite HMR works.
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
    transformIndexHtml(html, ctx) {
      const isDev = Boolean(ctx.server);
      const csp = isDev ? devCsp : productionCsp;

      if (html.includes('http-equiv="Content-Security-Policy"')) {
        html = html.replace(
          /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["'][^"']*["']\s*\/?>/i,
          `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      } else {
        html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      }

      if (!html.includes('http-equiv="X-Frame-Options"')) {
        html = html.replace("<head>", `<head>\n    <meta http-equiv="X-Frame-Options" content="DENY" />`);
      }
      if (!html.includes('http-equiv="X-Content-Type-Options"')) {
        html = html.replace("<head>", `<head>\n    <meta http-equiv="X-Content-Type-Options" content="nosniff" />`);
      }
      if (!html.includes('name="referrer"')) {
        html = html.replace("<head>", `<head>\n    <meta name="referrer" content="no-referrer" />`);
      }
      if (!html.includes('http-equiv="Referrer-Policy"')) {
        html = html.replace("<head>", `<head>\n    <meta http-equiv="Referrer-Policy" content="no-referrer" />`);
      }
      if (!html.includes('http-equiv="Permissions-Policy"')) {
        html = html.replace("<head>", `<head>\n    <meta http-equiv="Permissions-Policy" content="${permissionsPolicy}" />`);
      }
      return html;
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
