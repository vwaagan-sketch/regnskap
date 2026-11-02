"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { settleVatAction } from "./actions";

export default function SettleButton({ year, term, disabled }: { year: number; term: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function settle() {
    if (!confirm("Avslutte terminen og bokføre MVA-oppgjøret?")) return;
    start(async () => {
      const r = await settleVatAction(year, term);
      setError(r.error ?? null);
    });
  }
  return (
    <div className="grid gap-2">
      <Button onClick={settle} disabled={disabled || pending} className="w-full"><CheckCircle2 className="h-4 w-4" /> Avslutt terminen</Button>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
