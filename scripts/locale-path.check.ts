import { decideLocale, languageFromPath } from "../src/lib/localePath.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(languageFromPath("/") === null, "root has no language segment");
assert(languageFromPath("/hi/") === "hi", "hindi folder");
assert(languageFromPath("/hi") === "hi", "hindi without slash");
assert(languageFromPath("/pt-br/") === "pt-BR", "portuguese case");
assert(languageFromPath("/assets/app.js") === null, "assets is not a language");

assert(decideLocale({ pathname: "/", stored: null, region: "hi" }).redirectTo === "/hi/", "region redirect");
assert(decideLocale({ pathname: "/hi/", stored: "en", region: "en" }).lang === "hi", "path wins");
assert(decideLocale({ pathname: "/", stored: "en", region: "hi" }).redirectTo === null, "saved english stays");
assert(decideLocale({ pathname: "/", stored: null, region: "en" }).lang === "en", "default english");
assert(decideLocale({ pathname: "/", stored: "pt", region: null }).redirectTo === "/pt-BR/", "pt maps to pt-BR");
assert(decideLocale({ pathname: "/bn", stored: "hi", region: "en" }).redirectTo === null, "bn path does not redirect");

console.log("locale path ok");
