import { useTranslation } from "react-i18next";
import { Globe, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { getSocket } from "../../lib/socket";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "he", label: "עב" },
  { code: "ar", label: "عر" },
];

export function Topbar() {
  const { i18n } = useTranslation();
  const [connected, setConnected] = useState(false);

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
      <div />
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
