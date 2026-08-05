import { PasswordRecoveryForm } from "@/components/PasswordRecoveryForm";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art"><p className="eyebrow">Secure recovery</p><h1>Return to your network identity.</h1><p className="lead">Recovery links expire after 30 minutes and never reveal whether an address is registered.</p></div>
        <PasswordRecoveryForm />
      </section>
    </main>
  );
}
