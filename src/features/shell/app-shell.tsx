"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { WalletButton } from "@/features/wallet/wallet-button";
import { NetworkSwitcher } from "@/features/wallet/network-switcher";

function Mark() { return <Image className="app-mark" src="/brand/zamops-icon.svg" alt="" width={22} height={22} priority />; }

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (path: string) => path === "/app" ? pathname === path : pathname.startsWith(path);
  const launchesActive = pathname === "/app" || pathname.startsWith("/app/launches");
  return <div className="app-shell">
    <a className="app-skip" href="#main-content">Skip to content</a>
    <header className="app-header">
      <div className="app-header__left"><Link className="app-brand" href="/"><Mark /><strong>droptron <span>/ launch desk</span></strong></Link><nav className="app-nav" aria-label="App navigation"><Link href="/app" aria-current={launchesActive ? "page" : undefined}>Launches</Link><Link href="/app/distributions" aria-current={active("/app/distributions") ? "page" : undefined}>Distributions</Link><Link href="/app/vesting" aria-current={active("/app/vesting") ? "page" : undefined}>Vesting</Link><Link href="/app/claims" aria-current={active("/app/claims") ? "page" : undefined}>Claims</Link><Link href="/app/wallet" aria-current={active("/app/wallet") ? "page" : undefined}>Wallet</Link></nav></div>
      <div className="app-header__actions"><NetworkSwitcher /><WalletButton /></div>
    </header>
    {children}
  </div>;
}
