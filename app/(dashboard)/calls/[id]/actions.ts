"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";
import { services } from "@/lib/container";

export async function resolveReview(leadId: string) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("unauthorised");
  await services().repo.updateLead(leadId, { review_resolved_at: new Date().toISOString() });
  revalidatePath(`/calls/${leadId}`);
  revalidatePath("/review");
}
