import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/manrope";
import "./globals.css";

import { ToastProvider } from "@/features/feedback/toast-provider";
import { WalletProvider } from "@/features/wallet/wallet-provider";
import { WalletSessionProvider } from "@/features/wallet/wallet-session-provider";

export const metadata: Metadata = {
  title: "Droptron — private launch infrastructure",
  description: "Private participation and private token distribution on Starknet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><ToastProvider><WalletProvider><WalletSessionProvider>{children}</WalletSessionProvider></WalletProvider></ToastProvider></body>
    </html>
  );
}
