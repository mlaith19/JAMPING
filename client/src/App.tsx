import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { CompetitionLayout } from "./components/layout/CompetitionLayout";
import { Dashboard } from "./pages/Dashboard";
import { Competitions } from "./pages/Competitions";
import { Horses } from "./pages/Horses";
import { Riders } from "./pages/Riders";
import { Judges } from "./pages/Judges";
import { CompetitionHub } from "./pages/competition/CompetitionHub";
import { CompetitionOverview } from "./pages/competition/CompetitionOverview";
import { CompetitionClasses } from "./pages/competition/CompetitionClasses";
import { CompetitionEntries } from "./pages/competition/CompetitionEntries";
import { CompetitionStartList } from "./pages/competition/CompetitionStartList";
import { CompetitionLive } from "./pages/competition/CompetitionLive";
import { CompetitionResults } from "./pages/competition/CompetitionResults";
import { CompetitionDevices } from "./pages/competition/CompetitionDevices";
import { CompetitionSettings } from "./pages/competition/CompetitionSettings";
import { CompetitionJudges } from "./pages/competition/CompetitionJudges";
import { CompetitionReport } from "./pages/competition/CompetitionReport";
import { CompetitionClassRules } from "./pages/competition/CompetitionClassRules";
import { CompetitionCourseMap } from "./pages/competition/CompetitionCourseMap";
import { AudienceDisplay } from "./pages/display/AudienceDisplay";

export function App() {
  return (
    <Routes>
      <Route path="/display/:classId" element={<AudienceDisplay />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="competitions" element={<Competitions />} />

        <Route path="competitions/:id" element={<CompetitionLayout />}>
          <Route index element={<CompetitionHub />} />
          <Route path="live" element={<CompetitionLive />} />
          <Route path="judging" element={<CompetitionLive />} />
          <Route path="overview" element={<CompetitionOverview />} />
          <Route path="classes" element={<CompetitionClasses />} />
          <Route path="rules" element={<CompetitionClassRules />} />
          <Route path="course-map" element={<CompetitionCourseMap />} />
          <Route path="entries" element={<CompetitionEntries />} />
          <Route path="start-list" element={<CompetitionStartList />} />
          <Route path="results" element={<CompetitionResults />} />
          <Route path="report" element={<CompetitionReport />} />
          <Route path="judges" element={<CompetitionJudges />} />
          <Route path="devices" element={<CompetitionDevices />} />
          <Route path="settings" element={<CompetitionSettings />} />
        </Route>

        <Route path="horses" element={<Horses />} />
        <Route path="riders" element={<Riders />} />
        <Route path="judges" element={<Judges />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
