"use client";

import { useState, useTransition } from "react";
import { FileCode2 } from "lucide-react";
import { Button } from "@/components/ui";
import { createAMeldingAction } from "./actions";

export default function AMeldingButton({ period, hasPrevious }: { period: string; hasPrevious: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    if (hasPrevious && !confirm("Lage en ny a-melding som erstatter den forrige for måneden?")) return;
    setError(null);
    start(async () => {
      const r = await createAMeldingAction(period);
      if (r.error) setError(r.error);
      else window.location.href = `/api/a-melding/${r.id}`;
    });
  }

  return (
    <div className="grid justify-items-end gap-1">
      <Button variant="secondary" onClick={create} disabled={pending} className="px-3 py-1.5">
        <FileCode2 className="h-4 w-4" /> {hasPrevious ? "Lag ny" : "Lag a-melding"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}
