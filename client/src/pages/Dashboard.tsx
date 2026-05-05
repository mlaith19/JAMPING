import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Trophy, Activity, Users, Sparkles, ArrowRight, Scale } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import type { Competition, Horse, Rider } from "../lib/types";
import { StatusBadge } from "../components/ui/StatusBadge";

const JUDGES_STORAGE_KEY = "judges-registry-v1";

export function Dashboard() {
  const { t } = useTranslation();
  const { data: competitions = [] } = useQuery<Competition[]>({
    queryKey: ["competitions"],
    queryFn: () => api.get("/competitions"),
  });
  const { data: horses = [] } = useQuery<Horse[]>({
    queryKey: ["horses"],
    queryFn: () => api.get("/horses"),
  });
  const { data: riders = [] } = useQuery<Rider[]>({
    queryKey: ["riders"],
    queryFn: () => api.get("/riders"),
  });

  const active = competitions.filter((c) => c.status === "ACTIVE").length;
  const [judgesCount, setJudgesCount] = useState(0);

  useEffect(() => {
    const readCount = () => {
      try {
        const raw = localStorage.getItem(JUDGES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        setJudgesCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setJudgesCount(0);
      }
    };
    readCount();
    const onStorage = () => readCount();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const tiles = [
    {
      to: "/competitions",
      icon: Trophy,
      title: t("nav.competitions"),
      count: competitions.length,
      sub: `${active} ${t("status.ACTIVE").toLowerCase()}`,
      gradient: "from-neon-violet/[0.18] via-indigo-500/[0.10] to-transparent",
      iconColor: "text-neon-violet",
      blob: "bg-neon-violet",
    },
    {
      to: "/horses",
      icon: Activity,
      title: t("nav.horses"),
      count: horses.length,
      sub: t("horses.subtitle"),
      gradient: "from-neon-cyan/[0.18] via-sky-500/[0.10] to-transparent",
      iconColor: "text-neon-cyan",
      blob: "bg-neon-cyan",
    },
    {
      to: "/riders",
      icon: Users,
      title: t("nav.riders"),
      count: riders.length,
      sub: t("riders.subtitle"),
      gradient: "from-neon-pink/[0.18] via-rose-500/[0.10] to-transparent",
      iconColor: "text-neon-pink",
      blob: "bg-neon-pink",
    },
    {
      to: "/judges",
      icon: Scale,
      title: t("nav.judges"),
      count: judgesCount,
      sub: t("judges.subtitle"),
      gradient: "from-neon-lime/[0.18] via-emerald-500/[0.10] to-transparent",
      iconColor: "text-neon-lime",
      blob: "bg-neon-lime",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-40" />
        <div className="relative">
          <div className="flex items-center gap-2 text-neon-cyan font-semibold text-sm">
            <Sparkles className="w-4 h-4" /> {t("dashboard.welcome")}
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mt-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neon-violet to-neon-cyan">
              {t("app.title")}
            </span>
          </h1>
          <p className="text-white/60 mt-2 max-w-xl text-sm">{t("app.tagline")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map((tile, idx) => (
          <motion.div
            key={tile.to}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
            whileHover={{ y: -4 }}
          >
            <Link
              to={tile.to}
              className={`card relative overflow-hidden block group bg-gradient-to-br ${tile.gradient}`}
            >
              <div
                className={`absolute -top-16 -end-16 w-56 h-56 rounded-full blur-3xl opacity-[0.10] group-hover:opacity-[0.18] transition ${tile.blob}`}
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className={`w-14 h-14 rounded-2xl glass flex items-center justify-center ${tile.iconColor}`}>
                    <tile.icon className="w-6 h-6" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-white/80 group-hover:translate-x-1 transition flip-x" />
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-wider text-white/55 font-bold">
                    {tile.title}
                  </div>
                  <div className="text-5xl font-display font-bold text-white mt-1 leading-none">
                    {tile.count}
                  </div>
                  <div className="text-xs text-white/45 mt-2 truncate">{tile.sub}</div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {competitions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-white">{t("dashboard.recent")}</h2>
            <Link to="/competitions" className="text-sm text-neon-cyan hover:underline">
              {t("competitions.title")} →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {competitions.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/competitions/${c.id}`}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] transition"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{c.name}</div>
                  <div className="text-xs text-white/50 truncate">
                    {new Date(c.date).toLocaleDateString()} · {c.location}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
