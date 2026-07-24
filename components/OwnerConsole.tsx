"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { copyText } from "@/lib/copy-text";
import { useState } from "react";
import {
  Activity,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Gem,
  LifeBuoy,
  MessageCircle,
  PackagePlus,
  RadioTower,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  TicketCheck,
  Timer,
  Trash2,
  X
} from "lucide-react";
import { money, points, shortDate } from "@/lib/format";
import { activePremiumPlan } from "@/lib/premium";
import { serverJoinAddress } from "@/lib/server-address";

type OwnerServer = {
  id: string;
  slug: string;
  name: string;
  host: string;
  port: number;
  version: string;
  region: string;
  tags: string;
  description: string;
  longDescription: string;
  rules: string;
  galleryImages: string;
  websiteUrl: string | null;
  discordUrl: string | null;
  supportUrl: string | null;
  status: string;
  trustStatus: string;
  riskScore: number;
  pointPool: number;
  rewardRatePerSecond: number;
  maxPaidPlayers: number;
  minPlaySecondsForComment: number;
  premiumPlan: string;
  premiumUntil: string | null;
  lastHeartbeatAt: string | null;
  lastPluginVersion: string | null;
  pluginSecret: string;
  pluginConfigRevision: number;
  heartbeatIntervalSeconds: number;
  purchasePollSeconds: number;
  afkTimeoutSeconds: number;
  challengeEnabled: boolean;
  challengeIntervalSeconds: number;
  challengeAnswerWindowSeconds: number;
  challengeRequired: boolean;
  minimumMovementDistance: number;
  minimumActivityEvents: number;
  botProtectionLevel: number;
  lastConfigSyncAt: string | null;
  reportCount: number;
  favoriteCount: number;
  likeCount: number;
  items: Array<{
    id: string;
    name: string;
    description: string;
    pricePoints: number;
    command: string;
    requiresOnline: boolean;
    status: string;
  }>;
  supportTickets: Array<{
    id: string;
    requester: string;
    subject: string;
    body: string;
    status: string;
    ownerNote: string;
  }>;
};

type PointPackage = { id: string; label: string; points: number; priceCents: number };
type PremiumTier = { id: string; code: string; name: string; priceCents: number; durationDays: number; priority: number };

export function OwnerConsole({
  servers,
  pointPackages,
  premiumTiers,
  appBaseUrl,
  paymentMode,
  discordUrl
}: {
  servers: OwnerServer[];
  pointPackages: PointPackage[];
  premiumTiers: PremiumTier[];
  appBaseUrl: string;
  paymentMode: "test" | "nowpayments";
  discordUrl: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [promoCodes, setPromoCodes] = useState<Record<string, string>>({});
  const [checkoutNotice, setCheckoutNotice] = useState(false);
  const [serverSecrets, setServerSecrets] = useState<Record<string, string>>(() =>
    Object.fromEntries(servers.map((server) => [server.id, server.pluginSecret]))
  );

  async function send(url: string, body: unknown, method = "POST") {
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

    if (payload.checkoutUrl) {
      window.location.assign(payload.checkoutUrl);
      return true;
    }

    setMessage(payload.message || "Saved");
    router.refresh();
    return true;
  }

  async function createServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await send("/api/owner/servers", {
      name: form.get("name"),
      host: form.get("host"),
      port: form.get("port"),
      version: form.get("version"),
      region: form.get("region"),
      tags: form.get("tags"),
      description: form.get("description"),
      longDescription: form.get("longDescription"),
      rules: form.get("rules"),
      galleryImages: form.get("galleryImages"),
      websiteUrl: form.get("websiteUrl"),
      discordUrl: form.get("discordUrl"),
      supportUrl: form.get("supportUrl"),
      rewardRatePerSecond: form.get("rewardRatePerSecond"),
      maxPaidPlayers: form.get("maxPaidPlayers"),
      minPlaySecondsForComment: form.get("minPlaySecondsForComment")
    });

    if (ok) {
      formElement.reset();
    }
  }

  function startCheckout(url: string, body: unknown) {
    if (paymentMode === "test") {
      setCheckoutNotice(true);
      return;
    }
    void send(url, body);
  }

  async function updateServer(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(`/api/owner/servers/${serverId}`, {
      name: form.get("name"),
      host: form.get("host"),
      port: form.get("port"),
      version: form.get("version"),
      region: form.get("region"),
      tags: form.get("tags"),
      description: form.get("description"),
      longDescription: form.get("longDescription"),
      rules: form.get("rules"),
      galleryImages: form.get("galleryImages"),
      websiteUrl: form.get("websiteUrl"),
      discordUrl: form.get("discordUrl"),
      supportUrl: form.get("supportUrl"),
      rewardRatePerSecond: form.get("rewardRatePerSecond"),
      maxPaidPlayers: form.get("maxPaidPlayers"),
      minPlaySecondsForComment: form.get("minPlaySecondsForComment"),
      status: form.get("status")
    }, "PATCH");
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await send("/api/owner/items", {
      serverId,
      name: form.get("name"),
      description: form.get("description"),
      pricePoints: form.get("pricePoints"),
      command: form.get("command"),
      requiresOnline: form.get("requiresOnline") === "on"
    });
    if (ok) {
      formElement.reset();
    }
  }

  async function updatePluginPolicy(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(`/api/owner/servers/${serverId}`, {
      heartbeatIntervalSeconds: form.get("heartbeatIntervalSeconds"),
      purchasePollSeconds: form.get("purchasePollSeconds"),
      afkTimeoutSeconds: form.get("afkTimeoutSeconds"),
      challengeEnabled: form.get("challengeEnabled") === "on",
      challengeIntervalSeconds: form.get("challengeIntervalSeconds"),
      challengeAnswerWindowSeconds: form.get("challengeAnswerWindowSeconds"),
      challengeRequired: form.get("challengeRequired") === "on",
      minimumMovementDistance: form.get("minimumMovementDistance"),
      minimumActivityEvents: form.get("minimumActivityEvents"),
      botProtectionLevel: form.get("botProtectionLevel")
    }, "PATCH");
  }

  async function updateTicket(event: React.FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send(`/api/owner/support/${ticketId}`, {
      status: form.get("status"),
      ownerNote: form.get("ownerNote")
    }, "PATCH");
  }

  async function copy(value: string, label: string) {
    const copied = await copyText(value);
    setMessage(copied ? `${label} copied` : "Copy was blocked. Select the value and copy it manually.");
  }

  async function rotateSecret(serverId: string) {
    if (!window.confirm("Rotate this plugin secret? The current plugin will disconnect until config.yml is updated.")) {
      return;
    }

    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/owner/servers/${serverId}/plugin-secret`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || "Secret rotation failed");
      return;
    }

    setServerSecrets((current) => ({ ...current, [serverId]: payload.pluginSecret }));
    setMessage(payload.message);
    router.refresh();
  }

  return (
    <>
    <div className="creator-studio">
      <p className="global-message" aria-live="polite">{message}</p>

      <details className="panel disclosure-panel" open={!servers.length}>
        <summary>
          <span><Server size={18} /><strong>List a new server</strong></span>
          <small>Every member can create a listing</small>
        </summary>
        <form className="form-grid form-section" onSubmit={createServer}>
          <div className="form-grid two">
            <div className="form-row"><label htmlFor="new-server-name">Name</label><input className="field" id="new-server-name" name="name" placeholder="Crystal SMP" required /></div>
            <div className="form-row"><label htmlFor="new-server-host">Host</label><input className="field" id="new-server-host" name="host" placeholder="play.example.com" required /></div>
          </div>
          <div className="form-grid four">
            <div className="form-row"><label>Port</label><input className="field" name="port" type="number" defaultValue="25565" /></div>
            <div className="form-row"><label>Version</label><input className="field" name="version" defaultValue="1.21.x" /></div>
            <div className="form-row"><label>Region</label><input className="field" name="region" defaultValue="EU" /></div>
            <div className="form-row"><label>Tags - max 10</label><input className="field" name="tags" defaultValue="Survival,Economy,SMP" /></div>
          </div>
          <div className="form-row"><label>Listing summary</label><textarea className="textarea" name="description" defaultValue="A player-first server with fair rewards and a cosmetic point shop." required /></div>
          <div className="form-row"><label>Full profile story</label><textarea className="textarea tall" name="longDescription" placeholder="What makes the community, gameplay, and economy special?" /></div>
          <div className="form-grid two">
            <div className="form-row"><label>Rules, one per line</label><textarea className="textarea" name="rules" /></div>
            <div className="form-row"><label>Gallery image URLs, comma separated</label><textarea className="textarea" name="galleryImages" /></div>
          </div>
          <div className="form-grid three">
            <div className="form-row"><label>Website URL</label><input className="field" name="websiteUrl" type="url" /></div>
            <div className="form-row"><label>Discord URL</label><input className="field" name="discordUrl" type="url" /></div>
            <div className="form-row"><label>Support URL</label><input className="field" name="supportUrl" type="url" /></div>
          </div>
          <div className="form-grid three">
            <div className="form-row"><label>Reward per second</label><input className="field" name="rewardRatePerSecond" type="number" min="1" max="100" step="0.5" defaultValue="1" /></div>
            <div className="form-row"><label>Paid player cap</label><input className="field" name="maxPaidPlayers" type="number" defaultValue="20" /></div>
            <div className="form-row"><label>Seconds before reviews</label><input className="field" name="minPlaySecondsForComment" type="number" defaultValue="1800" /></div>
          </div>
          <button className="solid-button" disabled={busy} type="submit"><Server size={16} /> Publish draft</button>
        </form>
      </details>

      {!servers.length ? (
        <div className="empty-state rich-empty"><RadioTower size={28} /><strong>No servers yet</strong><span>Publish a listing, connect the plugin, then fund its campaign to enter the marketplace.</span></div>
      ) : null}

      {servers.map((server) => (
        <article className="management-card" key={server.id}>
          <header className="management-card-header">
            <div>
              <div className="inline-actions">
                <span className={`status-pill trust-${server.trustStatus.toLowerCase()}`}><ShieldCheck size={13} /> {server.trustStatus}</span>
                <span className="status-pill">{server.status}</span>
              </div>
              <h3>{server.name}</h3>
              <p className="mono">{serverJoinAddress(server.host, server.port)}</p>
            </div>
            <div className="management-stats">
              <div><span>Campaign credits</span><strong>{points(server.pointPool)}</strong></div>
              <div><span>Reward rate</span><strong>{server.rewardRatePerSecond}/s</strong></div>
              <div><span>Reports</span><strong>{server.reportCount}</strong></div>
            </div>
            <Link className="ghost-button" href={`/servers/${server.slug}`}><ExternalLink size={15} /> View profile</Link>
          </header>

          <div className="management-grid">
            <details className="subpanel-disclosure" open>
              <summary><span><Save size={16} /> Profile and reward rules</span></summary>
              <form className="form-grid form-section" onSubmit={(event) => updateServer(event, server.id)}>
                <div className="form-grid two">
                  <div className="form-row"><label>Name</label><input className="field" name="name" defaultValue={server.name} /></div>
                  <div className="form-row"><label>Host</label><input className="field" name="host" defaultValue={server.host} /></div>
                </div>
                <div className="form-grid four">
                  <div className="form-row"><label>Port</label><input className="field" name="port" type="number" defaultValue={server.port} /></div>
                  <div className="form-row"><label>Version</label><input className="field" name="version" defaultValue={server.version} /></div>
                  <div className="form-row"><label>Region</label><input className="field" name="region" defaultValue={server.region} /></div>
                  <div className="form-row"><label>Status</label><select className="select" name="status" defaultValue={server.status}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></div>
                </div>
                <div className="form-row"><label>Tags - max 10</label><input className="field" name="tags" defaultValue={server.tags} /></div>
                <div className="form-row"><label>Listing summary</label><textarea className="textarea" name="description" defaultValue={server.description} /></div>
                <div className="form-row"><label>Full profile story</label><textarea className="textarea tall" name="longDescription" defaultValue={server.longDescription} /></div>
                <div className="form-grid two">
                  <div className="form-row"><label>Rules</label><textarea className="textarea" name="rules" defaultValue={server.rules} /></div>
                  <div className="form-row"><label>Gallery URLs</label><textarea className="textarea" name="galleryImages" defaultValue={server.galleryImages} /></div>
                </div>
                <div className="form-grid three">
                  <div className="form-row"><label>Website</label><input className="field" name="websiteUrl" type="url" defaultValue={server.websiteUrl || ""} /></div>
                  <div className="form-row"><label>Discord</label><input className="field" name="discordUrl" type="url" defaultValue={server.discordUrl || ""} /></div>
                  <div className="form-row"><label>Support</label><input className="field" name="supportUrl" type="url" defaultValue={server.supportUrl || ""} /></div>
                </div>
                <div className="form-grid three">
                  <div className="form-row"><label>Reward/s</label><input className="field" name="rewardRatePerSecond" type="number" min="1" max="100" step="0.5" defaultValue={server.rewardRatePerSecond} /></div>
                  <div className="form-row"><label>Paid cap</label><input className="field" name="maxPaidPlayers" type="number" defaultValue={server.maxPaidPlayers} /></div>
                  <div className="form-row"><label>Review seconds</label><input className="field" name="minPlaySecondsForComment" type="number" defaultValue={server.minPlaySecondsForComment} /></div>
                </div>
                <button className="solid-button" disabled={busy} type="submit"><Save size={16} /> Save profile</button>
              </form>
            </details>

            <div className="management-side-stack">
              <section className="subpanel">
                <div className="panel-header compact-heading"><div><p className="eyebrow"><Coins size={14} /> Campaign</p><h4>Fund player rewards</h4></div></div>
                <p className="supporting-copy">
                  {paymentMode === "nowpayments"
                    ? <><strong>Crypto checkout:</strong> credits are added only after NOWPayments confirms the payment.</>
                    : <><strong>Purchases are paused during testing.</strong> Prices remain visible, but campaign credits must be granted by an admin.</>}
                  {" "}Use <strong>BOOST10</strong> once per server for a 10% bonus.
                </p>
                <input
                  className="field mono"
                  aria-label={`Promo code for ${server.name}`}
                  placeholder="Promo code"
                  value={promoCodes[server.id] || ""}
                  onChange={(event) => setPromoCodes((current) => ({ ...current, [server.id]: event.target.value.toUpperCase() }))}
                />
                <div className="funding-options">
                  {pointPackages.map((pack) => (
                    <button
                      className="funding-option"
                      key={pack.id}
                      type="button"
                      data-package-label={pack.label}
                      aria-label={`Fund ${server.name} with ${pack.label}`}
                      disabled={busy}
                      onClick={() => startCheckout(`/api/owner/servers/${server.id}/topup`, { packageId: pack.id, promoCode: promoCodes[server.id] || undefined })}
                    >
                      <span>{pack.label}</span><strong>{points(pack.points)}</strong><small>{money(pack.priceCents)}</small>
                    </button>
                  ))}
                </div>
                <div className="premium-shop-heading">
                  <strong>Boost listing visibility</strong>
                  <span>Premium leads 85% of refreshes. Diamond gets 2 chances to lead that lane for every 1 Gold chance; 15% remains a fair community spotlight for standard servers.</span>
                </div>
                <div className="premium-options premium-purchase-grid">
                  {premiumTiers.map((tier) => (
                    <button className={`premium-purchase-option ${tier.code.toLowerCase()}`} key={tier.id} type="button" disabled={busy} onClick={() => startCheckout(`/api/owner/servers/${server.id}/premium`, { tierId: tier.id })}>
                      <span><Gem size={15} /> {tier.name}</span>
                      <strong>{tier.code === "DIAMOND" ? "2x premium-lane chance" : "1x premium-lane chance"}</strong>
                      <small>{tier.durationDays} days / {money(tier.priceCents)}</small>
                    </button>
                  ))}
                </div>
                {activePremiumPlan(server.premiumPlan as "NONE" | "GOLD" | "DIAMOND", server.premiumUntil) !== "NONE" ? (
                  <p className="toast-line">{server.premiumPlan} active until {shortDate(server.premiumUntil!)}</p>
                ) : <p className="toast-line">No active premium placement</p>}
              </section>

              <section className="subpanel">
                <div className="panel-header compact-heading"><div><p className="eyebrow"><RadioTower size={14} /> Bridge</p><h4>Plugin connection</h4></div></div>
                <div className="bridge-actions">
                  <Link className="solid-button" href="/plugin"><Download size={15} /> Install plugin</Link>
                  <span className={`status-pill bridge-${server.lastConfigSyncAt ? "online" : "offline"}`}><Activity size={13} /> {server.lastConfigSyncAt ? "Plugin reached website" : "Waiting for plugin"}</span>
                </div>
                <div className="credential-row"><div><span>Website API URL</span><code>{appBaseUrl}</code></div><button className="icon-button" type="button" title="Copy website API URL" onClick={() => copy(appBaseUrl, "Website API URL")}><Copy size={15} /></button></div>
                <div className="credential-row"><div><span>Server ID</span><code>{server.id}</code></div><button className="icon-button" type="button" title="Copy server ID" onClick={() => copy(server.id, "Server ID")}><Copy size={15} /></button></div>
                <div className="credential-row"><div><span>Plugin secret</span><code>{serverSecrets[server.id]}</code></div><div className="credential-actions"><button className="icon-button" type="button" title="Copy plugin secret" onClick={() => copy(serverSecrets[server.id], "Plugin secret")}><Copy size={15} /></button><button className="icon-button danger-button" type="button" title="Rotate plugin secret" disabled={busy} onClick={() => rotateSecret(server.id)}><RotateCcw size={15} /></button></div></div>
                <p className="credential-help">Put the website URL, Server ID, and plugin secret in <code>plugins/KarixMCBridge/config.yml</code>, then restart Paper. Keep the secret private.</p>
                <div className="integrity-grid">
                  <div><span>Last player activity</span><strong>{server.lastHeartbeatAt ? shortDate(server.lastHeartbeatAt) : "Waiting for an online player"}</strong></div>
                  <div><span>Plugin connection</span><strong>{server.lastConfigSyncAt ? `Synced ${shortDate(server.lastConfigSyncAt)}` : "Not connected"}</strong></div>
                  <div><span>Plugin version</span><strong>{server.lastPluginVersion || "-"}</strong></div>
                  <div><span>Risk score</span><strong>{server.riskScore}</strong></div>
                </div>
                <form className="plugin-policy-form" onSubmit={(event) => updatePluginPolicy(event, server.id)}>
                  <div className="policy-form-heading"><Timer size={16} /><div><strong>Live anti-AFK policy</strong><span>Saved here and synced by the bridge.</span></div></div>
                  <div className="form-grid two">
                    <div className="form-row"><label>AFK after seconds</label><input className="field" name="afkTimeoutSeconds" type="number" min="60" max="1800" defaultValue={server.afkTimeoutSeconds} /></div>
                    <div className="form-row"><label>Challenge every seconds</label><input className="field" name="challengeIntervalSeconds" type="number" min="60" max="3600" defaultValue={server.challengeIntervalSeconds} /></div>
                    <div className="form-row"><label>Answer window seconds</label><input className="field" name="challengeAnswerWindowSeconds" type="number" min="30" max="300" defaultValue={server.challengeAnswerWindowSeconds} /></div>
                    <div className="form-row"><label>Heartbeat seconds</label><input className="field" name="heartbeatIntervalSeconds" type="number" min="10" max="60" defaultValue={server.heartbeatIntervalSeconds} /></div>
                    <div className="form-row"><label>Purchase poll seconds</label><input className="field" name="purchasePollSeconds" type="number" min="10" max="120" defaultValue={server.purchasePollSeconds} /></div>
                    <div className="form-row"><label>Movement distance</label><input className="field" name="minimumMovementDistance" type="number" min="0.05" max="3" step="0.05" defaultValue={server.minimumMovementDistance} /></div>
                    <div className="form-row"><label>Interactions per heartbeat</label><input className="field" name="minimumActivityEvents" type="number" min="0" max="20" defaultValue={server.minimumActivityEvents} /></div>
                    <div className="form-row"><label>Protection level</label><select className="select" name="botProtectionLevel" defaultValue={server.botProtectionLevel}><option value="1">Balanced</option><option value="2">Strict</option><option value="3">Maximum</option></select></div>
                  </div>
                  <div className="policy-toggles">
                    <label className="toggle-row"><input name="challengeEnabled" type="checkbox" defaultChecked={server.challengeEnabled} /> Arithmetic checks enabled</label>
                    <label className="toggle-row"><input name="challengeRequired" type="checkbox" defaultChecked={server.challengeRequired} /> Pause rewards until answered</label>
                  </div>
                  <button className="ghost-button" disabled={busy} type="submit"><ShieldCheck size={15} /> Sync protection policy</button>
                </form>
              </section>
            </div>
          </div>

          <details className="subpanel-disclosure store-manager">
            <summary><span><PackagePlus size={16} /> Store items <span className="badge">{server.items.length}</span></span></summary>
            <div className="form-section">
              <div className="table-shell">
                <table className="table">
                  <thead><tr><th>Item</th><th>Earned points</th><th>Delivery command</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {server.items.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong><p>{item.description}</p></td>
                        <td>{points(item.pricePoints)}</td><td className="mono command-cell">{item.command}</td><td>{item.requiresOnline ? "Online" : "Anytime"} - {item.status}</td>
                        <td><button className="icon-button" type="button" title="Hide item" onClick={() => send(`/api/owner/items/${item.id}`, {}, "DELETE")}><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="form-grid add-item-form" onSubmit={(event) => addItem(event, server.id)}>
                <div className="form-grid two"><div className="form-row"><label>Item name</label><input className="field" name="name" placeholder="VIP Rank / 7 days" required /></div><div className="form-row"><label>Earned-point price</label><input className="field" name="pricePoints" type="number" placeholder="7200" required /></div></div>
                <div className="form-row"><label>Description</label><input className="field" name="description" placeholder="Cosmetic rank with queue priority" required /></div>
                <div className="form-row"><label>Console command</label><input className="field mono" name="command" placeholder="lp user {player} parent addtemp vip 7d" required /></div>
                <label className="toggle-row"><input name="requiresOnline" type="checkbox" defaultChecked /> Deliver only while the player is online</label>
                <button className="ghost-button" disabled={busy} type="submit"><PackagePlus size={16} /> Add store item</button>
              </form>
            </div>
          </details>

          <details className="subpanel-disclosure">
            <summary><span><LifeBuoy size={16} /> Support inbox <span className="badge">{server.supportTickets.length}</span></span></summary>
            <div className="ticket-grid form-section">
              {server.supportTickets.map((ticket) => (
                <form className="ticket-card" key={ticket.id} onSubmit={(event) => updateTicket(event, ticket.id)}>
                  <div><span className={`status-pill status-${ticket.status.toLowerCase()}`}>{ticket.status.replace("_", " ")}</span><h4>{ticket.subject}</h4><p>{ticket.body}</p><small>From {ticket.requester}</small></div>
                  <div className="form-grid"><select className="select" name="status" defaultValue={ticket.status}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select><textarea className="textarea" name="ownerNote" defaultValue={ticket.ownerNote} placeholder="Reply or resolution note" /><button className="ghost-button" disabled={busy}><TicketCheck size={15} /> Update ticket</button></div>
                </form>
              ))}
              {!server.supportTickets.length ? <div className="empty-state compact-empty">No support requests for this server.</div> : null}
            </div>
          </details>

          <footer className="management-card-footer">
            <span>{server.likeCount} likes / {server.favoriteCount} favorites</span>
            <button className="ghost-button danger-button" type="button" disabled={busy} onClick={() => send(`/api/owner/servers/${server.id}`, {}, "DELETE")}><Trash2 size={15} /> Remove listing</button>
          </footer>
        </article>
      ))}
    </div>
    {checkoutNotice ? (
      <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutNotice(false); }}>
        <section className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-notice-title">
          <button className="icon-button dialog-close" type="button" title="Close" aria-label="Close purchase notice" onClick={() => setCheckoutNotice(false)}><X size={17} /></button>
          <p className="eyebrow"><LifeBuoy size={14} /> Assisted checkout</p>
          <h2 id="checkout-notice-title">Purchases are not open yet.</h2>
          <p>KarixMC is still in controlled testing. Contact platform support for campaign-credit or premium test access. No payment has been taken.</p>
          <div className="inline-actions">
            <Link className="solid-button" href="/account#support" onClick={() => setCheckoutNotice(false)}><LifeBuoy size={16} /> Contact support</Link>
            <a className="ghost-button" href={discordUrl} target={discordUrl.startsWith("http") ? "_blank" : undefined} rel={discordUrl.startsWith("http") ? "noreferrer" : undefined}><MessageCircle size={16} /> Official Discord</a>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
