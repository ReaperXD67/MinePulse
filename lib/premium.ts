import type { PremiumPlanCode } from "@/lib/generated/prisma/client";

export function activePremiumPlan(
  plan: PremiumPlanCode | "NONE" | "GOLD" | "DIAMOND",
  premiumUntil: Date | string | null | undefined,
  now = new Date()
) {
  if (plan === "NONE" || !premiumUntil) {
    return "NONE" as const;
  }

  const expiresAt = typeof premiumUntil === "string" ? new Date(premiumUntil) : premiumUntil;
  return expiresAt.getTime() > now.getTime() ? plan : ("NONE" as const);
}
