import { apiContext, apiErrorStatus } from "@/db/context";
import { buildBackup } from "@/db/backup-repo";
import { download } from "@/lib/download";
import { jsonError, today } from "@/lib/http";

export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { sql, company } = await apiContext("admin");
    const contact = (new URL(req.url).searchParams.get("kontakt") ?? "").trim() || company.name;
    const zip = await buildBackup(sql, company, contact);
    return download(zip, `regnskap-${company.org_no}-${today()}.zip`, "application/zip");
  } catch (e) {
    return jsonError((e as Error).message, apiErrorStatus(e));
  }
}
