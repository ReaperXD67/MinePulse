import { LoginForm } from "@/components/LoginForm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeNextPath((await searchParams).next);
  if (await currentUser()) redirect(nextPath === "/" ? "/account" : nextPath);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-art">
          <p className="eyebrow">KarixMC access</p>
          <h1>One identity across every world you build.</h1>
          <p className="lead">
            Play, earn, publish a server, fund rewards, and support communities from one member account.
          </p>
        </div>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
