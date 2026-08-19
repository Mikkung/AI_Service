import type {
  Metadata,
} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ISE AI Management",
  description:
    "Administration console for the ISE AI service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
