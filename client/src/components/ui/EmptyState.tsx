import { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, hint, action }: Props) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-16 gap-3">
      {icon && (
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-neon-violet/20 to-neon-cyan/20 text-neon-violet">
          {icon}
        </div>
      )}
      <div className="text-lg font-display font-bold text-white">{title}</div>
      {hint && <div className="text-white/50 text-sm max-w-md">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
