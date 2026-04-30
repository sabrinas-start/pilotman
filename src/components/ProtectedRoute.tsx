import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth, type Profil } from "@/contexts/AuthContext";

export function ProtectedRoute({
  children,
  allowed,
}: {
  children: ReactNode;
  allowed?: Profil[];
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (allowed && !allowed.includes(user.profil)) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}
