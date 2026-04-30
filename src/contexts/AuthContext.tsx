import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Profil = "admin" | "gerant" | "audio" | "video";

export type AuthUser = {
  login: string;
  profil: Profil;
  nom_affiche: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (login: string, motDePasse: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "lapuce_user";
const USERS_TABLE = "tblpZwSD9OGlNNjUn";

function escapeFormula(v: string) {
  return v.replace(/"/g, '\\"');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as AuthUser);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const login: AuthContextValue["login"] = async (loginValue, motDePasse) => {
    const formula = `AND({Login}="${escapeFormula(loginValue)}",{mot_de_passe}="${escapeFormula(motDePasse)}")`;
    const params = new URLSearchParams({
      tableId: USERS_TABLE,
      filterByFormula: formula,
      maxRecords: "1",
    });
    try {
      const res = await fetch(`/api/airtable?${params.toString()}`);
      if (!res.ok) {
        return { ok: false, error: "Erreur serveur" };
      }
      const json = (await res.json()) as { records: Array<{ fields: Record<string, unknown> }> };
      const rec = json.records?.[0];
      if (!rec) {
        return { ok: false, error: "Identifiants incorrects" };
      }
      const f = rec.fields;
      const profilRaw = String(f.profil ?? "").toLowerCase();
      const allowed: Profil[] = ["admin", "gerant", "audio", "video"];
      if (!allowed.includes(profilRaw as Profil)) {
        return { ok: false, error: "Profil invalide" };
      }
      const next: AuthUser = {
        login: String(f.Login ?? f.login ?? loginValue),
        profil: profilRaw as Profil,
        nom_affiche: String(f.nom_affiche ?? ""),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUser(next);
      return { ok: true };
    } catch {
      return { ok: false, error: "Erreur réseau" };
    }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
