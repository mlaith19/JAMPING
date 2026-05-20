export type BellSettings = {
  durationSeconds: number;
  audioUrl: string;
  audioName: string;
};

const DEFAULT_AUDIO_NAME = "97bd2c.mp3";
const DEFAULT_AUDIO_URL = `/${DEFAULT_AUDIO_NAME}`;
const DEFAULT_DURATION_SECONDS = 5;
const STORAGE_KEY = "competition-bell-settings-v1";

function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION_SECONDS;
  return Math.max(1, Math.min(60, Math.round(seconds)));
}

export function getDefaultBellSettings(): BellSettings {
  return {
    durationSeconds: DEFAULT_DURATION_SECONDS,
    audioUrl: DEFAULT_AUDIO_URL,
    audioName: DEFAULT_AUDIO_NAME,
  };
}

export function loadBellSettings(competitionId: string): BellSettings {
  const defaults = getDefaultBellSettings();
  if (!competitionId) return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Partial<BellSettings>>) : {};
    const item = all[competitionId];
    if (!item) return defaults;
    const audioUrl = typeof item.audioUrl === "string" && item.audioUrl.trim() ? item.audioUrl : defaults.audioUrl;
    const audioName = typeof item.audioName === "string" && item.audioName.trim() ? item.audioName : defaults.audioName;
    const durationSeconds = clampDuration(Number(item.durationSeconds));
    return { durationSeconds, audioUrl, audioName };
  } catch {
    return defaults;
  }
}

export function saveBellSettings(competitionId: string, settings: BellSettings): void {
  if (!competitionId) return;
  const normalized: BellSettings = {
    durationSeconds: clampDuration(settings.durationSeconds),
    audioUrl: settings.audioUrl?.trim() || getDefaultBellSettings().audioUrl,
    audioName: settings.audioName?.trim() || getDefaultBellSettings().audioName,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, BellSettings>) : {};
    all[competitionId] = normalized;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}
