import Link from "next/link";
import { Mark } from "@/app/_ui/mark";

export const metadata = { title: "Hosti" };

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
