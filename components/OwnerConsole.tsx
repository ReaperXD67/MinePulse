"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Coins, Gem, PackagePlus, Save, Server, Trash2 } from "lucide-react";
import { money, points, shortDate } from "@/lib/format";

type OwnerServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  description: string;
  status: string;
  pointPool: number;
  rewardRatePerSecond: number;
  maxPaidPlayers: number;
  minPlaySecondsForComment: number;
  premiumPlan: string;
  premiumUntil: string | null;
  pluginSecret: string;
  items: Array<{
    id: string;
    name: string;
    description: string;
    pricePoints: number;
    command: string;
    status: string;
  }>;
};

type PointPackage = {
  id: string;
  label: string;
  points: number;
  priceCents: number;
};

type PremiumTier = {
  id: string;
  name: string;
  priceCents: number;
  durationDays: number;
  priority: number;
};

export function OwnerConsole({
  servers,
  pointPackages,
  premiumTiers
}: {
  servers: OwnerServer[];
  pointPackages: PointPackage[];
  premiumTiers: PremiumTier[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown, method = "POST") {
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
      return false;
    }

    setMessage(payload.message || "Saved");
    router.refresh();
    return true;
  }

  async function createServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post("/api/owner/servers", {
      name: form.get("name"),
      host: form.get("host"),
      port: form.get("port"),
      version: form.get("version"),
      region: form.get("region"),
      tags: form.get("tags"),
      description: form.get("description"),
      rewardRatePerSecond: form.get("rewardRatePerSecond"),
      maxPaidPlayers: form.get("maxPaidPlayers"),
      minPlaySecondsForComment: form.get("minPlaySecondsForComment")
    });

    if (ok) {
      formElement.reset();
    }
  }

  async function updateServer(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post(
      `/api/owner/servers/${serverId}`,
      {
        name: form.get("name"),
        description: form.get("description"),
        rewardRatePerSecond: form.get("rewardRatePerSecond"),
        maxPaidPlayers: form.get("maxPaidPlayers"),
        minPlaySecondsForComment: form.get("minPlaySecondsForComment"),
        status: form.get("status")
      },
      "PATCH"
    );
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post("/api/owner/items", {
      serverId,
      name: form.get("name"),
      description: form.get("description"),
      pricePoints: form.get("pricePoints"),
      command: form.get("command")
    });
    if (ok) {
      formElement.reset();
    }
  }

  return (
    <div className="dashboard">
      <p className="toast-line">{message}</p>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Add server</h2>
            <p>New servers start hidden from the public list until they have a funded point pool.</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={createServer}>
          <div className="form-grid two">
            <div className="form-row">
              <label>Name</label>
              <input className="field" name="name" placeholder="Crystal SMP" required />
            </div>
            <div className="form-row">
              <label>Host</label>
              <input className="field" name="host" placeholder="play.example.com" required />
            </div>
          </div>
          <div className="form-grid two">
            <div className="form-row">
              <label>Port</label>
              <input className="field" name="port" type="number" defaultValue="25565" />
            </div>
            <div className="form-row">
              <label>Version</label>
              <input className="field" name="version" defaultValue="1.21.x" />
            </div>
          </div>
          <div className="form-grid two">
            <div className="form-row">
              <label>Region</label>
              <input className="field" name="region" defaultValue="EU" />
            </div>
            <div className="form-row">
              <label>Tags</label>
              <input className="field" name="tags" defaultValue="Survival,Economy,SMP" />
            </div>
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea
              className="textarea"
              name="description"
              defaultValue="A player-first server with fair rewards and a cosmetic point shop."
              required
            />
          </div>
          <div className="form-grid two">
            <div className="form-row">
              <label>Reward per second</label>
              <input className="field" name="rewardRatePerSecond" type="number" defaultValue="1" />
            </div>
            <div className="form-row">
              <label>Paid player cap</label>
              <input className="field" name="maxPaidPlayers" type="number" defaultValue="20" />
            </div>
          </div>
          <div className="form-row">
            <label>Seconds before comments</label>
            <input className="field" name="minPlaySecondsForComment" type="number" defaultValue="1800" />
          </div>
          <button className="solid-button" disabled={busy} type="submit">
            <Server size={16} /> Create server
          </button>
        </form>
      </section>

      {servers.map((server) => (
        <section className="panel" key={server.id}>
          <div className="panel-header">
            <div>
              <h2>{server.name}</h2>
              <p className="mono">
                {server.host}:{server.port} - pool {points(server.pointPool)}
              </p>
            </div>
            <span className="badge">
              {server.premiumPlan} {server.premiumUntil ? `until ${shortDate(server.premiumUntil)}` : ""}
            </span>
          </div>

          <div className="dashboard-grid">
            <form className="form-grid" onSubmit={(event) => updateServer(event, server.id)}>
              <div className="form-row">
                <label>Name</label>
                <input className="field" name="name" defaultValue={server.name} />
              </div>
              <div className="form-row">
                <label>Description</label>
                <textarea className="textarea" name="description" defaultValue={server.description} />
              </div>
              <div className="form-grid two">
                <div className="form-row">
                  <label>Reward/s</label>
                  <input className="field" name="rewardRatePerSecond" type="number" defaultValue={server.rewardRatePerSecond} />
                </div>
                <div className="form-row">
                  <label>Paid cap</label>
                  <input className="field" name="maxPaidPlayers" type="number" defaultValue={server.maxPaidPlayers} />
                </div>
              </div>
              <div className="form-grid two">
                <div className="form-row">
                  <label>Comment seconds</label>
                  <input
                    className="field"
                    name="minPlaySecondsForComment"
                    type="number"
                    defaultValue={server.minPlaySecondsForComment}
                  />
                </div>
                <div className="form-row">
                  <label>Status</label>
                  <select className="select" name="status" defaultValue={server.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </div>
              </div>
              <button className="solid-button" disabled={busy} type="submit">
                <Save size={16} /> Save server
              </button>
            </form>

            <div className="split-list">
              <div className="mini-metric">
                <span className="metric-label">Plugin server id</span>
                <strong className="mono">{server.id}</strong>
              </div>
              <div className="mini-metric">
                <span className="metric-label">Plugin secret</span>
                <strong className="mono">{server.pluginSecret}</strong>
              </div>
              <div className="inline-actions">
                {pointPackages.map((pack) => (
                  <button
                    className="ghost-button"
                    key={pack.id}
                    disabled={busy}
                    onClick={() => post(`/api/owner/servers/${server.id}/topup`, { packageId: pack.id })}
                  >
                    <Coins size={16} /> {pack.label} - {money(pack.priceCents)}
                  </button>
                ))}
              </div>
              <div className="inline-actions">
                {premiumTiers.map((tier) => (
                  <button
                    className="ghost-button"
                    key={tier.id}
                    disabled={busy}
                    onClick={() => post(`/api/owner/servers/${server.id}/premium`, { tierId: tier.id })}
                  >
                    <Gem size={16} /> {tier.name} - {money(tier.priceCents)}
                  </button>
                ))}
              </div>
              <button className="ghost-button danger-button" disabled={busy} onClick={() => post(`/api/owner/servers/${server.id}`, {}, "DELETE")}>
                <Trash2 size={16} /> Remove server
              </button>
            </div>
          </div>

          <div className="section-bar">
            <div>
              <h3>Shop items</h3>
              <p>Commands use placeholders like {"{player}"} and {"{uuid}"}.</p>
            </div>
          </div>
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Command</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {server.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <p className="toast-line">{item.description}</p>
                    </td>
                    <td>{points(item.pricePoints)}</td>
                    <td className="mono">{item.command}</td>
                    <td>{item.status}</td>
                    <td>
                      <button className="icon-button" title="Hide item" onClick={() => post(`/api/owner/items/${item.id}`, {}, "DELETE")}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="form-grid" style={{ marginTop: 14 }} onSubmit={(event) => addItem(event, server.id)}>
            <div className="form-grid two">
              <div className="form-row">
                <label>Item name</label>
                <input className="field" name="name" placeholder="VIP Rank - 7 days" />
              </div>
              <div className="form-row">
                <label>Price points</label>
                <input className="field" name="pricePoints" type="number" placeholder="7200" />
              </div>
            </div>
            <div className="form-row">
              <label>Description</label>
              <input className="field" name="description" placeholder="Cosmetic rank with queue priority" />
            </div>
            <div className="form-row">
              <label>Command</label>
              <input className="field mono" name="command" placeholder="lp user {player} parent addtemp vip 7d" />
            </div>
            <button className="ghost-button" disabled={busy} type="submit">
              <PackagePlus size={16} /> Add item
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
