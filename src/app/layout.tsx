import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/manrope";
import "./globals.css";

import { WalletProvider } from "@/features/wallet/wallet-provider";

export const metadata: Metadata = {
  title: "Droptron — private launch infrastructure",
  description: "Private participation and private token distribution on Starknet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
