import { NextResponse } from "next/server";
import { scanReceipt, type ImageMediaType } from "@/lib/receipt/scan";

const ALLOWED: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Mangler bilde" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type as ImageMediaType)) {
    return NextResponse.json({ error: "Bildeformatet støttes ikke" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Bildet er større enn 5 MB" }, { status: 413 });
  }
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const result = await scanReceipt(base64, file.type as ImageMediaType);
    // TODO: lagre originalbildet uforanderlig i dokumentarkivet og koble det til bilaget.
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
}
