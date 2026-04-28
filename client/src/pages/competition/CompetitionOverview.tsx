import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, Link } from "react-router-dom";
import { ListChecks, ClipboardList, ListOrdered, Award, Radio, Settings, Cpu } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../../lib/api";
import type { Competition, ShowClass, Entry } from "../../lib/types";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

const cards = [
  { to: "live", key: "live", icon: Radio, color: "text-neon-pink" },
  { to: "classes", key: "classes", icon: ListChecks, color: "text-neon-violet" },
  { to: "entries", key: "entries", icon: ClipboardList, color: "text-neon-cyan" },
  { to: "start-list", key: "startList", icon: ListOrdered, color: "text-neon-amber" },
  { to: "results", key: "results", icon: Award, color: "text-neon-lime" },
  { to: "devices", key: "devices", icon: Cpu, color: "text-neon-cyan" },
  { to: "settings", key: "settings", icon: Settings, color: "text-white/70" },
];

export function CompetitionOverview() {
  const { t } = useTranslation();
  const { competitionId } = useOutletContext<OutletCtx>();

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const { data: entries = [] } = useQuery<Entry[]>({
    queryKey: ["entries", competitionId],
    queryFn: () => api.get(`/entries?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card text-center">
          <div className="text-xs uppercase tracking-wider text-white/55 font-bold">{t("classes.title")}</div>
          <div className="text-3xl font-display font-bold text-white mt-1">{classes.length}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs uppercase tracking-wider text-white/55 font-bold">{t("entries.title")}</div>
          <div className="text-3xl font-display font-bold text-white mt-1">{entries.length}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs uppercase tracking-wider text-white/55 font-bold">{t("riders.title")}</div>
          <div className="text-3xl font-display font-bold text-white mt-1">
            {new Set(entries.map((e) => e.riderId)).size}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-xs uppercase tracking-wider text-white/55 font-bold">{t("status.ACTIVE")}</div>
          <div className="text-3xl font-display font-bold text-white mt-1">
            {classes.filter((c) => c.active).length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c, idx) => (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
          >
            <Link
              to={`/competitions/${competitionId}/${c.to}`}
              className="card flex items-center gap-3 hover:bg-white/[0.05] transition group"
            >
              <div className={`w-12 h-12 rounded-xl glass flex items-center justify-center ${c.color}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-display font-bold text-white">{t(`nav.${c.key}`)}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
