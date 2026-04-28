import { useTranslation } from "react-i18next";

const styles: Record<string, string> = {
  DRAFT: "badge-mute",
  ACTIVE: "badge-lime",
  FINISHED: "badge-violet",
  REGISTERED: "badge-cyan",
  SCRATCHED: "badge-mute",
  DONE: "badge-violet",
  PENDING: "badge-mute",
  OK: "badge-lime",
  RETIRED: "badge-amber",
  ELIMINATED: "badge-pink",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = styles[status] ?? "badge-mute";
  return <span className={cls}>{t(`status.${status}`, status)}</span>;
}
