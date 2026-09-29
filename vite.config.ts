import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), accelerometer=(), autoplay=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-DNS-Prefetch-Control": "off",
  "X-XSS-Protection": "0",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; child-src 'self' blob:; upgrade-insecure-requests",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    headers: securityHeaders,
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
