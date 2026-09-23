import type { ReactNode } from "react";
import "../styles/hosti.css";
import "../styles/controls.css";
import "../styles/grid.css";
import "../styles/detail.css";
import "../styles/share.css";
import "../styles/forms.css";
import "../styles/onboard.css";
import "../styles/narrow.css";

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
