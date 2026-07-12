"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgePercent, Flag, Plus, Save, ShieldAlert } from "lucide-react";
import { points, shortDate } from "@/lib/format";

type PromoRow = {
  id: string;
  code: string;
  bonusPercent: number;
  active: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
};

type ReportRow = {
  id: string;
  serverName: string;
  serverId: string;
  reporter: string;
  reason: string;
  details: string;
  evidenceUrl: string | null;
  status: string;
  adminNote: string;
  createdAt: string;
  trustStatus: string;
  serverStatus: string;
  pointPool: number;
};

export function AdminSafetyConsole({ promos, reports }: { promos: PromoRow[]; reports: ReportRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, body: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok ? payload.message || "Saved" : payload.error || "Action failed");
    if (response.ok) {
      router.refresh();
    }
  }

  function promoPayload(form: FormData, id?: string) {
    const expiry = String(form.get("expiresAt") || "");
    const max = String(form.get("maxRedemptions") || "");
    return {
      id,
      code: form.get("code"),
      bonusPercent: form.get("bonusPercent"),
      active: form.get("active") === "on",
      maxRedemptions: max ? Number(max) : null,
      expiresAt: expiry ? new Date(expiry).toISOString() : null
    };
  }

  return (
    <div className="admin-safety-grid">
      <section className="panel">
        <div className="panel-header compact-heading"><div><p className="eyebrow"><BadgePercent size={14} /> Growth</p><h2>Bonus promo codes</h2><p>Codes add campaign credits. They never discount the cash price.</p></div></div>
        <p className="global-message" aria-live="polite">{message}</p>
        <form className="promo-card promo-create-card" onSubmit={(event) => { event.preventDefault(); send("/api/admin/promos", promoPayload(new FormData(event.currentTarget)), "POST"); }}>
          <div className="form-grid two"><input className="field mono" name="code" placeholder="BOOST10" required /><input className="field" name="bonusPercent" type="number" defaultValue="10" min="1" max="100" aria-label="Bonus percent" /></div>
          <div className="form-grid two"><input className="field" name="maxRedemptions" type="number" placeholder="Maximum redemptions" /><input className="field" name="expiresAt" type="datetime-local" aria-label="Expiry" /></div>
          <label className="toggle-row"><input name="active" type="checkbox" defaultChecked /> Active</label>
          <button className="solid-button" disabled={busy}><Plus size={15} /> Create code</button>
        </form>
        <div className="promo-list">
          {promos.map((promo) => (
            <form className="promo-card" key={promo.id} onSubmit={(event) => { event.preventDefault(); send("/api/admin/promos", promoPayload(new FormData(event.currentTarget), promo.id), "PATCH"); }}>
              <div className="promo-card-heading"><strong>{promo.code}</strong><span>{promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""} used</span></div>
              <div className="form-grid two"><input className="field mono" name="code" defaultValue={promo.code} /><input className="field" name="bonusPercent" type="number" defaultValue={promo.bonusPercent} aria-label="Bonus percent" /></div>
              <div className="form-grid two"><input className="field" name="maxRedemptions" type="number" defaultValue={promo.maxRedemptions || ""} placeholder="Unlimited" /><input className="field" name="expiresAt" type="datetime-local" defaultValue={promo.expiresAt ? promo.expiresAt.slice(0, 16) : ""} /></div>
              <div className="form-footer"><label className="toggle-row"><input name="active" type="checkbox" defaultChecked={promo.active} /> Active</label><button className="icon-button" title="Save promo" disabled={busy}><Save size={15} /></button></div>
            </form>
          ))}
        </div>
      </section>

      <section className="panel report-review-panel">
        <div className="panel-header compact-heading"><div><p className="eyebrow"><ShieldAlert size={14} /> Trust and safety</p><h2>Server reports</h2><p>Review evidence before applying a punishment.</p></div><span className="badge">{reports.filter((report) => report.status === "OPEN").length} open</span></div>
        <div className="report-review-list">
          {reports.map((report) => (
            <form className="report-review-card" key={report.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); send(`/api/admin/reports/${report.id}`, { status: form.get("status"), adminNote: form.get("adminNote"), enforcementType: form.get("enforcementType"), pointsRemoved: form.get("pointsRemoved") || 0 }, "PATCH"); }}>
              <header><div><span className={`status-pill status-${report.status.toLowerCase()}`}><Flag size={12} /> {report.status}</span><h3>{report.serverName}</h3><p>{report.reason.replaceAll("_", " ")} / by {report.reporter} / {shortDate(report.createdAt)}</p></div><div className="report-server-state"><span>{report.trustStatus}</span><strong>{points(report.pointPool)} credits</strong></div></header>
              <blockquote>{report.details}</blockquote>
              {report.evidenceUrl ? <a href={report.evidenceUrl} target="_blank" rel="noreferrer">Open evidence</a> : null}
              <div className="form-grid two"><select className="select" name="status" defaultValue={report.status}><option value="OPEN">Open</option><option value="REVIEWING">Reviewing</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select><select className="select" name="enforcementType" defaultValue="NONE"><option value="NONE">No punishment</option><option value="WARNING">Warning / watchlist</option><option value="PAUSE">Pause server</option><option value="BLACKLIST">Blacklist server</option><option value="CREDIT_REMOVAL">Remove campaign credits</option><option value="RESTORE">Restore verified status</option></select></div>
              <input className="field" name="pointsRemoved" type="number" defaultValue="0" min="0" max={report.pointPool} aria-label="Campaign credits to remove" />
              <textarea className="textarea" name="adminNote" defaultValue={report.adminNote} placeholder="Investigation notes and reason for action" />
              <button className="solid-button" disabled={busy}><Save size={15} /> Save review</button>
            </form>
          ))}
          {!reports.length ? <div className="empty-state compact-empty">No reports have been submitted.</div> : null}
        </div>
      </section>
    </div>
  );
}
