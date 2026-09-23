import { redirect } from "next/navigation";
import { Mark } from "@/app/_ui/mark";
import { currentAdmin } from "@/server/auth/admin";
import { missingAdminVars } from "@/server/auth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Hosti" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const missing = missingAdminVars();
  if (missing.length === 0 && (await currentAdmin())) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="gate">
      <div className="card">
        <h1>
          <Mark size={21} />
          hosti
        </h1>
        {missing.length > 0 ? <Setup missing={missing} /> : <Form error={error} />}
      </div>
      {missing.length === 0 ? <p className="after">A share link never asks for this.</p> : null}
    </main>
  );
}

function Form({ error }: { error?: string | undefined }) {
  return (
    <form method="post" action="/login/submit">
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
        <code>HOSTI_OWNER_PASSWORD</code> is the password this form takes. <code>HOSTI_SECRET</code>{" "}
        signs the session cookie; any long random string will do.
      </p>
    </>
  );
}
