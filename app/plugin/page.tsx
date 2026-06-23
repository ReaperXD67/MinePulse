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

export const metadata: Metadata = {
  title: "MinePulse Bridge | Install and protect rewards",
  description: "Download and connect the MinePulse Paper plugin for verified playtime rewards."
};

const commands = [
  { command: "/points", detail: "Wallet, verified playtime, and rewards earned on the current server." },
  { command: "/pool", detail: "The server campaign balance and current reward rate." },
  { command: "/answer <value>", detail: "Submit the website-generated arithmetic activity check." },
  { command: "/minepulse link <code>", detail: "Connect this Minecraft identity to the account that owns the wallet." },
  { command: "/minepulse help", detail: "Show the available bridge commands in game." }
];

export default function PluginPage() {
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL || "#support";

  return (
    <main className="plugin-page">
      <section className="plugin-hero" style={{ backgroundImage: "url('/voxel-network.png')" }}>
        <div className="plugin-hero-shade" />
        <div className="container plugin-hero-content">
          <div className="plugin-signal"><PlugZap size={17} /><span>Bridge release 0.3.1</span><i>Paper 1.20-1.21</i></div>
          <h1>MinePulse Bridge</h1>
          <p>Connect real Minecraft activity to the reward economy. The website owns policy and balances; the plugin verifies play, delivers purchases, and stays deliberately small.</p>
          <div className="inline-actions plugin-hero-actions">
            <a className="solid-button download-button" href="/downloads/MinePulseBridge-0.3.1.jar" download>
              <ArrowDownToLine size={17} /> Download jar
            </a>
            <Link className="ghost-button" href="/account#servers"><ServerCog size={17} /> Open server setup</Link>
          </div>
          <div className="plugin-trust-line">
            <span><ShieldCheck size={15} /> Signed heartbeats</span>
            <span><Fingerprint size={15} /> Replay protection</span>
            <span><Activity size={15} /> Live policy sync</span>
          </div>
        </div>
      </section>

      <section className="plugin-band plugin-flow-band">
        <div className="container">
          <div className="plugin-section-heading"><span>Connection path</span><h2>Three credentials. Everything else lives on MinePulse.</h2></div>
          <div className="connection-flow">
            <div><b>01</b><PlugZap size={20} /><strong>Install</strong><span>Place the jar in Paper&apos;s plugins folder.</span></div>
            <div><b>02</b><Fingerprint size={20} /><strong>Connect</strong><span>Add URL, server ID, and secret once.</span></div>
            <div><b>03</b><ServerCog size={20} /><strong>Configure</strong><span>Manage AFK and challenge policy on the website.</span></div>
            <div><b>04</b><CircleDollarSign size={20} /><strong>Reward</strong><span>MinePulse verifies and pays from the campaign pool.</span></div>
          </div>
        </div>
      </section>

      <section className="plugin-band policy-band">
        <div className="container plugin-two-column">
          <div>
            <div className="plugin-section-heading"><span>Owner-controlled policy</span><h2>Change protection without touching YAML.</h2></div>
            <p className="plugin-copy">The bridge pulls its current policy every minute. Owners can tune the five-minute AFK threshold, heartbeat timing, arithmetic checks, answer window, movement sensitivity, interaction minimum, and protection level from Creator Studio.</p>
            <div className="policy-readout">
              <div><Clock3 size={17} /><span><strong>AFK threshold</strong><small>300 seconds by default</small></span><b>LIVE</b></div>
              <div><Bot size={17} /><span><strong>Arithmetic check</strong><small>Every five minutes by default</small></span><b>SERVER VERIFIED</b></div>
              <div><Gauge size={17} /><span><strong>Movement + interaction</strong><small>Accumulated between signed heartbeats</small></span><b>ADAPTIVE</b></div>
            </div>
          </div>
          <div className="install-terminal" aria-label="Plugin configuration example">
            <header><i /><i /><i /><span>plugins/MinePulseBridge/config.yml</span></header>
            <pre><code>{`api-base-url: "https://your-minepulse.com"
server-id: "from-creator-studio"
plugin-secret: "keep-this-private"`}</code></pre>
            <footer><CheckCircle2 size={15} /> Policy syncs from MinePulse after startup</footer>
          </div>
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
            <Link className="ghost-button" href="/account#support"><WalletCards size={17} /> My support tickets</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
