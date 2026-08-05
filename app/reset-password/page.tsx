import { PasswordRecoveryForm } from "@/components/PasswordRecoveryForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || "";
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art"><p className="eyebrow">Credential rotation</p><h1>Set a fresh account password.</h1><p className="lead">A successful reset revokes every browser session attached to the account.</p></div>
        <PasswordRecoveryForm token={token} />
      </section>
    </main>
  );
}
