import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Connexion — La Puce à l'Oreille" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) return <Navigate to="/dashboard" />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await login(loginValue.trim(), password);
    setSubmitting(false);
    if (res.ok) {
      navigate({ to: "/dashboard" });
    } else {
      setError(res.error || "Identifiants incorrects");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" style={{ background: "#161616" }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            La Puce à l'Oreille
          </h1>
          <div className="mt-1 text-xl font-semibold tracking-tight" style={{ color: "#E8C547" }}>
            Pilotage
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-border bg-surface p-6"
        >
          <div className="space-y-1.5">
            <label htmlFor="login" className="text-xs uppercase tracking-wide text-muted-foreground">
              Identifiant
            </label>
            <input
              id="login"
              type="text"
              autoComplete="username"
              required
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: "#E05252" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-md text-sm font-medium transition-opacity disabled:opacity-60"
            style={{ background: "#E8C547", color: "#161616" }}
          >
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
