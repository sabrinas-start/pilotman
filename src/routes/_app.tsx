import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="ml-60 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
