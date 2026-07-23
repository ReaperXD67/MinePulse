import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Cookie,
  Database,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  Mail,
  Network,
  Scale,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How KarixMC collects, uses, protects, and shares account, Minecraft, reward, and server data."
};

const updatedAt = "July 23, 2026";

export default function PrivacyPage() {
  const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || "KarixMC";
  const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || "privacy@filesmatrix.com";
  const legalAddress = process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim();

  return (
    <main className="privacy-page">
      <section className="privacy-hero">
        <div className="container privacy-hero-inner">
          <div className="privacy-hero-copy">
            <p className="eyebrow"><ShieldCheck size={15} /> Privacy protocol // v1.0</p>
            <h1>Privacy, without the fog.</h1>
            <p>
              KarixMC connects website accounts, Minecraft play, portable reward points, and server stores.
              This policy explains what enters that network, why it is needed, and the controls you keep.
            </p>
            <div className="privacy-meta">
              <span>Last updated {updatedAt}</span>
              <a href={`mailto:${privacyEmail}`}><Mail size={14} /> {privacyEmail}</a>
            </div>
          </div>

          <div className="privacy-signal" aria-label="Privacy at a glance">
            <div><Fingerprint size={20} /><span>Raw passwords are never stored</span></div>
            <div><Network size={20} /><span>Player IP addresses are stored as salted hashes</span></div>
            <div><Cookie size={20} /><span>One essential sign-in cookie, no advertising trackers</span></div>
            <div><UserRoundCheck size={20} /><span>Access, correction, deletion, and objection rights</span></div>
          </div>
        </div>
      </section>

      <section className="container privacy-layout">
        <aside className="privacy-index" aria-label="Privacy policy contents">
          <p>Policy map</p>
          <a href="#controller"><span>01</span> Who is responsible</a>
          <a href="#collection"><span>02</span> Data we collect</a>
          <a href="#use"><span>03</span> How we use it</a>
          <a href="#automation"><span>04</span> Reward decisions</a>
          <a href="#sharing"><span>05</span> Sharing</a>
          <a href="#retention"><span>06</span> Retention and security</a>
          <a href="#rights"><span>07</span> Your rights</a>
          <a href="#cookies"><span>08</span> Cookies</a>
          <a href="#contact"><span>09</span> Contact</a>
        </aside>

        <article className="privacy-policy">
          <section id="controller" className="policy-section">
            <div className="policy-heading"><Scale size={20} /><span>01</span><h2>Who is responsible</h2></div>
            <p>
              <strong>{legalName}</strong> is the controller of personal data processed by the KarixMC website and
              reward network. Questions and privacy requests can be sent to <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
              {legalAddress ? <> Our contact address is {legalAddress}.</> : null}
            </p>
            <p>
              Minecraft servers listed on KarixMC are independently operated. A server owner may be a separate controller
              for chat, gameplay, moderation, and other information collected under that server&apos;s own rules.
            </p>
          </section>

          <section id="collection" className="policy-section">
            <div className="policy-heading"><Database size={20} /><span>02</span><h2>Data we collect</h2></div>
            <div className="policy-data-grid">
              <div>
                <h3>Account and profile</h3>
                <p>Email address, username, password hash, profile text and image, privacy preferences, Minecraft name and UUID, account role, creation date, friends, favorites, likes, and comments.</p>
              </div>
              <div>
                <h3>Verified play</h3>
                <p>Server and session identifiers, active and AFK time, movement and activity counts, challenge results, reward totals, plugin version and integrity signals, suspicious activity score, and a salted hash of the player IP address.</p>
              </div>
              <div>
                <h3>Rewards and purchases</h3>
                <p>Wallet and campaign balances, point ledger, level and claim rewards, store purchases, delivery status, promo use, payment amount and status, and payment-provider invoice identifiers.</p>
              </div>
              <div>
                <h3>Servers and support</h3>
                <p>Server address, owner settings, campaign rules, plugin connection status, hourly player statistics, listings, reports, enforcement records, support tickets, and information you include in those messages.</p>
              </div>
            </div>
            <p className="policy-note">
              We receive most data directly from you, from the KarixMC plugin installed by participating server owners,
              or from a payment provider when an owner starts a purchase. Please do not place sensitive personal information in comments or support tickets.
            </p>
          </section>

          <section id="use" className="policy-section">
            <div className="policy-heading"><Activity size={20} /><span>03</span><h2>How and why we use data</h2></div>
            <div className="legal-basis-list">
              <div><strong>Provide the service</strong><span>Contract</span><p>Create accounts, link Minecraft identities, record verified play, award and spend points, deliver server items, manage friends, and operate support.</p></div>
              <div><strong>Keep rewards fair</strong><span>Legitimate interests</span><p>Detect AFK sessions, replayed heartbeats, bots, plugin tampering, fake activity, abuse, and payment or reward fraud.</p></div>
              <div><strong>Operate the marketplace</strong><span>Contract and legitimate interests</span><p>Publish server listings, calculate live status, rank premium listings, show average activity, process reports, and enforce network rules.</p></div>
              <div><strong>Payments and records</strong><span>Contract and legal obligation</span><p>Open checkout, reconcile payment status, credit campaigns or premium time, issue corrections, resolve disputes, and keep required financial records.</p></div>
            </div>
            <p>We do not sell personal data and we do not use it for third-party behavioral advertising.</p>
          </section>

          <section id="automation" className="policy-section">
            <div className="policy-heading"><Fingerprint size={20} /><span>04</span><h2>Automated reward and safety decisions</h2></div>
            <p>
              The KarixMC plugin sends signed activity heartbeats. The network checks account linking, server funding,
              activity, AFK state, movement, challenge completion, integrity, duplicate messages, and configured player caps.
              A valid active interval earns the server&apos;s configured rate; an invalid or inactive interval earns nothing.
            </p>
            <p>
              Automated signals may pause rewards, flag a session, or raise a server&apos;s risk score. They do not by themselves
              determine a legal right. You can ask for a human review through support if you believe a reward or enforcement decision is wrong.
            </p>
          </section>

          <section id="sharing" className="policy-section">
            <div className="policy-heading"><Network size={20} /><span>05</span><h2>When data is shared</h2></div>
            <ul>
              <li><strong>Participating Minecraft servers:</strong> receive the Minecraft identity and purchase-delivery information needed to verify play and deliver a selected reward.</li>
              <li><strong>Payment providers:</strong> receive purchase information needed to create and confirm checkout. If NOWPayments is enabled, its own privacy terms also apply. KarixMC does not store private crypto wallet keys.</li>
              <li><strong>Infrastructure providers:</strong> may process data to host the website, database, backups, email, monitoring, and security services under appropriate contractual controls.</li>
              <li><strong>Legal and safety disclosures:</strong> may occur when required by law or reasonably necessary to protect users, the service, or others from fraud, abuse, or security threats.</li>
              <li><strong>Business changes:</strong> data may transfer as part of a merger, financing, acquisition, or sale, subject to this policy and applicable law.</li>
            </ul>
            <p>
              Some providers may process data outside your country. Where EEA or UK data is transferred internationally,
              we use an available lawful safeguard such as an adequacy decision or approved contractual clauses.
            </p>
          </section>

          <section id="retention" className="policy-section">
            <div className="policy-heading"><LockKeyhole size={20} /><span>06</span><h2>Retention and security</h2></div>
            <p>
              Account and profile data is kept while the account is active. Gameplay, reward, integrity, report, and support
              records are kept only as long as needed to operate balances, investigate abuse, resolve disputes, and maintain
              network reliability. Payment and ledger records may be retained longer where tax, accounting, fraud-prevention,
              or other legal rules require it. Backup copies are removed through the normal backup rotation.
            </p>
            <p>
              We use password hashing, HTTP-only session cookies, signed plugin requests, replay protection, hashed player IPs,
              role-based access, and audit records. No system is completely secure, so please use a unique password and report suspicious activity promptly.
            </p>
          </section>

          <section id="rights" className="policy-section">
            <div className="policy-heading"><UserRoundCheck size={20} /><span>07</span><h2>Your privacy rights</h2></div>
            <p>
              Depending on where you live, you may ask to access, correct, delete, restrict, or export your personal data;
              object to certain processing; withdraw consent where consent applies; and request review of an automated decision.
              We may verify your identity before completing a request and may retain information where the law permits or requires it.
            </p>
            <p>
              You may also complain to your local data-protection authority. European users can read the
              <a className="policy-external" href="https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en" target="_blank" rel="noreferrer">
                European Commission&apos;s rights guide <ExternalLink size={13} />
              </a>
              or find an
              <a className="policy-external" href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noreferrer">
                EEA supervisory authority <ExternalLink size={13} />
              </a>.
            </p>
            <p>
              KarixMC is not directed to children under 13. Where local law requires parental permission for a younger person
              to use an online service, that person should use KarixMC only with permission from a parent or guardian.
            </p>
          </section>

          <section id="cookies" className="policy-section">
            <div className="policy-heading"><Cookie size={20} /><span>08</span><h2>Cookies</h2></div>
            <p>
              KarixMC currently uses one essential HTTP-only cookie named <code>minepulse_session</code>. It keeps a member
              signed in for up to seven days, uses SameSite protection, and is marked Secure when HTTPS is configured.
              Because it is necessary for authentication, the service cannot keep you signed in without it.
            </p>
            <p>We do not currently use advertising cookies, browser fingerprinting, or third-party analytics trackers. If that changes, this policy and any required consent controls will be updated first.</p>
          </section>

          <section id="contact" className="policy-section policy-contact">
            <div className="policy-heading"><Mail size={20} /><span>09</span><h2>Contact and policy changes</h2></div>
            <p>
              Send privacy questions or rights requests to <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. For gameplay,
              purchase, or server problems, use <Link href="/plugin#support">KarixMC support</Link> so the operations team can route the issue correctly.
            </p>
            <p>
              We may update this policy when the product, providers, or law changes. Material updates will be shown on the
              website and the date at the top of this page will change.
            </p>
          </section>
        </article>
      </section>
    </main>
  );
}
