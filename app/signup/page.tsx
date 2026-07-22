import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">KarixMC testing</p>
          <h1>Create your own network identity.</h1>
          <p className="lead">
            Every member should use a separate account so rewards, purchases, Minecraft linking, and profiles stay private.
          </p>
        </div>
        <SignupForm />
      </section>
    </main>
  );
}
