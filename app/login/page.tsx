import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">MinePulse access</p>
          <h1>One economy for every server worth playing.</h1>
          <p className="lead">
            Admins tune prices, owners fund reward pools, and players turn time into in-game value.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
