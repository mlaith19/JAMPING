import { useTranslation } from "react-i18next";

export function CompetitionReport() {
  const { t } = useTranslation();
  return (
    <div className="card">
      <h2 className="font-display font-bold text-white text-lg">{t("nav.report")}</h2>
      <p className="text-sm text-white/60 mt-2">{t("results.title")}</p>
    </div>
  );
}
