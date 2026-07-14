"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, Crown, Gift, Save, Search, ServerCog } from "lucide-react";
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
  const [searching, setSearching] = useState(false);

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
      premiumDays: form.get("premiumDays") || undefined
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
      setSelectedAccount(null);
      setCampaignServerId("");
      setAccountQuery("");
      formElement.reset();
    }
  }

  function chooseCampaignAccount(account: CampaignAccount) {
    setSelectedAccount(account);
    setAccountQuery(`${account.username} - ${account.email}`);
    setCampaignServerId(account.ownedServers[0]?.id || "");
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

      <section className="panel admin-grant-panel" id="campaign-grant">
        <div className="panel-header">
          <div>
            <h2>Campaign credit grant</h2>
            <p>Find a member, choose a server they own, and add promotional or support credits to that campaign pool.</p>
          </div>
        </div>
        <form className="form-grid grant-form" onSubmit={grantCampaignPoints}>
          <div className="admin-account-search">
            <Search size={17} aria-hidden="true" />
            <input
              className="field"
              value={accountQuery}
              onChange={(event) => {
                setAccountQuery(event.target.value);
                setSelectedAccount(null);
                setCampaignServerId("");
              }}
              placeholder="Search email, username, or Minecraft name"
              aria-label="Search campaign credit recipient"
              autoComplete="off"
            />
            <span>{searching ? "Searching" : ""}</span>
          </div>
          {accountResults.length ? (
            <div className="admin-account-results" role="listbox" aria-label="Matching accounts">
              {accountResults.map((account) => (
                <button
                  type="button"
                  role="option"
                  key={account.id}
                  onClick={() => chooseCampaignAccount(account)}
                >
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
              <option value={server.id} key={server.id}>
                {server.name} - {points(server.pointPool)} credits - {server.status}
              </option>
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
        <p className="toast-line">{message}</p>
      </section>

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
