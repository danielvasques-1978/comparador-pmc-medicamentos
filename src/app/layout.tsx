import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comparador PMC Medicamentos",
  description: "Comparador local de PMC por zona de ICMS a partir de suplemento importado.",
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
