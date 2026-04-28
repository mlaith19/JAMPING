import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        {icon && (
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-neon-cyan">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neon-violet to-neon-cyan">
              {title}
            </span>
          </h1>
          {subtitle && <p className="text-white/55 mt-1 text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
