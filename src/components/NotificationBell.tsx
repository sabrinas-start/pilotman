import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useMemo } from "react";
import { useAirtable } from "@/hooks/useAirtable";

const LS_KEY = "lapuce_alertes_derniere_visite";

export function NotificationBell() {
  const navigate = useNavigate();

  const { data: logs } = useAirtable("tbl4uCRY4qeiRxpV4", {
    filterByFormula: `{type_evenement}='error'`,
    sort: [{ field: "timestamp", direction: "desc" }],
  });

  const { data: charges } = useAirtable("tbljefhnPsyTAgUA4", {
    filterByFormula: `{warning}=TRUE()`,
  });

  const { count, hasError } = useMemo(() => {
    let last = 0;
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(LS_KEY);
      const parsed = raw ? Date.parse(raw) : NaN;
      last = Number.isFinite(parsed) ? parsed : 0;
    }
    let count = 0;
    let hasError = false;

    if (logs) {
      for (const r of logs) {
        const ts = Date.parse(String(r.fields.timestamp ?? ""));
        if (!Number.isFinite(ts)) continue;
        if (ts > last) {
          count++;
          hasError = true;
        }
      }
    }

    if (charges) {
      for (const r of charges) {
        const ts = Date.parse(String(r.createdTime ?? ""));
        if (!Number.isFinite(ts)) continue;
        if (ts > last) count++;
      }
    }

    return { count, hasError };
  }, [logs, charges]);

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/alertes" })}
      aria-label="Alertes"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className={[
            "absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold leading-none flex items-center justify-center text-white",
            hasError ? "bg-destructive" : "bg-orange-500",
          ].join(" ")}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
