import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">MinePulse access</p>
          <h1>One identity across every world you build.</h1>
          <p className="lead">
            Play, earn, publish a server, fund rewards, and support communities from one member account.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
