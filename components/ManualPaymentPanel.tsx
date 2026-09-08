"use client";

import { useState } from "react";
import { Coins, Copy, Crown, MessageCircle, ShieldCheck } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { money, points } from "@/lib/format";
import { BETA_MANUAL_PAYMENT, pointPackageOrderCode } from "@/lib/manual-orders";

type CampaignPackage = {
  id: string;
  code: string;
  label: string;
  points: number;
  priceCents: number;
};

type PremiumTier = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
};

export function ManualPaymentPanel({
  campaignPackages,
  premiumTiers,
  discordUrl,
  accountIdentifier,
  compact = false
}: {
  campaignPackages: CampaignPackage[];
  premiumTiers: PremiumTier[];
  discordUrl: string;
  accountIdentifier?: string;
  compact?: boolean;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const referenceExample = accountIdentifier
    ? `${accountIdentifier} GOLD`
    : BETA_MANUAL_PAYMENT.descriptionExample;

  async function copy(value: string, label: string) {
    const copied = await copyText(value);
    setCopyMessage(copied ? `${label} copied` : `Select and copy the ${label.toLowerCase()} manually`);
  }

  return (
    <div className={`manual-payment-panel${compact ? " manual-payment-compact" : ""}`}>
      <div className="manual-payment-heading">
        <div>
          <span className="eyebrow"><Coins size={14} /> Beta bank transfer</span>
          <strong>Choose one package and send the exact EUR amount.</strong>
          <p>Activation is manual and happens only after the transfer appears in the beneficiary&apos;s bank account.</p>
        </div>
        <span className="status-pill">Manual confirmation</span>
      </div>

      <div className="manual-offer-grid" aria-label="Beta purchase packages">
        {campaignPackages.map((offer) => (
          <div className="manual-offer" key={offer.id}>
            <span><Coins size={13} /> {pointPackageOrderCode(offer.code, offer.points)}</span>
            <strong>{points(offer.points)} credits</strong>
            <small>{money(offer.priceCents)}</small>
          </div>
        ))}
        {premiumTiers.map((offer) => (
          <div className={`manual-offer premium-${offer.code.toLowerCase()}`} key={offer.id}>
            <span><Crown size={13} /> {offer.code}</span>
            <strong>{offer.name} / {offer.durationDays} days</strong>
            <small>{money(offer.priceCents)}</small>
          </div>
        ))}
      </div>

      <dl className="manual-bank-details">
        <div>
          <dt>Beneficiary</dt>
          <dd>{BETA_MANUAL_PAYMENT.beneficiary}</dd>
        </div>
        <div>
          <dt>IBAN</dt>
          <dd><code>{BETA_MANUAL_PAYMENT.ibanDisplay}</code><button className="icon-button" type="button" title="Copy IBAN" onClick={() => copy(BETA_MANUAL_PAYMENT.iban, "IBAN")}><Copy size={14} /></button></dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{BETA_MANUAL_PAYMENT.currency}</dd>
        </div>
        <div>
          <dt>Transfer description</dt>
          <dd><code>{BETA_MANUAL_PAYMENT.descriptionFormat}</code></dd>
        </div>
      </dl>

      <div className="manual-reference-example">
        <span>Example</span>
        <code>{referenceExample}</code>
        <button className="icon-button" type="button" title="Copy example transfer description" onClick={() => copy(referenceExample, "Example description")}><Copy size={14} /></button>
      </div>

      <div className="manual-payment-actions">
        <a className="solid-button" href={discordUrl} target={discordUrl.startsWith("http") ? "_blank" : undefined} rel={discordUrl.startsWith("http") ? "noreferrer" : undefined}>
          <MessageCircle size={16} /> Official Discord purchase desk
        </a>
        <p className="manual-purchase-safety"><ShieldCheck size={15} /> Never send staff your password, TOTP code, plugin secret, bank login, card details, or private keys. Do not combine packages in one transfer; contact the purchase desk first if anything is unclear.</p>
      </div>
      <p className="copy-feedback" role="status" aria-live="polite">{copyMessage}</p>
    </div>
  );
}
