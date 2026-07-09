import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">MinePulse testing</p>
          <h1>Create your own network identity.</h1>
          <p className="lead">
            Testers should use separate accounts so rewards, purchases, Minecraft linking, and profiles stay clean.
          </p>
        </div>
        <SignupForm />
      </section>
    </main>
  );
}
