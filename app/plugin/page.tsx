import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Command,
  ExternalLink,
  Fingerprint,
  Gauge,
  MessageCircle,
  PlugZap,
  ServerCog,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "KarixMC Bridge | Install and protect rewards",
  description: "Download and connect the KarixMC Paper/Spigot plugin for verified playtime rewards."
};

const commands = [
  { command: "/points", detail: "Wallet, verified playtime, and rewards earned on the current server." },
  { command: "/pool", detail: "The server campaign balance and current reward rate." },
  { command: "/receive", detail: "Retry queued store deliveries after joining the server." },
  { command: "/answer <value>", detail: "Submit the website-generated arithmetic activity check." },
  { command: "/karixmc link <code>", detail: "Connect this Minecraft identity to the account that owns the wallet." },
  { command: "/karixmc privacy", detail: "Show whether activity sharing is enabled and exactly what is sent." },
  { command: "/karixmc forget", detail: "Withdraw consent and stop future reward heartbeats on this server." },
  { command: "/karixmc help", detail: "Show the available bridge commands in game." }
];

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

export default async function PluginPage() {
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL || "#support";
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const insecureHttpOptIn = requiresInsecureHttpOptIn(appBaseUrl);
  const member = await currentUser();
  const supportHref = member ? "/account#support" : "/login?next=%2Faccount%23support";

  return (
    <main className="plugin-page">
      <section className="plugin-hero" style={{ backgroundImage: "url('/voxel-network.png')" }}>
        <div className="plugin-hero-shade" />
        <div className="container plugin-hero-content">
          <div className="plugin-signal"><PlugZap size={17} /><span>Bridge release 0.6.4</span><i>Paper / Spigot 1.20-1.21</i></div>
          <h1>KarixMC Bridge</h1>
          <p>Connect real Minecraft activity to the reward economy. The website owns policy and balances; the plugin verifies play, delivers purchases, and stays deliberately small.</p>
          <div className="inline-actions plugin-hero-actions">
            <a className="solid-button download-button" href="/downloads/KarixMCBridge-0.6.4.jar" download>
              <ArrowDownToLine size={17} /> Download jar
            </a>
            <Link className="ghost-button" href="/account#servers"><ServerCog size={17} /> Open server setup</Link>
          </div>
          <div className="plugin-trust-line">
            <span><ShieldCheck size={15} /> Signed requests and responses</span>
            <span><Fingerprint size={15} /> Persistent replay protection</span>
            <span><Bot size={15} /> No player IP collection</span>
            <span><Activity size={15} /> Live policy sync</span>
          </div>
        </div>
      </section>

      <section className="plugin-band plugin-flow-band">
        <div className="container">
          <div className="plugin-section-heading"><span>Connection path</span><h2>Three credentials. Everything else lives on KarixMC.</h2></div>
          <div className="connection-flow">
            <div><b>01</b><PlugZap size={20} /><strong>Install</strong><span>Place the jar in Paper&apos;s plugins folder.</span></div>
            <div><b>02</b><Fingerprint size={20} /><strong>Connect</strong><span>Add URL, server ID, and secret once.</span></div>
            <div><b>03</b><ServerCog size={20} /><strong>Configure</strong><span>Manage AFK and challenge policy on the website.</span></div>
            <div><b>04</b><CircleDollarSign size={20} /><strong>Reward</strong><span>Linked players earn; store purchases deliver when they are online.</span></div>
          </div>
        </div>
      </section>

      <section className="plugin-band policy-band">
        <div className="container plugin-two-column">
          <div>
            <div className="plugin-section-heading"><span>Owner-controlled policy</span><h2>Change protection without touching YAML.</h2></div>
            <p className="plugin-copy">The bridge pulls its current policy every minute. Owners can tune the five-minute AFK threshold, heartbeat timing, arithmetic checks, answer window, movement sensitivity, interaction minimum, and protection level from Creator Studio. Only players who explicitly link are included in activity batches, and the bridge never sends their IP address.</p>
            <div className="policy-readout">
              <div><Clock3 size={17} /><span><strong>AFK threshold</strong><small>300 seconds by default</small></span><b>LIVE</b></div>
              <div><Bot size={17} /><span><strong>Arithmetic check</strong><small>Every five minutes by default</small></span><b>SERVER VERIFIED</b></div>
              <div><Gauge size={17} /><span><strong>Movement + interaction</strong><small>Accumulated between signed heartbeats</small></span><b>ADAPTIVE</b></div>
            </div>
          </div>
          <div className="install-terminal" aria-label="Plugin configuration example">
            <header><i /><i /><i /><span>plugins/KarixMCBridge/config.yml</span></header>
            <pre><code>{`api-base-url: "${appBaseUrl}"
server-id: "from-creator-studio"
plugin-secret: "keep-this-private"
allow-insecure-http: ${insecureHttpOptIn}`}</code></pre>
            <footer><CheckCircle2 size={15} /> Policy, AFK rules, reward rate, and delivery polling sync from KarixMC</footer>
          </div>
        </div>
        {insecureHttpOptIn ? <div className="container plugin-http-warning"><strong>Temporary HTTP test mode</strong><span>This IP-based VPS requires <code>allow-insecure-http: true</code>. Port 80 is already implied, so use exactly <code>{appBaseUrl}</code> without <code>:3000</code> or an <code>/api</code> suffix. Use HTTPS and change the setting to <code>false</code> before production.</span></div> : null}
      </section>

      <section className="plugin-band config-explainer-band">
        <div className="container config-explainer-grid">
          <div><b>API URL</b><strong>{appBaseUrl}</strong><p>This is the website address. It is not a wallet URL or Minecraft join address, and its standard HTTP port does not need to be written.</p></div>
          <div><b>Server ID + secret</b><strong>Creator Studio / Bridge</strong><p>The ID is a public identifier and grants no access. The secret is shown once after creation or rotation, stays private, and signs every request.</p></div>
          <div><b>Connection proof</b><strong>Policy sync, then player activity</strong><p>Policy sync appears after startup. Reward heartbeats begin only while a player is online.</p></div>
        </div>
      </section>

      <section className="plugin-band commands-band">
        <div className="container">
          <div className="plugin-section-heading"><span>Player commands</span><h2>Useful in game. Quiet when not needed.</h2></div>
          <div className="command-grid">
            {commands.map((item) => <div key={item.command}><Command size={17} /><code>{item.command}</code><p>{item.detail}</p></div>)}
          </div>
        </div>
      </section>

      <section className="plugin-band support-band" id="support">
        <div className="container support-band-inner">
          <div><span className="eyebrow">Official support</span><h2>Bridge setup should not be guesswork.</h2><p>Use platform support for account or delivery issues, and the official Discord for install help and release announcements.</p></div>
          <div className="inline-actions">
            <a className="solid-button" href={discordUrl} target={discordUrl.startsWith("http") ? "_blank" : undefined} rel={discordUrl.startsWith("http") ? "noreferrer" : undefined}><MessageCircle size={17} /> Official Discord <ExternalLink size={14} /></a>
            <Link className="ghost-button" href={supportHref}><WalletCards size={17} /> My support tickets</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
