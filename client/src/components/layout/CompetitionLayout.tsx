import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Competition } from "../../lib/types";

export function CompetitionLayout() {
  const { id = "" } = useParams();
  const { data: comp } = useQuery<Competition>({
    queryKey: ["competition", id],
    queryFn: () => api.get(`/competitions/${id}`),
    enabled: !!id,
  });

  return <Outlet context={{ competitionId: id, competition: comp }} />;
}
