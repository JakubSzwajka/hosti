import { redirect } from "next/navigation";
import { Mark } from "@/app/_ui/mark";
import { safeReturnPath } from "@/app/_http/return-path";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { currentAdmin } from "@/server/auth/admin";
import { showLoginSetup } from "@/use-cases/show-login-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Hosti" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const missing = await runAppUseCase(showLoginSetup());
  const { error, next } = await searchParams;
  const returnTo = safeReturnPath(next);
  if (missing.length === 0 && (await currentAdmin())) redirect(returnTo ?? "/");

  return (
    <main className="gate">
      <div className="card">
        <h1>
          <Mark size={21} />
          hosti
        </h1>
        {missing.length > 0 ? (
          <Setup missing={missing} />
        ) : (
          <Form error={error} returnTo={returnTo} />
        )}
      </div>
      {missing.length === 0 ? <p className="after">A share link never asks for this.</p> : null}
    </main>
  );
}

function Form({ error, returnTo }: { error?: string | undefined; returnTo: string | null }) {
  return (
    <form method="post" action="/login/submit">
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}
      <label htmlFor="password">Owner password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <button type="submit">Sign in</button>
      {error === "locked" ? (
        <p className="error">Too many attempts. Wait a few minutes and try again.</p>
      ) : null}
      {error === "bad" ? <p className="error">That password does not open this catalog.</p> : null}
    </form>
  );
}

function Setup({ missing }: { missing: string[] }) {
  return (
    <>
      <p className="setup">
        Hosti is not configured, so it will not serve the catalog. Set{" "}
        {missing.map((name, index) => (
          <span key={name}>
            {index > 0 ? " and " : ""}
            <code>{name}</code>
          </span>
        ))}{" "}
        in the environment, then restart.
      </p>
      <p className="setup">
        <code>HOSTI_OWNER_PASSWORD_HASH</code> is the scrypt hash of the password this form takes.
        Make it with <code>pnpm owner:hash</code>. <code>HOSTI_SECRET</code> signs the session
        cookie; any long random string will do.
      </p>
    </>
  );
}
