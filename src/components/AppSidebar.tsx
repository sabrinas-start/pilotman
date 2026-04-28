import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Settings, ShieldCheck } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/parametres", label: "Paramètres", icon: Settings },
  { to: "/droits", label: "Droits & profils", icon: ShieldCheck },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-sidebar">
      <div className="px-6 py-6">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Pôle <span className="text-accent">Tournage</span>
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 text-xs text-muted-foreground">v0.1</div>
    </aside>
  );
}
