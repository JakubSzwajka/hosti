import Link from "next/link";

export const metadata = { title: "Hosti" };

/** Nothing at that path. The wording says nothing about what does exist. */
export default function NotFound() {
  return (
    <main className="gate">
      <h1>hosti</h1>
      <p className="setup">Nothing here.</p>
      <p>
        <Link className="btn" href="/">
          back to the catalog
        </Link>
      </p>
    </main>
  );
}
