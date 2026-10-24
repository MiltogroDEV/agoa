import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

// Importando a fonte Nunito do Google Fonts
const nunito = Nunito({ 
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Agoa Dashboard",
  description: "Monitoramento e Controle Inteligente de Irrigação",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${nunito.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}