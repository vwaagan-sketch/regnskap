"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/db/context";
import { changePassword, updateProfile } from "@/db/user-repo";

export interface ProfileState {
  error: string | null;
  ok: boolean;
}

export async function profileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const auth = await getAuth();
  if (!auth) return { error: "Du er ikke innlogget", ok: false };
  try {
    await updateProfile(auth.sql, auth.user.id, {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
    });
  } catch (e) {
    return { error: (e as Error).message, ok: false };
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function passwordAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const auth = await getAuth();
  if (!auth) return { error: "Du er ikke innlogget", ok: false };
  const next = String(form.get("new") ?? "");
  if (next !== String(form.get("new2") ?? "")) return { error: "De nye passordene er ikke like", ok: false };
  try {
    await changePassword(auth.sql, auth.user.id, auth.sessionId, String(form.get("current") ?? ""), next);
  } catch (e) {
    return { error: (e as Error).message, ok: false };
  }
  return { error: null, ok: true };
}
