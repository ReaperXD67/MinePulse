import "server-only";

import { PurchaseStatus } from "@/lib/generated/prisma/client";

export const MAX_ACTIVE_PURCHASES_PER_PLAYER_SERVER = 10;
export const MAX_PURCHASE_ATTEMPTS_PER_MINUTE = 5;
export const PURCHASE_EXPIRY_DAYS = 30;
export const PURCHASE_EXPIRY_MS = PURCHASE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const PURCHASE_CLAIM_LEASE_SECONDS = 5 * 60;
export const PURCHASE_CLAIM_LEASE_MS = PURCHASE_CLAIM_LEASE_SECONDS * 1000;
export const ACTIVE_PURCHASE_STATUSES = [PurchaseStatus.PENDING, PurchaseStatus.PROCESSING] as const;
