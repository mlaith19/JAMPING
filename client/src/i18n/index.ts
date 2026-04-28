import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import he from "./locales/he.json";
import ar from "./locales/ar.json";

export const SUPPORTED_LANGS = ["en", "he", "ar"] as const;
const RTL_LANGS = new Set<string>(["he", "ar"]);

export function applyDir(lang: string) {
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "showjump.lang",
    },
    interpolation: { escapeValue: false },
  });

applyDir(i18n.language || "en");
i18n.on("languageChanged", (lng) => applyDir(lng));

export default i18n;
