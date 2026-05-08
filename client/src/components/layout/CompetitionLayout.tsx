import { Outlet, NavLink, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Monitor } from "lucide-react";
import { api } from "../../lib/api";
import type { Competition, ShowClass } from "../../lib/types";

const classTabs = [
  { to: "live", key: "live" },
  { to: "settings", key: "settings" },
  { to: "rules", key: "rules" },
  { to: "course-map", key: "courseMap" },
  { to: "entries", key: "entries" },
  { to: "start-list", key: "startList" },
  { to: "results", key: "results" },
  { to: "report", key: "report" },
  { to: "judges", key: "judges" },
  { to: "devices", key: "devices" },
];

export function CompetitionLayout() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const classId = searchParams.get("classId") ?? "";
  const inCompetitionWorkspace = /^\/competitions\/[^/]+\/(settings|rules|course-map|entries|start-list|live|results|report|judges|devices)(\/|$)/.test(pathname);
  const classQuery = classId ? `?classId=${encodeURIComponent(classId)}` : "";
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

  function selectClass(nextClassId: string) {
    if (nextClassId) setSearchParams({ classId: nextClassId });
    else setSearchParams({});
  }

  return (
    <div className="space-y-4">
      {inCompetitionWorkspace && (
        <div className="card py-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2 overflow-x-auto">
              {classTabs.map((tab) => (
                <NavLink
                  key={tab.key}
                  to={`/competitions/${id}/${tab.to}${classQuery}`}
                  className={({ isActive }) =>
                    isActive
                      ? "px-3 py-2 rounded-lg text-sm font-semibold bg-neon-cyan/20 border border-neon-cyan/40 text-white whitespace-nowrap"
                      : "px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/[0.05] whitespace-nowrap"
                  }
                >
                  {tab.key === "report"
                    ? t("nav.report")
                    : tab.key === "judges"
                    ? t("nav.judges")
                    : tab.key === "courseMap"
                    ? t("nav.courseMap")
                    : tab.key === "startList"
                    ? t("nav.startList")
                    : t(`nav.${tab.key}`)}
                </NavLink>
              ))}
            </div>
            <div className="flex items-center gap-2 ms-auto">
              <select
                className="select !h-9 !py-0 min-w-[220px]"
                value={classId}
                onChange={(e) => selectClass(e.target.value)}
              >
                <option value="">{t("live.selectClass")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.courseHeight}cm
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => classId && window.open(`/display/${classId}`, "_blank")}
                disabled={!classId}
                className="btn-ghost !h-9 !py-0 inline-flex items-center gap-2"
              >
                <Monitor className="w-4 h-4" />
                {t("live.displayScreen")}
              </button>
            </div>
          </div>
        </div>
      )}
      <Outlet context={{ competitionId: id, competition: comp }} />
    </div>
  );
}
