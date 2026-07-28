"use client";

import Link from "next/link";
import { copyText } from "@/lib/copy-text";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Coins,
  Copy,
  Download,
  ExternalLink,
  ImageUp,
  LifeBuoy,
  PackagePlus,
  RadioTower,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  TicketCheck,
  Timer,
  Trash2,
  Zap,
  X
} from "lucide-react";
import { points, shortDate } from "@/lib/format";
import type { OwnerServerView } from "@/lib/owner-server-view";
import { activePremiumPlan } from "@/lib/premium";
import { serverJoinAddress } from "@/lib/server-address";
import { rewardRateVisualTier } from "@/lib/reward-rate";
import { MINECRAFT_VERSIONS, parseVersionRange, SERVER_REGIONS } from "@/lib/server-profile";

const rewardRateExamples = [
  { rate: 1.5, label: "Boosted" },
  { rate: 2, label: "High yield" },
  { rate: 2.5, label: "Apex" },
  { rate: 3, label: "Maximum" }
];

const rewardRateChoices = [1, 1.5, 2, 2.5, 3] as const;

function RewardRatePicker({ defaultValue }: { defaultValue: number }) {
  return (
    <fieldset className="reward-rate-picker">
      <legend>Reward per second</legend>
      <div className="reward-rate-options">
        {rewardRateChoices.map((rate) => (
          <label className={`reward-rate-option reward-${rewardRateVisualTier(rate)}`} key={rate}>
            <input defaultChecked={rate === defaultValue} name="rewardRatePerSecond" type="radio" value={rate} />
            <span><strong>{rate}</strong><small>pt/s</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function requiresInsecureHttpOptIn(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return url.protocol === "http:" && !loopback;
  } catch {
    return false;
  }
}

function createMediaScope() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  // This groups owner-authenticated media; it is not a credential or access token.
  return `scope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function OwnerConsole({
  servers,
  appBaseUrl
}: {
  servers: OwnerServerView[];
  appBaseUrl: string;
}) {
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [busy, setBusy] = useState(false);
  const [serverState, setServerState] = useState(servers);
  const [serverSecrets, setServerSecrets] = useState<Record<string, string>>({});
  const [oneTimeCredential, setOneTimeCredential] = useState<{ serverId: string; pluginSecret: string } | null>(null);
  const refreshSequence = useRef(0);
  const visibleServers = serverState;
  const insecureHttpOptIn = requiresInsecureHttpOptIn(appBaseUrl);

  const refreshServers = useCallback(async (showError = false) => {
    const requestId = ++refreshSequence.current;
    try {
      const response = await fetch("/api/owner/servers", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.servers)) {
        if (showError) {
          setMessageTone("error");
          setMessage(payload.error || `Could not refresh servers (HTTP ${response.status})`);
        }
        return false;
      }
      if (requestId === refreshSequence.current) {
        setServerState(payload.servers as OwnerServerView[]);
      }
      return true;
    } catch {
      if (showError) {
        setMessageTone("error");
        setMessage("Could not refresh Creator Studio. Check the connection and try again.");
      }
      return false;
    }
  }, []);

  useEffect(() => {
    setServerState(servers);
  }, [servers]);

  useEffect(() => {
    const syncVisibleServers = () => {
      if (document.visibilityState === "visible") void refreshServers();
    };
    void refreshServers();
    const timer = window.setInterval(syncVisibleServers, 10_000);
    window.addEventListener("focus", syncVisibleServers);
    document.addEventListener("visibilitychange", syncVisibleServers);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncVisibleServers);
      document.removeEventListener("visibilitychange", syncVisibleServers);
    };
  }, [refreshServers]);

  function reportInvalid(event: React.FormEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    setMessageTone("error");
    setMessage(field.validationMessage || "Check the highlighted field and try again.");
  }

  async function send(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    setMessageTone("info");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessageTone("error");
        setMessage(payload.error || `Action failed (HTTP ${response.status})`);
        return null;
      }

      const refreshed = await refreshServers();
      setMessageTone(refreshed ? "success" : "error");
      setMessage(refreshed
        ? payload.message || "Saved"
        : `${payload.message || "Saved"}, but Creator Studio could not reload the current data.`);
      return payload;
    } catch {
      setMessageTone("error");
      setMessage("KarixMC could not reach the website service. Check the connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(file: File, kind: "banner" | "gallery", scopeId: string) {
    const body = new FormData();
    body.set("image", file);
    body.set("kind", kind);
    body.set("scopeId", scopeId);
    try {
      const response = await fetch("/api/account/media", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageTone("error");
        setMessage(payload.error || (response.status === 413
          ? "The image upload is too large for the website proxy"
          : `Could not upload ${file.name} (HTTP ${response.status})`));
        return null;
      }
      return String(payload.url || "");
    } catch {
      setMessageTone("error");
      setMessage(`Could not upload ${file.name}. Check the connection and try again.`);
      return null;
    }
  }

  async function uploadGallery(files: File[], scopeId: string) {
    if (!files.length) return [];
    if (files.length > 5) {
      setMessageTone("error");
      setMessage("A server can upload a maximum of 5 gallery images");
      return null;
    }

    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadMedia(file, "gallery", scopeId);
      if (!url) return null;
      urls.push(url);
    }
    return urls;
  }

  async function createServer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const mediaScope = createMediaScope();
    setBusy(true);
    setMessageTone("info");
    setMessage("Publishing your server...");
    try {
      const bannerFile = form.get("bannerFile");
      const bannerImage = bannerFile instanceof File && bannerFile.size > 0
        ? await uploadMedia(bannerFile, "banner", mediaScope)
        : "/voxel-network.png";
      if (!bannerImage) return;
      const gallery = await uploadGallery(
        form.getAll("galleryFiles").filter((entry): entry is File => entry instanceof File && entry.size > 0),
        mediaScope
      );
      if (gallery === null) return;
      const result = await send("/api/owner/servers", {
        name: form.get("name"),
        host: form.get("host"),
        port: form.get("port"),
        minVersion: form.get("minVersion"),
        maxVersion: form.get("maxVersion"),
        region: form.get("region"),
        tags: form.get("tags"),
        description: form.get("description"),
        longDescription: form.get("longDescription"),
        rules: form.get("rules"),
        bannerImage,
        galleryImages: gallery.join(","),
        websiteUrl: form.get("websiteUrl"),
        discordUrl: form.get("discordUrl"),
        supportUrl: form.get("supportUrl"),
        rewardRatePerSecond: form.get("rewardRatePerSecond"),
        maxPaidPlayers: form.get("maxPaidPlayers"),
        minPlaySecondsForComment: form.get("minPlaySecondsForComment")
      });

      if (result) {
        setOneTimeCredential({ serverId: result.serverId, pluginSecret: result.pluginSecret });
        formElement.reset();
      }
    } catch {
      setMessageTone("error");
      setMessage("The server could not be published. Check the fields and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateServer(event: React.FormEvent<HTMLFormElement>, serverId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mediaScope = createMediaScope();
    setBusy(true);
    const files = form.getAll("galleryFiles").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const uploaded = await uploadGallery(files, mediaScope);
    if (uploaded === null) {
      setBusy(false);
      return;
    }
    const galleryImages = form.get("clearGallery") === "on"
      ? ""
      : uploaded.length
        ? uploaded.join(",")
        : String(form.get("existingGalleryImages") || "");
    const bannerFile = form.get("bannerFile");
    const bannerImage = form.get("clearBanner") === "on"
      ? "/voxel-network.png"
      : bannerFile instanceof File && bannerFile.size > 0
        ? await uploadMedia(bannerFile, "banner", mediaScope)
        : String(form.get("existingBannerImage") || "/voxel-network.png");
    if (!bannerImage) {
      setBusy(false);
      return;
    }
    await send(`/api/owner/servers/${serverId}`, {
      name: form.get("name"),
      host: form.get("host"),
      port: form.get("port"),
      minVersion: form.get("minVersion"),
      maxVersion: form.get("maxVersion"),
      region: form.get("region"),
      tags: form.get("tags"),
      description: form.get("description"),
      longDescription: form.get("longDescription"),
      rules: form.get("rules"),
      bannerImage,
      galleryImages,
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

  async function removeServer(serverId: string, serverName: string) {
    if (!window.confirm(`Remove ${serverName}? It will disappear from Creator Studio and the public marketplace.`)) {
      return;
    }

    const removed = await send(`/api/owner/servers/${serverId}`, {}, "DELETE");
    if (removed) {
      setServerState((current) => current.filter((server) => server.id !== serverId));
      setMessageTone("success");
      setMessage(`${serverName} was removed. Admin audit history was preserved.`);
    }
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
    setOneTimeCredential({ serverId, pluginSecret: payload.pluginSecret });
    setMessageTone("success");
    setMessage(payload.message);
    await refreshServers();
  }

  return (
    <>
    <div className="creator-studio">
      <p className={`global-message message-${messageTone}`} aria-live="polite">{message}</p>
      {oneTimeCredential ? (
        <section className="panel one-time-secret" aria-label="One-time plugin credential">
          <div><ShieldCheck size={18} /><span><strong>Copy this plugin secret now</strong><small>It is shown only once. Server IDs are public identifiers; this secret is private.</small></span></div>
          <div className="credential-row"><div><span>Server ID</span><code>{oneTimeCredential.serverId}</code></div><button className="icon-button" type="button" title="Copy server ID" onClick={() => copy(oneTimeCredential.serverId, "Server ID")}><Copy size={15} /></button></div>
          <div className="credential-row"><div><span>Plugin secret</span><code>{oneTimeCredential.pluginSecret}</code></div><button className="icon-button" type="button" title="Copy one-time plugin secret" onClick={() => copy(oneTimeCredential.pluginSecret, "Plugin secret")}><Copy size={15} /></button></div>
          <button className="ghost-button" type="button" onClick={() => setOneTimeCredential(null)}><X size={15} /> I stored it safely</button>
        </section>
      ) : null}

      <section className="reward-rate-guide" aria-labelledby="reward-rate-guide-title">
        <header>
          <span id="reward-rate-guide-title"><Zap size={16} /> Reward signal preview</span>
          <small>Marketplace appearance</small>
        </header>
        <div className="reward-rate-preview-grid">
          {rewardRateExamples.map((example) => (
            <div className={`reward-rate-swatch reward-${rewardRateVisualTier(example.rate)}`} key={example.rate}>
              <span>{example.label}</span>
              <strong><Zap size={15} /> {example.rate}/s</strong>
            </div>
          ))}
        </div>
      </section>

      <details className="panel disclosure-panel" open={!visibleServers.length}>
        <summary>
          <span><Server size={18} /><strong>List a new server</strong></span>
          <small>Every member can create a listing</small>
        </summary>
        <form className="form-grid form-section" onInvalid={reportInvalid} onSubmit={createServer}>
          <div className="form-grid two">
            <div className="form-row"><label htmlFor="new-server-name">Name</label><input className="field" id="new-server-name" name="name" placeholder="Crystal SMP" required /></div>
            <div className="form-row"><label htmlFor="new-server-host">Host</label><input className="field" id="new-server-host" name="host" placeholder="play.example.com" required /></div>
          </div>
          <div className="form-grid four">
            <div className="form-row"><label>Port</label><input className="field" name="port" type="number" defaultValue="25565" /></div>
            <div className="form-row"><label>Minimum version</label><select className="select" name="minVersion" defaultValue="1.21.11">{MINECRAFT_VERSIONS.map((version) => <option value={version} key={version}>{version}</option>)}</select></div>
            <div className="form-row"><label>Maximum version</label><select className="select" name="maxVersion" defaultValue="1.21.11">{MINECRAFT_VERSIONS.map((version) => <option value={version} key={version}>{version}</option>)}</select></div>
            <div className="form-row"><label>Region</label><select className="select" name="region" defaultValue="EU">{SERVER_REGIONS.map((region) => <option value={region.value} key={region.value}>{region.label}</option>)}</select></div>
            <div className="form-row"><label>Tags - max 10</label><input className="field" name="tags" defaultValue="Survival,Economy,SMP" /></div>
          </div>
          <div className="form-row"><label>Listing summary</label><textarea className="textarea" name="description" defaultValue="A player-first server with fair rewards and a cosmetic point shop." required /></div>
          <div className="form-row"><label>Full profile story</label><textarea className="textarea tall" name="longDescription" placeholder="What makes the community, gameplay, and economy special?" /></div>
          <div className="form-grid two">
            <div className="form-row"><label>Rules, one per line</label><textarea className="textarea" name="rules" /></div>
            <div className="form-row"><label><ImageUp size={14} /> Server banner</label><input className="field file-field" name="bannerFile" type="file" accept="image/png,image/jpeg" /><small>Stored as optimized WebP, up to 750 KB.</small></div>
            <div className="form-row"><label>Gallery images</label><input className="field file-field" name="galleryFiles" type="file" accept="image/png,image/jpeg" multiple /><small>Up to 5 images, each stored as optimized WebP under 500 KB.</small></div>
          </div>
          <div className="form-grid three">
            <div className="form-row"><label>Website URL</label><input className="field" name="websiteUrl" type="url" /></div>
            <div className="form-row"><label>Discord URL</label><input className="field" name="discordUrl" type="url" /></div>
            <div className="form-row"><label>Support URL</label><input className="field" name="supportUrl" type="url" /></div>
          </div>
          <div className="form-grid three">
            <RewardRatePicker defaultValue={1} />
            <div className="form-row"><label>Paid player cap</label><input className="field" name="maxPaidPlayers" type="number" defaultValue="20" /></div>
            <div className="form-row"><label>Seconds before reviews</label><input className="field" name="minPlaySecondsForComment" type="number" defaultValue="1800" /></div>
          </div>
          <div className="form-footer">
            <p className="toast-line" aria-live="polite">{message}</p>
            <button className="solid-button" disabled={busy} type="submit"><Server size={16} /> {busy ? "Publishing..." : "Publish draft"}</button>
          </div>
        </form>
      </details>

      {!visibleServers.length ? (
        <div className="empty-state rich-empty"><RadioTower size={28} /><strong>No servers yet</strong><span>Publish a listing, connect the plugin, then fund its campaign to enter the marketplace.</span></div>
      ) : null}

      {visibleServers.map((server) => (
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
              <form className="form-grid form-section" onInvalid={reportInvalid} onSubmit={(event) => updateServer(event, server.id)}>
                <div className="form-grid two">
                  <div className="form-row"><label>Name</label><input className="field" name="name" defaultValue={server.name} /></div>
                  <div className="form-row"><label>Host</label><input className="field" name="host" defaultValue={server.host} /></div>
                </div>
                <div className="form-grid four">
                  <div className="form-row"><label>Port</label><input className="field" name="port" type="number" defaultValue={server.port} /></div>
                  <div className="form-row"><label>Minimum version</label><select className="select" name="minVersion" defaultValue={parseVersionRange(server.version).min}>{MINECRAFT_VERSIONS.map((version) => <option value={version} key={version}>{version}</option>)}</select></div>
                  <div className="form-row"><label>Maximum version</label><select className="select" name="maxVersion" defaultValue={parseVersionRange(server.version).max}>{MINECRAFT_VERSIONS.map((version) => <option value={version} key={version}>{version}</option>)}</select></div>
                  <div className="form-row"><label>Region</label><select className="select" name="region" defaultValue={SERVER_REGIONS.some((region) => region.value === server.region) ? server.region : "GLOBAL"}>{SERVER_REGIONS.map((region) => <option value={region.value} key={region.value}>{region.label}</option>)}</select></div>
                  <div className="form-row"><label>Status</label><select className="select" name="status" defaultValue={server.status}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></div>
                </div>
                <div className="form-row"><label>Tags - max 10</label><input className="field" name="tags" defaultValue={server.tags} /></div>
                <div className="form-row"><label>Listing summary</label><textarea className="textarea" name="description" defaultValue={server.description} /></div>
                <div className="form-row"><label>Full profile story</label><textarea className="textarea tall" name="longDescription" defaultValue={server.longDescription} /></div>
                <div className="form-grid two">
                  <div className="form-row"><label>Rules</label><textarea className="textarea" name="rules" defaultValue={server.rules} /></div>
                  <div className="form-row"><label>Replace banner</label><input className="field file-field" name="bannerFile" type="file" accept="image/png,image/jpeg" /><input name="existingBannerImage" type="hidden" value={server.bannerImage} /><small>Stored as optimized WebP, up to 750 KB.</small><label className="toggle-row"><input name="clearBanner" type="checkbox" /> Use default banner</label></div>
                  <div className="form-row"><label>Replace gallery</label><input className="field file-field" name="galleryFiles" type="file" accept="image/png,image/jpeg" multiple /><input name="existingGalleryImages" type="hidden" value={server.galleryImages} /><small>{server.galleryImages ? `${server.galleryImages.split(",").filter(Boolean).length} image(s) currently published` : "No images published"}</small><label className="toggle-row"><input name="clearGallery" type="checkbox" /> Remove current gallery</label></div>
                </div>
                <div className="form-grid three">
                  <div className="form-row"><label>Website</label><input className="field" name="websiteUrl" type="url" defaultValue={server.websiteUrl || ""} /></div>
                  <div className="form-row"><label>Discord</label><input className="field" name="discordUrl" type="url" defaultValue={server.discordUrl || ""} /></div>
                  <div className="form-row"><label>Support</label><input className="field" name="supportUrl" type="url" defaultValue={server.supportUrl || ""} /></div>
                </div>
                <div className="form-grid three">
                  <RewardRatePicker defaultValue={server.rewardRatePerSecond} />
                  <div className="form-row"><label>Paid cap</label><input className="field" name="maxPaidPlayers" type="number" defaultValue={server.maxPaidPlayers} /></div>
                  <div className="form-row"><label>Review seconds</label><input className="field" name="minPlaySecondsForComment" type="number" defaultValue={server.minPlaySecondsForComment} /></div>
                </div>
                <div className="form-footer">
                  <p className="toast-line" aria-live="polite">{message}</p>
                  <button className="solid-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Saving..." : "Save profile"}</button>
                </div>
              </form>
            </details>

            <div className="management-side-stack">
              <section className="subpanel">
                <div className="panel-header compact-heading"><div><p className="eyebrow"><Coins size={14} /> Campaign</p><h4>Testing access</h4></div><span className="status-pill">Admin managed</span></div>
                <p className="supporting-copy"><strong>No payment method is connected.</strong> KarixMC does not collect money or open a mock checkout during testing. An administrator can grant campaign credits or premium time from the admin panel.</p>
                <div className="integrity-grid campaign-access-grid">
                  <div><span>Campaign pool</span><strong>{points(server.pointPool)} credits</strong></div>
                  <div><span>Visibility</span><strong>{activePremiumPlan(server.premiumPlan as "NONE" | "GOLD" | "DIAMOND", server.premiumUntil) === "NONE" ? "Standard" : server.premiumPlan}</strong></div>
                </div>
                {activePremiumPlan(server.premiumPlan as "NONE" | "GOLD" | "DIAMOND", server.premiumUntil) !== "NONE" ? (
                  <p className="toast-line">{server.premiumPlan} active until {shortDate(server.premiumUntil!)}</p>
                ) : <p className="toast-line">Contact an administrator when this server needs testing credits or premium placement.</p>}
              </section>

              <section className="subpanel">
                <div className="panel-header compact-heading"><div><p className="eyebrow"><RadioTower size={14} /> Bridge</p><h4>Plugin connection</h4></div></div>
                <div className="bridge-actions">
                  <Link className="solid-button" href="/plugin"><Download size={15} /> Install plugin</Link>
                  <span className={`status-pill bridge-${server.lastConfigSyncAt ? "online" : "offline"}`}><Activity size={13} /> {server.lastConfigSyncAt ? "Plugin reached website" : "Waiting for plugin"}</span>
                </div>
                <div className="credential-row"><div><span>Website API URL</span><code>{appBaseUrl}</code></div><button className="icon-button" type="button" title="Copy website API URL" onClick={() => copy(appBaseUrl, "Website API URL")}><Copy size={15} /></button></div>
                <div className="credential-row"><div><span>Server ID - public identifier</span><code>{server.id}</code></div><button className="icon-button" type="button" title="Copy server ID" onClick={() => copy(server.id, "Server ID")}><Copy size={15} /></button></div>
                <div className="credential-row"><div><span>Plugin secret - private</span><code>{serverSecrets[server.id] || "Hidden after creation"}</code></div><div className="credential-actions">{serverSecrets[server.id] ? <button className="icon-button" type="button" title="Copy plugin secret" onClick={() => copy(serverSecrets[server.id], "Plugin secret")}><Copy size={15} /></button> : null}<button className="icon-button danger-button" type="button" title="Generate a new one-time plugin secret" disabled={busy} onClick={() => rotateSecret(server.id)}><RotateCcw size={15} /></button></div></div>
                <div className="credential-row"><div><span>HTTP test-mode setting</span><code>allow-insecure-http: {insecureHttpOptIn ? "true" : "false"}</code></div><button className="icon-button" type="button" title="Copy HTTP setting" onClick={() => copy(`allow-insecure-http: ${insecureHttpOptIn}`, "HTTP setting")}><Copy size={15} /></button></div>
                <p className="credential-help">The Server ID may be visible publicly and grants no access by itself. The secret is shown only after creation or rotation and signs every plugin request. Put both in <code>plugins/KarixMCBridge/config.yml</code>, then restart Paper.</p>
                {insecureHttpOptIn ? <p className="credential-help bridge-http-warning"><strong>Required on this test VPS:</strong> set <code>allow-insecure-http: true</code>. Change it back to <code>false</code> as soon as the production domain uses HTTPS.</p> : null}
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
            <button className="ghost-button danger-button" type="button" disabled={busy} onClick={() => removeServer(server.id, server.name)}><Trash2 size={15} /> Remove listing</button>
          </footer>
        </article>
      ))}
    </div>
    </>
  );
}
