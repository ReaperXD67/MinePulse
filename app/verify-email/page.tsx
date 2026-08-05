import { EmailVerificationForm } from "@/components/EmailVerificationForm";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || "";
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art"><p className="eyebrow">Identity checkpoint</p><h1>Verify the address behind the account.</h1><p className="lead">Activation links are single-purpose and expire automatically.</p></div>
        <EmailVerificationForm token={token} />
      </section>
    </main>
  );
}
