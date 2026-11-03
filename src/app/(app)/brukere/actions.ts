"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/db/context";
import { createInvitation, revokeInvitation, updateMember } from "@/db/user-repo";
import { isRole } from "@/lib/auth/roles";
import { baseUrl } from "@/lib/base-url";

export interface InviteState {
  error: string | null;
  link: string | null;
  email: string | null;
}

export async function inviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const { ctx, error } = await actionContext("admin");
  if (!ctx) return { error, link: null, email: null };
  const email = String(form.get("email") ?? "").trim();
  const role = form.get("role");
  if (!isRole(role)) return { error: "Velg en rolle", link: null, email: null };
  try {
    const token = await createInvitation(ctx.sql, ctx.company.id, ctx.user, email, role);
    revalidatePath("/brukere");
    return { error: null, link: `${await baseUrl()}/invitasjon/${token}`, email };
  } catch (e) {
    return { error: (e as Error).message, link: null, email: null };
  }
}

export interface MemberState {
  error: string | null;
  ok: boolean;
}

export async function updateMemberAction(_prev: MemberState, form: FormData): Promise<MemberState> {
  const { ctx, error } = await actionContext("admin");
  if (!ctx) return { error, ok: false };
  const role = form.get("role");
  if (!isRole(role)) return { error: "Ugyldig rolle", ok: false };
  try {
    await updateMember(ctx.sql, ctx.company.id, ctx.user, Number(form.get("userId")), {
      role,
      active: form.get("active") === "on",
    });
  } catch (e) {
    return { error: (e as Error).message, ok: false };
  }
  revalidatePath("/brukere");
  return { error: null, ok: true };
}

export async function revokeInvitationAction(form: FormData): Promise<void> {
  const { ctx } = await actionContext("admin");
  if (!ctx) return;
  try {
    await revokeInvitation(ctx.sql, ctx.company.id, ctx.user, Number(form.get("id")));
  } catch {
    // Allerede trukket tilbake eller brukt.
  }
  revalidatePath("/brukere");
}
