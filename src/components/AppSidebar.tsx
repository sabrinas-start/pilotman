import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Settings,
  ShieldCheck,
  FlaskConical,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const items = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/simulateur", label: "Simulateur", icon: FlaskConical },
  { to: "/salaries", label: "Salariés", icon: Users },
  { to: "/parametres", label: "Paramètres", icon: Settings },
  { to: "/droits", label: "Droits & profils", icon: ShieldCheck },
] as const;

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-14" : "w-60",
      ].join(" ")}
    >
      <div className={collapsed ? "px-3 py-6" : "px-6 py-6"}>
        {collapsed ? (
          <h1 className="text-lg font-semibold tracking-tight text-accent text-center">P</h1>
        ) : (
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Pôle <span className="text-accent">Tournage</span>
          </h1>
        )}
      </div>
      <nav className={["flex-1 space-y-1", collapsed ? "px-2" : "px-3"].join(" ")}>
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={[
                "flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "px-3",
                active
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div
        className={[
          "flex items-center border-t border-border py-3",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        ].join(" ")}
      >
        {!collapsed && <span className="text-xs text-muted-foreground">v0.1</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
