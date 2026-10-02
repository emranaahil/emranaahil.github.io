import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { bootLocale } from "./localeBoot";
import "./index.css";

if (bootLocale()) {
  void import("./i18n").then(async ({ localeReady }) => {
    await localeReady;
    const { default: App } = await import("./App");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
