import Link from "next/link";
import { Mark } from "@/app/_ui/mark";

export const metadata = { title: "Hosti" };

/**
 * Nothing at that path. The wording says nothing about what does exist: a
 * private bundle, a rotated-away slug and a slug nobody ever pushed all land
 * here and all read the same.
 */
export default function NotFound() {
  return (
    <main className="gate">
      <div className="card">
        <h1>
          <Mark size={21} />
          hosti
        </h1>
        <p className="setup">Nothing here.</p>
      </div>
      <p className="after">
        <Link href="/">back to the catalog</Link>
      </p>
    </main>
  );
}
