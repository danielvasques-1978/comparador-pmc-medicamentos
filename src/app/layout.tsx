import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comparador PMC Medicamentos",
  description: "Comparador de PMC por UF e alíquota de ICMS com dados oficiais da CMED/Anvisa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
