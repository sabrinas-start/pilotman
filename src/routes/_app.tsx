import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        className={[
          "min-h-screen p-8 transition-[margin] duration-200",
          collapsed ? "ml-14" : "ml-60",
        ].join(" ")}
      >
        <Outlet />
      </main>
    </div>
  );
}
