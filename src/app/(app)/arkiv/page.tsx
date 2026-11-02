import Link from "next/link";
import { Archive, FileText, Image as ImageIcon, Lock, Mail } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, cx, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listDocuments } from "@/db/document-repo";
import { getOrCreateInbox } from "@/db/inbox-repo";
import { inboxAddress } from "@/lib/inbound/message";
import UploadZone from "./upload-zone";

function size(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} kB`;
}

export default async function ArkivPage({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const { sql, company } = await requireContext();
  const { vis } = await searchParams;
  const filter = vis === "ubokfort" ? "ubokfort" : "alle";
  const docs = await listDocuments(sql, company.id, filter);
  const address = inboxAddress(process.env.INNBOKS_ADRESSE, (await getOrCreateInbox(sql, company.id)).token);

  return (
    <>
      <PageHeader title="Arkiv" description="Kvitteringer, fakturaer, kontrakter og andre dokumenter. Alt oppbevares i minst 5 år og kan ikke slettes." />
      <UploadZone />
      {address && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Mail className="h-4 w-4" /> Eller videresend til <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{address}</code>
          <Link href="/firma" className="text-indigo-600 hover:underline">Innstillinger</Link>
        </p>
      )}
      <div className="mb-4 mt-8 flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium sm:w-fit">
        {[["alle", "Alle"], ["ubokfort", "Ikke bokført"]].map(([v, l]) => (
          <Link key={v} href={v === "alle" ? "/arkiv" : "/arkiv?vis=ubokfort"}
            className={cx("flex-1 rounded-lg px-4 py-1.5 text-center transition", filter === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{l}</Link>
        ))}
      </div>
      {docs.length === 0 ? (
        <Card><EmptyState icon={<Archive className="h-6 w-6" />} title="Arkivet er tomt" text="Last opp bilder og PDF-er over, eller bokfør en kvittering." /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {docs.map((d) => {
            const isImage = d.media_type.startsWith("image/") && d.media_type !== "image/heic";
            return (
              <Card key={d.id} className="group flex flex-col overflow-hidden">
                <a href={`/api/dokumenter/${d.id}`} target="_blank" className="relative block aspect-[4/3] bg-slate-100">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dokumenter serveres fra egen API
                    <img src={`/api/dokumenter/${d.id}`} alt={d.title ?? d.filename ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-400">
                      {d.media_type === "application/pdf" ? <FileText className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
                    </div>
                  )}
                </a>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="truncate text-sm font-medium" title={d.title ?? d.filename ?? ""}>{d.title || d.filename || "Dokument"}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    {d.email_from && <span title={`Mottatt på e-post fra ${d.email_from}`}><Mail className="h-3 w-3" /></span>}
                    {formatDate(d.document_date ?? d.created_at)} · {size(d.size_bytes)}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    {d.voucher_no ? (
                      <Badge color="green">Bilag {d.voucher_no}</Badge>
                    ) : d.kind === "invoice_pdf" ? (
                      <Badge color="indigo">Faktura</Badge>
                    ) : (
                      <Link href={`/bilag/ny?dokument=${d.id}`} className="text-xs font-medium text-indigo-600 hover:underline">Bokfør →</Link>
                    )}
                    <span title={`Oppbevares til ${formatDate(d.retain_until)}`} className="text-slate-300"><Lock className="h-3.5 w-3.5" /></span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
