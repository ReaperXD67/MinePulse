import { SignupForm } from "@/components/SignupForm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function SignupPage() {
  if (await currentUser()) redirect("/account");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">Join KarixMC</p>
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
