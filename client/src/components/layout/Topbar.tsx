import { useTranslation } from "react-i18next";
import { Globe, Wifi, WifiOff, ArrowLeft, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";
import { api } from "../../lib/api";
import type { Competition, ShowClass } from "../../lib/types";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "he", label: "עב" },
  { code: "ar", label: "عر" },
];

export function Topbar() {
  const { i18n, t } = useTranslation();
  const { pathname } = useLocation();
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const classId = searchParams.get("classId") ?? "";
  const inCompetitionWorkspace = /^\/competitions\/[^/]+(\/|$)/.test(pathname);
  const currentTab = (() => {
    const match = pathname.match(/^\/competitions\/[^/]+\/([^/?#]+)/);
    return match?.[1] ?? "";
  })();

  function competitionTabToNavKey(tab: string) {
    if (tab === "start-list") return "startList";
    if (tab === "course-map") return "courseMap";
    return tab;
  }

  const { data: competition } = useQuery<Competition>({
    queryKey: ["competition", id],
    queryFn: () => api.get(`/competitions/${id}`),
    enabled: inCompetitionWorkspace && !!id,
  });
  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", id],
    queryFn: () => api.get(`/classes?competitionId=${id}`),
    enabled: inCompetitionWorkspace && !!id,
  });
  const selectedClass = classes.find((c) => c.id === classId);
  const classQuery = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  const currentTabTo = currentTab
    ? `/competitions/${id}/${currentTab}${classQuery}`
    : `/competitions/${id}${classQuery}`;

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    setConnected(s.connected);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <header className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-ink-900/40 backdrop-blur-xl">
      <div className="min-w-0 flex items-center gap-3">
        {inCompetitionWorkspace && (
          <>
            <Link to="/" className="btn-ghost !h-9 !py-0 inline-flex items-center gap-2 shrink-0">
              <ArrowLeft className="w-4 h-4 flip-x" />
              <LayoutDashboard className="w-4 h-4" />
              {t("nav.dashboard")}
            </Link>
            <Link to={`/competitions/${id}`} className="btn-ghost !h-9 !py-0 min-w-0 max-w-[260px]">
              <span className="truncate">{competition?.name ?? "—"}</span>
            </Link>
            <Link to={`/competitions/${id}/live${classQuery}`} className="btn-ghost !h-9 !py-0 min-w-0 max-w-[240px]">
              <span className="truncate">{selectedClass?.name ?? t("entries.class")}</span>
            </Link>
            {currentTab && (
              <Link to={currentTabTo} className="badge-cyan !h-9 !px-3 !rounded-xl shrink-0">
                {t(`nav.${competitionTabToNavKey(currentTab)}`, currentTab.toUpperCase())}
              </Link>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            connected
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/15 border-red-500/30 text-red-300"
          }`}
        >
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{connected ? "Live" : "Offline"}</span>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10">
          <Globe className="w-4 h-4 text-white/50 ms-2 me-1" />
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => i18n.changeLanguage(l.code)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                i18n.language?.startsWith(l.code)
                  ? "bg-gradient-to-r from-neon-violet to-neon-cyan text-white shadow-glow"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
