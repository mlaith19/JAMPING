import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  LayoutGrid,
  ListChecks,
  ClipboardList,
  ListOrdered,
  Award,
  Cpu,
  Settings,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../../lib/api";
import type { Competition, Entry, ShowClass } from "../../lib/types";
import { StatusBadge } from "../../components/ui/StatusBadge";

const liveTile = {
  to: "live",
  key: "live",
  icon: Radio,
  gradient: "from-neon-pink/[0.22] via-rose-500/[0.12] to-transparent",
  iconColor: "text-neon-pink",
  blob: "bg-neon-pink",
};

const otherTiles = [
  { to: "overview", key: "overview", icon: LayoutGrid, gradient: "from-neon-violet/[0.14] to-transparent", iconColor: "text-neon-violet", blob: "bg-neon-violet" },
  { to: "classes", key: "classes", icon: ListChecks, gradient: "from-neon-cyan/[0.14] to-transparent", iconColor: "text-neon-cyan", blob: "bg-neon-cyan" },
  { to: "entries", key: "entries", icon: ClipboardList, gradient: "from-neon-amber/[0.14] to-transparent", iconColor: "text-neon-amber", blob: "bg-neon-amber" },
  { to: "start-list", key: "startList", icon: ListOrdered, gradient: "from-indigo-400/[0.14] to-transparent", iconColor: "text-indigo-300", blob: "bg-indigo-500" },
  { to: "results", key: "results", icon: Award, gradient: "from-neon-lime/[0.14] to-transparent", iconColor: "text-neon-lime", blob: "bg-neon-lime" },
  { to: "devices", key: "devices", icon: Cpu, gradient: "from-sky-400/[0.14] to-transparent", iconColor: "text-sky-300", blob: "bg-sky-500" },
  { to: "settings", key: "settings", icon: Settings, gradient: "from-white/[0.08] to-transparent", iconColor: "text-white/70", blob: "bg-white" },
];

export function CompetitionHub() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const LiveIcon = liveTile.icon;

  const { data: comp } = useQuery<Competition>({
    queryKey: ["competition", id],
    queryFn: () => api.get(`/competitions/${id}`),
    enabled: !!id,
  });
  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", id],
    queryFn: () => api.get(`/classes?competitionId=${id}`),
    enabled: !!id,
  });
  const { data: entries = [] } = useQuery<Entry[]>({
    queryKey: ["entries", id],
    queryFn: () => api.get(`/entries?competitionId=${id}`),
    enabled: !!id,
  });

  return (
    <div className="space-y-6">
      <div className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-35" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neon-violet to-neon-cyan">
                {comp?.name ?? t("common.loading")}
              </span>
            </h1>
            {comp && (
              <p className="text-white/55 text-sm mt-2">
                {new Date(comp.date).toLocaleDateString()} · {comp.location}
              </p>
            )}
          </div>
          {comp && <StatusBadge status={comp.status} />}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{t("classes.title")}</div>
          <div className="text-2xl font-display font-bold text-white mt-1">{classes.length}</div>
        </div>
        <div className="card text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{t("entries.title")}</div>
          <div className="text-2xl font-display font-bold text-white mt-1">{entries.length}</div>
        </div>
        <div className="card text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{t("riders.title")}</div>
          <div className="text-2xl font-display font-bold text-white mt-1">
            {new Set(entries.map((e) => e.riderId)).size}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{t("status.ACTIVE")}</div>
          <div className="text-2xl font-display font-bold text-white mt-1">
            {classes.filter((c) => c.active).length}
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display font-bold text-lg text-white mb-3">{t("competitions.hubTiles")}</h2>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <Link
            to={`/competitions/${id}/${liveTile.to}`}
            className={`card relative overflow-hidden block group min-h-[120px] bg-gradient-to-br ${liveTile.gradient} ring-1 ring-neon-pink/25`}
          >
            <div className={`absolute -top-20 -end-20 w-72 h-72 rounded-full blur-3xl opacity-[0.12] group-hover:opacity-[0.20] transition ${liveTile.blob}`} />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl glass flex items-center justify-center shrink-0 ${liveTile.iconColor}`}>
                  <LiveIcon className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-neon-pink/90 font-bold">
                    {t("competitions.hubLiveHint")}
                  </div>
                  <div className="font-display font-bold text-2xl text-white mt-0.5">{t(`nav.${liveTile.key}`)}</div>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-white/35 group-hover:text-white/90 group-hover:translate-x-1 transition flip-x shrink-0" />
            </div>
          </Link>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {otherTiles.map((tile, idx) => {
            const Icon = tile.icon;
            return (
              <motion.div
                key={tile.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + idx * 0.03 }}
              >
                <Link
                  to={`/competitions/${id}/${tile.to}`}
                  className={`card relative overflow-hidden block group h-full min-h-[120px] bg-gradient-to-br ${tile.gradient}`}
                >
                  <div className={`absolute -top-12 -end-12 w-40 h-40 rounded-full blur-3xl opacity-[0.08] group-hover:opacity-[0.15] transition ${tile.blob}`} />
                  <div className="relative flex flex-col h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-11 h-11 rounded-xl glass flex items-center justify-center ${tile.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/25 group-hover:text-white/70 transition flip-x shrink-0" />
                    </div>
                    <div className="mt-3 font-display font-bold text-base text-white leading-tight">
                      {t(`nav.${tile.key}`)}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
