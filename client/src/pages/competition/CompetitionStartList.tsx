import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Shuffle, Lock, Unlock, Send, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../../lib/api";
import type { Competition, Entry, ShowClass } from "../../lib/types";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

interface StartListResponse {
  classId: string;
  locked: boolean;
  entries: Entry[];
}

function Row({ entry, index, locked }: { entry: Entry; index: number; locked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: locked,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] transition"
    >
      <button
        {...attributes}
        {...listeners}
        disabled={locked}
        className="text-white/40 cursor-grab disabled:cursor-not-allowed disabled:opacity-30"
      >
        <GripVertical className="w-5 h-5" />
      </button>
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/20 border border-white/10 flex items-center justify-center font-mono font-bold text-white">
        {entry.startNumber}
      </div>
      <div className="text-xs text-white/40 w-8 font-mono">#{index + 1}</div>
      <div className="flex-1">
        <div className="font-semibold text-white">{entry.rider?.name}</div>
        <div className="text-xs text-white/55">{entry.horse?.name}</div>
      </div>
    </div>
  );
}

export function CompetitionStartList() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [order, setOrder] = useState<Entry[]>([]);

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const { data } = useQuery<StartListResponse>({
    queryKey: ["startlist", classId],
    queryFn: () => api.get(`/startlist/${classId}`),
    enabled: !!classId,
  });

  useEffect(() => {
    if (data) setOrder(data.entries);
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = order.findIndex((x) => x.id === e.active.id);
    const newIndex = order.findIndex((x) => x.id === e.over!.id);
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    saveOrder.mutate(next.map((x) => x.id));
  }

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => api.patch(`/startlist/${classId}`, { order: ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["startlist", classId] }),
  });
  const shuffle = useMutation({
    mutationFn: () => api.post(`/startlist/${classId}/shuffle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["startlist", classId] }),
  });
  const lock = useMutation({
    mutationFn: () => api.post(`/startlist/${classId}/lock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["startlist", classId] }),
  });
  const unlock = useMutation({
    mutationFn: () => api.post(`/startlist/${classId}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["startlist", classId] }),
  });
  const sendToCompetition = useMutation({
    mutationFn: () => api.patch(`/competitions/${competitionId}`, { status: "ACTIVE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition", competitionId] }),
  });

  const locked = data?.locked ?? false;

  return (
    <div>
      <div className="card mb-4">
        <label className="label">{t("entries.class")}</label>
        <select
          className="select mt-1 max-w-md"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">{t("common.select")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {classId && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => shuffle.mutate()} disabled={locked} className="btn-ghost">
              <Shuffle className="w-4 h-4" /> {t("startList.shuffle")}
            </button>
            {locked ? (
              <button onClick={() => unlock.mutate()} className="btn-warn">
                <Unlock className="w-4 h-4" /> {t("startList.unlock")}
              </button>
            ) : (
              <button onClick={() => lock.mutate()} className="btn-success">
                <Lock className="w-4 h-4" /> {t("startList.lock")}
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => sendToCompetition.mutate()} disabled={!locked} className="btn-primary">
              <Send className="w-4 h-4" /> {t("startList.send")}
            </button>
          </div>
        )}
      </div>

      {classId && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-white/60">
              {order.length} riders ·{" "}
              <span className={locked ? "text-emerald-400" : "text-amber-400"}>
                {locked ? t("startList.locked") : t("startList.unlocked")}
              </span>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((x) => x.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {order.map((e, idx) => (
                  <Row key={e.id} entry={e} index={idx} locked={locked} />
                ))}
                {order.length === 0 && (
                  <div className="text-white/45 text-sm text-center py-8">{t("common.none")}</div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
