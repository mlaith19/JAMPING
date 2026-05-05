import { Link, NavLink, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Scale,
  ArrowLeft,
  Home,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Settings,
  LayoutGrid,
  ClipboardList,
  ScrollText,
  Award,
  Cpu,
  Radio,
  ListOrdered,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { api } from "../../lib/api";
import type { Competition, Entry, ShowClass } from "../../lib/types";

function Brand() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className="px-6 py-6 border-b border-white/[0.08] block hover:bg-white/[0.02] transition"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
          style={{ background: "linear-gradient(135deg,#7c5cff,#22d3ee)" }}
        >
          SJ
        </div>
        <div>
          <div className="font-display font-bold text-white text-lg leading-none">
            {t("app.title")}
          </div>
          <div className="text-[11px] text-white/50 mt-1">{t("app.tagline")}</div>
        </div>
      </div>
    </Link>
  );
}

function GlobalSidebar() {
  const { t } = useTranslation();
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-white/[0.08] bg-ink-900/60 backdrop-blur-xl">
      <Brand />
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              isActive
                ? "bg-gradient-to-r from-neon-violet/[0.12] to-neon-cyan/[0.06] text-white border border-white/[0.08]"
                : "text-white/65 hover:text-white hover:bg-white/[0.04]"
            )
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{t("nav.dashboard")}</span>
        </NavLink>
        <NavLink
          to="/judges"
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              isActive
                ? "bg-gradient-to-r from-neon-violet/[0.12] to-neon-cyan/[0.06] text-white border border-white/[0.08]"
                : "text-white/65 hover:text-white hover:bg-white/[0.04]"
            )
          }
        >
          <Scale className="w-4 h-4" />
          <span>{t("nav.judges")}</span>
        </NavLink>
      </nav>
      <div className="px-4 py-4 border-t border-white/[0.08]">
        <div className="text-[11px] text-white/40 leading-relaxed">v1.0 · Show Jumping Platform</div>
      </div>
    </aside>
  );
}

function CompetitionMiniSidebar() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { data: comp } = useQuery<Competition>({
    queryKey: ["competition", id],
    queryFn: () => api.get(`/competitions/${id}`),
    enabled: !!id,
  });

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-white/[0.08] bg-ink-900/60 backdrop-blur-xl">
      <Brand />
      <div className="px-3 py-4 space-y-2 flex-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
              isActive
                ? "bg-white/[0.06] text-white border border-white/[0.08]"
                : "text-white/65 hover:text-white hover:bg-white/[0.04]"
            )
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          {t("nav.dashboard")}
        </NavLink>

        <Link
          to="/competitions"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/55 hover:text-white hover:bg-white/[0.04] transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 flip-x" />
          {t("competitions.title")}
        </Link>

        <Link
          to={`/competitions/${id}`}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/85 hover:text-white hover:bg-white/[0.05] border border-white/[0.06] transition"
        >
          <Home className="w-4 h-4 text-neon-cyan shrink-0" />
          <span className="truncate">{comp?.name ?? "—"}</span>
        </Link>
      </div>
      <div className="px-4 py-4 border-t border-white/[0.08]">
        <div className="text-[11px] text-white/40 leading-relaxed">v1.0 · Show Jumping Platform</div>
      </div>
    </aside>
  );
}

const menuItems = [
  { to: "overview", key: "overview", icon: LayoutGrid },
  { to: "judging", key: "judging", icon: Radio },
  { to: "classes", key: "classes", icon: ListChecks },
  { to: "rules", key: "rules", icon: ScrollText },
  { to: "entries", key: "entries", icon: ClipboardList },
  { to: "start-list", key: "startList", icon: ListOrdered },
  { to: "results", key: "results", icon: Award },
  { to: "report", key: "report", icon: FileText },
  { to: "judges", key: "judges", icon: Scale },
  { to: "devices", key: "devices", icon: Cpu },
  { to: "settings", key: "settings", icon: Settings },
];

function GearMenu({ competitionId }: { competitionId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "w-9 h-9 rounded-lg flex items-center justify-center transition shrink-0",
          open
            ? "bg-gradient-to-br from-neon-violet/30 to-neon-cyan/20 text-white border border-white/15"
            : "bg-white/[0.05] text-white/65 hover:text-white hover:bg-white/[0.10] border border-white/[0.08]"
        )}
        aria-label={t("nav.settings")}
      >
        <Settings className={clsx("w-4 h-4 transition", open && "rotate-45")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute end-0 top-full mt-2 w-60 z-30 glass-strong shadow-soft p-1.5"
          >
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-2 py-1.5">
              {t("nav.settings")}
            </div>

            <Link
              to={`/competitions/${competitionId}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition text-white/70 hover:text-white hover:bg-white/[0.05]"
            >
              <Home className="w-4 h-4 text-neon-cyan" />
              <span>{t("competitions.openDetail")}</span>
            </Link>

            <div className="h-px bg-white/[0.06] my-1" />

            {menuItems.map((mi) => (
              <NavLink
                key={mi.key}
                to={`/competitions/${competitionId}/${mi.to}`}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition",
                    isActive
                      ? "bg-gradient-to-r from-neon-violet/[0.18] to-neon-cyan/[0.10] text-white border border-white/[0.10]"
                      : "text-white/70 hover:text-white hover:bg-white/[0.05] border border-transparent"
                  )
                }
              >
                <mi.icon className="w-4 h-4" />
                <span>{t(`nav.${mi.key}`)}</span>
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClassSection({
  cls,
  entries,
  competitionId,
}: {
  cls: ShowClass;
  entries: Entry[];
  competitionId: string;
}) {
  const [open, setOpen] = useState(true);
  const classEntries = entries
    .filter((e) => e.classId === cls.id)
    .sort((a, b) => a.startNumber - b.startNumber);

  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/50 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-white/50 shrink-0 flip-x" />
          )}
          <ListChecks className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{cls.name}</span>
        </div>
        <span className="text-[10px] font-mono text-white/40 shrink-0">{classEntries.length}</span>
      </button>

      {open && (
        <div className="bg-black/10">
          {classEntries.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-white/35">—</div>
          ) : (
            classEntries.map((e) => (
              <Link
                key={e.id}
                to={`/competitions/${competitionId}/live?classId=${cls.id}&entryId=${e.id}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition border-t border-white/[0.04]"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-neon-violet/[0.18] to-neon-cyan/[0.10] border border-white/[0.08] flex items-center justify-center font-mono text-[11px] font-bold text-white shrink-0">
                  {e.startNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-white truncate">
                    {e.rider?.name ?? "—"}
                  </div>
                  <div className="text-[10px] text-white/45 truncate">{e.horse?.name ?? "—"}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CompetitionLiveSidebar() {
  const { t } = useTranslation();
  const { id = "" } = useParams();

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
    <aside className="hidden md:flex w-72 shrink-0 flex-col border-e border-white/[0.08] bg-ink-900/60 backdrop-blur-xl">
      <Brand />
      <div className="px-4 py-3 border-b border-white/[0.08]">
        <Link
          to="/competitions"
          className="inline-flex items-center gap-2 text-xs text-white/55 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 flip-x" />
          {t("competitions.title")}
        </Link>

        <div className="mt-2 flex items-start justify-between gap-2">
          <Link to={`/competitions/${id}`} className="min-w-0 flex-1 group" title={comp?.name}>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">
              {t("nav.competitions")}
            </div>
            <div className="font-display font-bold text-white text-sm mt-0.5 leading-tight line-clamp-2 group-hover:text-neon-cyan transition">
              {comp?.name ?? "—"}
            </div>
          </Link>
          <GearMenu competitionId={id} />
        </div>
      </div>

      <div className="flex-1 px-3 py-3 space-y-2 overflow-y-auto">
        <div className="flex items-center justify-between px-1">
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">
            {t("classes.title")}
          </div>
          <span className="text-[10px] font-mono text-white/30">{classes.length}</span>
        </div>

        {classes.length === 0 ? (
          <div className="text-xs text-white/40 px-3 py-4 text-center">
            <Link to={`/competitions/${id}/classes`} className="text-neon-cyan hover:underline">
              + {t("classes.add")}
            </Link>
          </div>
        ) : (
          classes.map((c) => (
            <ClassSection key={c.id} cls={c} entries={entries} competitionId={id} />
          ))
        )}
      </div>
    </aside>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const compMatch = pathname.match(/^\/competitions\/([^/]+)/);
  const competitionId = compMatch?.[1];
  if (competitionId) return null;
  return <GlobalSidebar />;
}
