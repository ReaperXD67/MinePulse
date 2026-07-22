"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Coins,
  Crown,
  Gem,
  Gift,
  RotateCcw,
  Save,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wifi,
  WifiOff
} from "lucide-react";
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
  host: string;
  port: number;
  tags: string[];
  status: string;
  pointPool: number;
  premiumPlan: string;
  premiumUntil: string | null;
  trustStatus: string;
  bridgeOnline: boolean;
  lastConfigSyncAt: string | null;
  lastPluginVersion: string | null;
  riskScore: number;
  integrityFailures: number;
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
};

type UserRow = {
  id: string;
  username: string;
  email: string;
  minecraftName: string | null;
  walletPoints: number;
};

type CampaignAccount = {
  id: string;
  username: string;
  email: string;
  minecraftName: string | null;
  ownedServers: Array<{
    id: string;
    name: string;
    pointPool: number;
    status: string;
  }>;
};

const SERVERS_PER_PAGE = 10;

export function AdminConsole({
  pointPackages,
  premiumTiers,
  servers,
  users
}: {
  pointPackages: PackageRow[];
  premiumTiers: TierRow[];
  servers: ServerRow[];
  users: UserRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<CampaignAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CampaignAccount | null>(null);
  const [campaignServerId, setCampaignServerId] = useState("");
  const [premiumServerId, setPremiumServerId] = useState("");
  const [searching, setSearching] = useState(false);
  const [serverQuery, setServerQuery] = useState("");
  const [serverStatus, setServerStatus] = useState("ALL");
  const [serverTrust, setServerTrust] = useState("ALL");
  const [serverBridge, setServerBridge] = useState("ALL");
  const [serverPremium, setServerPremium] = useState("ALL");
  const [serverTag, setServerTag] = useState("ALL");
  const [serverPage, setServerPage] = useState(1);

  const serverTags = useMemo(
    () => Array.from(new Set(servers.flatMap((server) => server.tags))).sort((a, b) => a.localeCompare(b)),
    [servers]
  );

  const filteredServers = useMemo(() => {
    const query = serverQuery.trim().toLowerCase();
    return servers.filter((server) => {
      const matchesQuery = !query || [
        server.name,
        server.owner,
        server.host,
        `${server.host}:${server.port}`,
        ...server.tags
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = serverStatus === "ALL" || server.status === serverStatus;
      const matchesTrust = serverTrust === "ALL" || server.trustStatus === serverTrust;
      const matchesBridge = serverBridge === "ALL" || (serverBridge === "ONLINE" ? server.bridgeOnline : !server.bridgeOnline);
      const matchesPremium = serverPremium === "ALL" || server.premiumPlan === serverPremium;
      const matchesTag = serverTag === "ALL" || server.tags.some((tag) => tag.toLowerCase() === serverTag.toLowerCase());
      return matchesQuery && matchesStatus && matchesTrust && matchesBridge && matchesPremium && matchesTag;
    });
  }, [servers, serverBridge, serverPremium, serverQuery, serverStatus, serverTag, serverTrust]);

  const serverPageCount = Math.max(1, Math.ceil(filteredServers.length / SERVERS_PER_PAGE));
  const visibleServers = filteredServers.slice((serverPage - 1) * SERVERS_PER_PAGE, serverPage * SERVERS_PER_PAGE);

  useEffect(() => {
    setServerPage(1);
  }, [serverBridge, serverPremium, serverQuery, serverStatus, serverTag, serverTrust]);

  useEffect(() => {
    if (serverPage > serverPageCount) setServerPage(serverPageCount);
  }, [serverPage, serverPageCount]);

  useEffect(() => {
    const query = accountQuery.trim();
    if (query.length < 2 || selectedAccount) {
      setAccountResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/campaign-grants?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) setAccountResults(payload.accounts || []);
      } catch {
        if (!controller.signal.aborted) setAccountResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accountQuery, selectedAccount]);

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
      return false;
    }

    setMessage(payload.message || "Saved");
    router.refresh();
    return true;
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
      premiumDays: form.get("premiumDays") || undefined,
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
    });
  }

  function grantPoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send(
      "/api/admin/users/grant",
      {
        userId: form.get("userId"),
        amountPoints: form.get("amountPoints"),
        description: form.get("description")
      },
      "POST"
    );
  }

  async function grantCampaignPoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedAccount || !campaignServerId) {
      setMessage("Select an account and one of its servers first");
      return;
    }
    const form = new FormData(formElement);
    const sent = await send(
      "/api/admin/campaign-grants",
      {
        userId: selectedAccount.id,
        serverId: campaignServerId,
        amountPoints: form.get("amountPoints"),
        description: form.get("description")
      },
      "POST"
    );
    if (sent) {
      formElement.reset();
    }
  }

  async function grantPremium(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount || !premiumServerId) {
      setMessage("Select an account and one of its servers first");
      return;
    }
    const form = new FormData(event.currentTarget);
    await send(`/api/admin/servers/${premiumServerId}`, {
      premiumPlan: form.get("premiumPlan"),
      premiumDays: form.get("premiumDays")
    });
  }

  async function quickModerate(server: ServerRow, action: "pause" | "blacklist" | "remove" | "restore") {
    if (
      (action === "blacklist" || action === "remove") &&
      !window.confirm(`${action === "blacklist" ? "Blacklist" : "Remove"} ${server.name} from the public network?`)
    ) {
      return;
    }

    const body = action === "pause"
      ? { status: "PAUSED" }
      : action === "blacklist"
        ? { status: "PAUSED", trustStatus: "BLACKLISTED" }
        : action === "remove"
          ? { status: "REMOVED" }
          : { status: "ACTIVE", trustStatus: server.trustStatus === "BLACKLISTED" ? "VERIFIED" : server.trustStatus };

    await send(`/api/admin/servers/${server.id}`, body);
  }

  function chooseGrantAccount(account: CampaignAccount) {
    setSelectedAccount(account);
    setAccountQuery(`${account.username} - ${account.email}`);
    setCampaignServerId(account.ownedServers[0]?.id || "");
    setPremiumServerId(account.ownedServers[0]?.id || "");
    setAccountResults([]);
  }

  return (
    <div className="dashboard-grid">
      <section className="panel admin-grant-panel">
        <div className="panel-header">
          <div>
            <h2>Manual wallet grant</h2>
            <p>Give earned points to an account with a ledger description, for events or support fixes.</p>
          </div>
        </div>
        <form className="form-grid grant-form" onSubmit={grantPoints}>
          <select className="select" name="userId" required aria-label="Account">
            {users.map((account) => (
              <option value={account.id} key={account.id}>
                {account.username} - {account.minecraftName || account.email} - {points(account.walletPoints)}
              </option>
            ))}
          </select>
          <div className="form-grid two">
            <input className="field" name="amountPoints" type="number" defaultValue="1000" required aria-label="Points to grant" />
            <input className="field" name="description" placeholder="Won weekend event" minLength={4} maxLength={240} required />
          </div>
          <button className="solid-button" disabled={busy} type="submit"><Gift size={16} /> Grant points</button>
        </form>
      </section>

      <section className="panel admin-grant-panel" id="server-grants">
        <div className="panel-header">
          <div>
            <h2>Server grants</h2>
            <p>Find a member once, then fund a campaign or grant temporary Gold or Diamond placement.</p>
          </div>
        </div>
        <div className="form-grid grant-form">
          <div className="admin-account-search">
            <Search size={17} aria-hidden="true" />
            <input
              className="field"
              value={accountQuery}
              onChange={(event) => {
                setAccountQuery(event.target.value);
                setSelectedAccount(null);
                setCampaignServerId("");
                setPremiumServerId("");
              }}
              placeholder="Search email, username, or Minecraft name"
              aria-label="Search server owner"
              autoComplete="off"
            />
            <span>{searching ? "Searching" : ""}</span>
          </div>
          {accountResults.length ? (
            <div className="admin-account-results" role="listbox" aria-label="Matching accounts">
              {accountResults.map((account) => (
                <button type="button" role="option" key={account.id} onClick={() => chooseGrantAccount(account)}>
                  <span><strong>{account.username}</strong><small>{account.minecraftName || account.email}</small></span>
                  <span>{account.ownedServers.length} server{account.ownedServers.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {accountQuery.trim().length >= 2 && !searching && !accountResults.length && !selectedAccount ? (
            <p className="toast-line">No matching account selected. Check the spelling or use the account email.</p>
          ) : null}
          {selectedAccount ? (
            <div className="admin-selected-account">
              <div><strong>{selectedAccount.username}</strong><span>{selectedAccount.email}</span></div>
              <span>{selectedAccount.minecraftName || "Minecraft not linked"}</span>
            </div>
          ) : null}
        </div>

        <div className="admin-server-grant-grid">
          <form className="form-grid admin-grant-column" onSubmit={grantCampaignPoints}>
            <div className="admin-grant-heading"><Coins size={18} /><div><strong>Campaign credits</strong><span>Reward budget only. It cannot be spent as a player wallet.</span></div></div>
            <select
              className="select"
              value={campaignServerId}
              onChange={(event) => setCampaignServerId(event.target.value)}
              disabled={!selectedAccount?.ownedServers.length}
              required
              aria-label="Campaign server"
            >
              <option value="">{selectedAccount?.ownedServers.length ? "Choose server" : "Select an account with a server"}</option>
              {selectedAccount?.ownedServers.map((server) => (
                <option value={server.id} key={server.id}>{server.name} - {points(server.pointPool)} credits - {server.status}</option>
              ))}
            </select>
            <div className="form-grid two">
              <input className="field" name="amountPoints" type="number" min="1" max="1000000000" defaultValue="1000000" required aria-label="Campaign credits to grant" />
              <input className="field" name="description" placeholder="Testing grant, event prize, or support correction" minLength={4} maxLength={240} required />
            </div>
            <button className="solid-button" disabled={busy || !selectedAccount || !campaignServerId} type="submit">
              <Coins size={16} /> Send campaign credits
            </button>
          </form>

          <form className="form-grid admin-grant-column premium-grant-column" onSubmit={grantPremium}>
            <div className="admin-grant-heading"><Gem size={18} /><div><strong>Premium placement</strong><span>Grant a visible Gold or Diamond lane for a fixed test period.</span></div></div>
            <select
              className="select"
              value={premiumServerId}
              onChange={(event) => setPremiumServerId(event.target.value)}
              disabled={!selectedAccount?.ownedServers.length}
              required
              aria-label="Premium server"
            >
              <option value="">{selectedAccount?.ownedServers.length ? "Choose server" : "Select an account with a server"}</option>
              {selectedAccount?.ownedServers.map((server) => (
                <option value={server.id} key={server.id}>{server.name} - {server.status}</option>
              ))}
            </select>
            <div className="form-grid two">
              <select className="select" name="premiumPlan" defaultValue="GOLD" aria-label="Premium grant plan">
                <option value="GOLD">Gold lane</option>
                <option value="DIAMOND">Diamond lane</option>
              </select>
              <select className="select" name="premiumDays" defaultValue="7" aria-label="Premium grant duration">
                <option value="7">1 week</option>
                <option value="14">2 weeks</option>
              </select>
            </div>
            <button className="solid-button premium-grant-button" disabled={busy || !selectedAccount || !premiumServerId} type="submit">
              <Crown size={16} /> Grant premium placement
            </button>
          </form>
        </div>
        <p className="toast-line global-message" aria-live="polite">{message}</p>
      </section>

      <section className="panel admin-economy-panel">
        <div className="panel-header">
          <div>
            <h2>Economy pricing</h2>
            <p>Change real-money prices and point quantities without deploying code.</p>
          </div>
        </div>
        <p className="toast-line">{message}</p>
        <div className="split-list admin-pricing-grid package-pricing-grid">
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
        <div className="split-list admin-pricing-grid premium-pricing-grid">
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

      <section className="panel admin-fleet-panel">
        <div className="panel-header">
          <div>
            <h2>Server control</h2>
            <p>Search the fleet, inspect bridge health, and change economy, trust, or protection policy.</p>
          </div>
          <span className="badge">{filteredServers.length} / {servers.length}</span>
        </div>

        <div className="admin-fleet-toolbar">
          <label className="admin-fleet-search">
            <Search size={17} aria-hidden="true" />
            <input
              className="field"
              value={serverQuery}
              onChange={(event) => setServerQuery(event.target.value)}
              placeholder="Search server, owner, address, or tag"
              aria-label="Search servers"
            />
          </label>
          <select className="select" value={serverStatus} onChange={(event) => setServerStatus(event.target.value)} aria-label="Filter by server status">
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="REMOVED">Removed</option>
          </select>
          <select className="select" value={serverBridge} onChange={(event) => setServerBridge(event.target.value)} aria-label="Filter by bridge connection">
            <option value="ALL">Any connection</option>
            <option value="ONLINE">Bridge online</option>
            <option value="OFFLINE">Bridge offline</option>
          </select>
          <select className="select" value={serverTag} onChange={(event) => setServerTag(event.target.value)} aria-label="Filter by server tag">
            <option value="ALL">All tags</option>
            {serverTags.map((tag) => <option value={tag} key={tag}>{tag}</option>)}
          </select>
          <select className="select" value={serverTrust} onChange={(event) => setServerTrust(event.target.value)} aria-label="Filter by trust status">
            <option value="ALL">Any trust</option>
            <option value="VERIFIED">Verified</option>
            <option value="WATCHLIST">Watchlist</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BLACKLISTED">Blacklisted</option>
          </select>
          <select className="select" value={serverPremium} onChange={(event) => setServerPremium(event.target.value)} aria-label="Filter by premium plan">
            <option value="ALL">Any plan</option>
            <option value="NONE">Standard</option>
            <option value="GOLD">Gold</option>
            <option value="DIAMOND">Diamond</option>
          </select>
        </div>

        <div className="admin-fleet-list">
          {visibleServers.map((server) => (
            <details className="admin-fleet-item" key={server.id}>
              <summary>
                <span className={`admin-bridge-orb ${server.bridgeOnline ? "online" : "offline"}`} title={server.bridgeOnline ? "Bridge online" : "Bridge offline"}>
                  {server.bridgeOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                </span>
                <span className="admin-fleet-identity">
                  <strong>{server.name}</strong>
                  <small>{server.host}:{server.port} / {server.owner}</small>
                </span>
                <span className="admin-fleet-tags">
                  {server.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}
                </span>
                <span className="admin-fleet-balance"><small>Campaign</small><strong>{points(server.pointPool)}</strong></span>
                <span className={`status-pill status-${server.status.toLowerCase()}`}>{server.status}</span>
                <span className={`status-pill trust-${server.trustStatus.toLowerCase()}`}>{server.trustStatus}</span>
              </summary>

              <form className="admin-fleet-form" onSubmit={(event) => updateServer(event, server.id)}>
                <div className="admin-fleet-overview">
                  <div><span>Plugin</span><strong>{server.lastPluginVersion || "Not reported"}</strong></div>
                  <div><span>Last policy sync</span><strong>{server.lastConfigSyncAt ? shortDate(server.lastConfigSyncAt) : "Never"}</strong></div>
                  <div><span>Policy revision</span><strong>#{server.pluginConfigRevision}</strong></div>
                  <div><span>Risk / integrity</span><strong>{server.riskScore} / {server.integrityFailures}</strong></div>
                </div>

                <div className="admin-fleet-settings-grid">
                  <fieldset>
                    <legend><Coins size={15} /> Listing and economy</legend>
                    <div className="form-grid two">
                      <div className="form-row"><label>Pool adjustment</label><input className="field" name="adjustPoints" type="number" defaultValue="0" /></div>
                      <div className="form-row"><label>Status</label><select className="select" name="status" defaultValue={server.status}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="REMOVED">Removed</option></select></div>
                      <div className="form-row"><label>Trust</label><select className="select" name="trustStatus" defaultValue={server.trustStatus}><option value="VERIFIED">Verified</option><option value="WATCHLIST">Watchlist</option><option value="SUSPENDED">Suspended</option><option value="BLACKLISTED">Blacklisted</option></select></div>
                      <div className="form-row"><label>Premium</label><select className="select" name="premiumPlan" defaultValue={server.premiumPlan}><option value="NONE">None</option><option value="GOLD">Gold</option><option value="DIAMOND">Diamond</option></select></div>
                      <div className="form-row"><label>Premium days</label><input className="field" name="premiumDays" type="number" min="0" max="365" placeholder="Keep current" /></div>
                      <div className="form-row"><label>Current premium</label><input className="field" value={server.premiumUntil ? `Until ${shortDate(server.premiumUntil)}` : "Not active"} readOnly /></div>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend><ShieldCheck size={15} /> AFK and activity checks</legend>
                    <div className="form-grid three">
                      <div className="form-row"><label>AFK after</label><input className="field" name="afkTimeoutSeconds" type="number" min="60" max="1800" defaultValue={server.afkTimeoutSeconds} /><small>seconds</small></div>
                      <div className="form-row"><label>Ask /answer every</label><input className="field" name="challengeIntervalSeconds" type="number" min="60" max="3600" defaultValue={server.challengeIntervalSeconds} /><small>seconds</small></div>
                      <div className="form-row"><label>Answer window</label><input className="field" name="challengeAnswerWindowSeconds" type="number" min="30" max="300" defaultValue={server.challengeAnswerWindowSeconds} /><small>seconds</small></div>
                      <div className="form-row"><label>Heartbeat</label><input className="field" name="heartbeatIntervalSeconds" type="number" min="10" max="60" defaultValue={server.heartbeatIntervalSeconds} /><small>seconds</small></div>
                      <div className="form-row"><label>Purchase poll</label><input className="field" name="purchasePollSeconds" type="number" min="10" max="120" defaultValue={server.purchasePollSeconds} /><small>seconds</small></div>
                      <div className="form-row"><label>Protection</label><select className="select" name="botProtectionLevel" defaultValue={server.botProtectionLevel}><option value="1">Balanced</option><option value="2">Strict</option><option value="3">Maximum</option></select></div>
                      <div className="form-row"><label>Movement distance</label><input className="field" name="minimumMovementDistance" type="number" min="0.05" max="3" step="0.05" defaultValue={server.minimumMovementDistance} /></div>
                      <div className="form-row"><label>Activity events</label><input className="field" name="minimumActivityEvents" type="number" min="0" max="20" defaultValue={server.minimumActivityEvents} /></div>
                    </div>
                    <div className="policy-toggles">
                      <label className="toggle-row"><input name="challengeEnabled" type="checkbox" defaultChecked={server.challengeEnabled} /> Enable arithmetic checks</label>
                      <label className="toggle-row"><input name="challengeRequired" type="checkbox" defaultChecked={server.challengeRequired} /> Pause rewards until correct answer</label>
                    </div>
                  </fieldset>
                </div>

                <div className="admin-fleet-footer">
                  <div className="admin-server-actions" aria-label={`Quick moderation for ${server.name}`}>
                    {server.status === "ACTIVE" ? (
                      <button className="ghost-button" type="button" disabled={busy} onClick={() => quickModerate(server, "pause")}><CirclePause size={15} /> Pause</button>
                    ) : (
                      <button className="ghost-button" type="button" disabled={busy} onClick={() => quickModerate(server, "restore")}><RotateCcw size={15} /> Restore</button>
                    )}
                    <button className="ghost-button danger-button" type="button" disabled={busy || server.trustStatus === "BLACKLISTED"} onClick={() => quickModerate(server, "blacklist")}><Ban size={15} /> Blacklist</button>
                    <button className="ghost-button danger-button" type="button" disabled={busy || server.status === "REMOVED"} onClick={() => quickModerate(server, "remove")}><Trash2 size={15} /> Remove</button>
                  </div>
                  <button className="solid-button" disabled={busy} type="submit"><ServerCog size={16} /> Save and sync policy</button>
                </div>
              </form>
            </details>
          ))}
          {!visibleServers.length ? (
            <div className="empty-state compact-empty"><SlidersHorizontal size={20} /> No servers match these filters.</div>
          ) : null}
        </div>

        <div className="admin-fleet-pagination" aria-label="Server result pages">
          <span>Showing {filteredServers.length ? (serverPage - 1) * SERVERS_PER_PAGE + 1 : 0}-{Math.min(serverPage * SERVERS_PER_PAGE, filteredServers.length)} of {filteredServers.length}</span>
          <div>
            <button className="icon-button" type="button" title="Previous page" aria-label="Previous server page" disabled={serverPage === 1} onClick={() => setServerPage((page) => Math.max(1, page - 1))}><ChevronLeft size={17} /></button>
            <strong>Page {serverPage} / {serverPageCount}</strong>
            <button className="icon-button" type="button" title="Next page" aria-label="Next server page" disabled={serverPage === serverPageCount} onClick={() => setServerPage((page) => Math.min(serverPageCount, page + 1))}><ChevronRight size={17} /></button>
          </div>
        </div>
        <p className="toast-line global-message" aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
