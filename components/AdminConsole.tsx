"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crown, Save, ServerCog } from "lucide-react";
import { money, points, shortDate } from "@/lib/format";

type PackageRow = {
  id: string;
  kind: "pointPackage";
  label: string;
  points: number;
  priceCents: number;
  active: boolean;
};

type TierRow = {
  id: string;
  kind: "premiumTier";
  name: string;
  priceCents: number;
  durationDays: number;
  active: boolean;
  priority: number;
};

type ServerRow = {
  id: string;
  name: string;
  owner: string;
  status: string;
  pointPool: number;
  premiumPlan: string;
  premiumUntil: string | null;
  trustStatus: string;
};

export function AdminConsole({
  pointPackages,
  premiumTiers,
  servers
}: {
  pointPackages: PackageRow[];
  premiumTiers: TierRow[];
  servers: ServerRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, body: unknown, method = "PATCH") {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || "Action failed");
      return;
    }

    setMessage(payload.message || "Saved");
    router.refresh();
  }

  function updatePointPackage(event: React.FormEvent<HTMLFormElement>, row: PackageRow) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send("/api/admin/settings", {
      kind: row.kind,
      id: row.id,
      label: form.get("label"),
      points: form.get("points"),
      priceCents: Math.round(Number(form.get("priceDollars")) * 100),
      active: form.get("active") === "on"
    });
  }

  function updateTier(event: React.FormEvent<HTMLFormElement>, row: TierRow) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send("/api/admin/settings", {
      kind: row.kind,
      id: row.id,
      name: form.get("name"),
      priceCents: Math.round(Number(form.get("priceDollars")) * 100),
      durationDays: form.get("durationDays"),
      active: form.get("active") === "on",
      priority: form.get("priority")
    });
  }

  function updateServer(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send(`/api/admin/servers/${serverId}`, {
      adjustPoints: form.get("adjustPoints") || "0",
      status: form.get("status"),
      trustStatus: form.get("trustStatus"),
      premiumPlan: form.get("premiumPlan"),
      premiumDays: form.get("premiumDays") || undefined
    });
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Economy pricing</h2>
            <p>Change real-money prices and point quantities without deploying code.</p>
          </div>
        </div>
        <p className="toast-line">{message}</p>
        <div className="split-list">
          {pointPackages.map((row) => (
            <form className="shop-card" key={row.id} onSubmit={(event) => updatePointPackage(event, row)}>
              <div className="form-grid">
                <div className="form-grid two">
                  <input className="field" name="label" defaultValue={row.label} aria-label="Package label" />
                  <input className="field" name="points" type="number" defaultValue={row.points} aria-label="Points" />
                </div>
                <div className="form-grid two">
                  <input
                    className="field"
                    name="priceDollars"
                    type="number"
                    step="0.01"
                    defaultValue={(row.priceCents / 100).toFixed(2)}
                    aria-label="Price dollars"
                  />
                  <label className="ghost-button">
                    <input name="active" type="checkbox" defaultChecked={row.active} /> Active
                  </label>
                </div>
              </div>
              <button className="icon-button" disabled={busy} title="Save package">
                <Save size={16} />
              </button>
            </form>
          ))}
        </div>

        <div className="panel-header" style={{ marginTop: 20 }}>
          <div>
            <h2>Gold and Diamond</h2>
            <p>Premium lanes control top-list placement duration and order weight.</p>
          </div>
        </div>
        <div className="split-list">
          {premiumTiers.map((row) => (
            <form className="shop-card" key={row.id} onSubmit={(event) => updateTier(event, row)}>
              <div className="form-grid">
                <div className="form-grid two">
                  <input className="field" name="name" defaultValue={row.name} aria-label="Tier name" />
                  <input
                    className="field"
                    name="priceDollars"
                    type="number"
                    step="0.01"
                    defaultValue={(row.priceCents / 100).toFixed(2)}
                    aria-label="Price dollars"
                  />
                </div>
                <div className="form-grid two">
                  <input className="field" name="durationDays" type="number" defaultValue={row.durationDays} aria-label="Duration days" />
                  <input className="field" name="priority" type="number" defaultValue={row.priority} aria-label="Priority" />
                </div>
                <label className="ghost-button">
                  <input name="active" type="checkbox" defaultChecked={row.active} /> Active
                </label>
              </div>
              <button className="icon-button" disabled={busy} title="Save premium">
                <Crown size={16} />
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Server control</h2>
            <p>Adjust pools, remove listings, or force premium while keeping an audit record.</p>
          </div>
        </div>
        <div className="split-list">
          {servers.map((server) => (
            <form className="shop-card" key={server.id} onSubmit={(event) => updateServer(event, server.id)}>
              <div className="form-grid">
                <strong>{server.name}</strong>
                <p className="toast-line">
                  {server.owner} - {points(server.pointPool)} - {server.premiumPlan}
                  {server.premiumUntil ? ` until ${shortDate(server.premiumUntil)}` : ""}
                </p>
                <div className="form-grid two">
                  <input className="field" name="adjustPoints" type="number" defaultValue="0" aria-label="Point adjustment" />
                  <select className="select" name="status" defaultValue={server.status} aria-label="Status">
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="REMOVED">Removed</option>
                  </select>
                </div>
                <select className="select" name="trustStatus" defaultValue={server.trustStatus} aria-label="Trust status">
                  <option value="VERIFIED">Verified</option>
                  <option value="WATCHLIST">Watchlist</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="BLACKLISTED">Blacklisted</option>
                </select>
                <div className="form-grid two">
                  <select className="select" name="premiumPlan" defaultValue={server.premiumPlan} aria-label="Premium plan">
                    <option value="NONE">None</option>
                    <option value="GOLD">Gold</option>
                    <option value="DIAMOND">Diamond</option>
                  </select>
                  <input className="field" name="premiumDays" type="number" placeholder="Days from now" aria-label="Premium days" />
                </div>
              </div>
              <button className="icon-button" disabled={busy} title="Save server">
                <ServerCog size={16} />
              </button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
