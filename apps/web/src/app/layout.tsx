import type { ReactNode } from "react";

export const metadata = {
  title: "Hosti",
  description: "Catalog and host for static bundles",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          font: "16px/1.6 ui-sans-serif, system-ui, sans-serif",
          margin: "12vh auto",
          maxWidth: "36rem",
          padding: "0 1.5rem",
          color: "#1c1917",
          background: "#fafaf9",
        }}
      >
        {children}
      </body>
    </html>
  );
}
