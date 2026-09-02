import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = { title: "Launch desk — Droptron", description: "Private launch operations on Starknet." };

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
