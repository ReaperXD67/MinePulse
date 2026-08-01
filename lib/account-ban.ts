export type AccountBanState = {
  bannedAt: Date | null;
  bannedUntil: Date | null;
  banReason?: string | null;
};

export function accountBanIsActive(account: AccountBanState, now = new Date()) {
  return Boolean(account.bannedAt && (!account.bannedUntil || account.bannedUntil > now));
}

export function accountBanMessage(account: AccountBanState) {
  const reason = account.banReason?.trim() || "Your account has been suspended by a KarixMC administrator.";
  if (!account.bannedUntil) return `${reason} This ban is permanent.`;
  return `${reason} Access is suspended until ${account.bannedUntil.toISOString()}.`;
}
