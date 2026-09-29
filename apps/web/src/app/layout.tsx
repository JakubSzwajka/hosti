import type { ReactNode } from "react";
import "./_styles/hosti.css";
import "./_styles/controls.css";
import "./_styles/grid.css";
import "./_styles/detail.css";
import "./_styles/share.css";
import "./_styles/forms.css";
import "./_styles/onboard.css";
import "./_styles/narrow.css";

export const metadata = {
  title: "Hosti",
  description: "Catalog and host for static bundles",
};

const FONTS =
  "https://fonts.bunny.net/css?family=fraunces:400,900|instrument-sans:400,500,700&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
