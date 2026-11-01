"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2 } from "lucide-react";
import { Alert, cx } from "@/components/ui";

export default function UploadZone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    list.forEach((f) => body.append("filer", f));
    try {
      const res = await fetch("/api/dokumenter", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage({ kind: "success", text: `${json.ids.length} ${json.ids.length === 1 ? "dokument" : "dokumenter"} lastet opp` });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center transition",
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40",
        )}
      >
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-indigo-500" /> : <CloudUpload className="h-7 w-7 text-indigo-500" />}
        <p className="font-medium">{busy ? "Laster opp …" : "Slipp filer her, eller klikk for å velge"}</p>
        <p className="text-xs text-slate-500">Bilder, PDF, EHF/XML og tekstfiler. Maks 10 MB per fil.</p>
        <input ref={input} type="file" multiple accept="image/*,application/pdf,.xml,.txt,.csv" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </div>
  );
}
