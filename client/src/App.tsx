import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { CompetitionLayout } from "./components/layout/CompetitionLayout";
import { Dashboard } from "./pages/Dashboard";
import { Competitions } from "./pages/Competitions";
import { Horses } from "./pages/Horses";
import { Riders } from "./pages/Riders";
import { CompetitionHub } from "./pages/competition/CompetitionHub";
import { CompetitionOverview } from "./pages/competition/CompetitionOverview";
import { CompetitionClasses } from "./pages/competition/CompetitionClasses";
import { CompetitionEntries } from "./pages/competition/CompetitionEntries";
import { CompetitionStartList } from "./pages/competition/CompetitionStartList";
import { CompetitionLive } from "./pages/competition/CompetitionLive";
import { CompetitionResults } from "./pages/competition/CompetitionResults";
import { CompetitionDevices } from "./pages/competition/CompetitionDevices";
import { CompetitionSettings } from "./pages/competition/CompetitionSettings";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="competitions" element={<Competitions />} />

        <Route path="competitions/:id" element={<CompetitionLayout />}>
          <Route index element={<CompetitionHub />} />
          <Route path="live" element={<CompetitionLive />} />
          <Route path="overview" element={<CompetitionOverview />} />
          <Route path="classes" element={<CompetitionClasses />} />
          <Route path="entries" element={<CompetitionEntries />} />
          <Route path="start-list" element={<CompetitionStartList />} />
          <Route path="results" element={<CompetitionResults />} />
          <Route path="devices" element={<CompetitionDevices />} />
          <Route path="settings" element={<CompetitionSettings />} />
        </Route>

        <Route path="horses" element={<Horses />} />
        <Route path="riders" element={<Riders />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
