export const STRK_TOKEN_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const STRK_DECIMALS = 18;
export const SEPOLIA_USDC_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SEPOLIA_USDC_TOKEN_ADDRESS?.trim()
  || "0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343";
export const USDC_DECIMALS = 6;
export const DROP_DECIMALS = 18;
export const SEPOLIA_DROP_ADDRESS_KEY = "droptron.sepolia.dropTokenAddress";
export const MAINNET_DROP_ADDRESS_KEY = "droptron.mainnet.dropTokenAddress";
/** @deprecated Use the chain-specific key. */
export const DROP_ADDRESS_KEY = SEPOLIA_DROP_ADDRESS_KEY;

export type TokenDetails = { symbol: string; decimals: number };

export function knownTokenDetails(address: string): TokenDetails | null {
  if (!address) return null;
  try {
    const normalized = BigInt(address);
    if (normalized === BigInt(STRK_TOKEN_ADDRESS)) return { symbol: "STRK", decimals: STRK_DECIMALS };
    if (normalized === BigInt(SEPOLIA_USDC_TOKEN_ADDRESS)) return { symbol: "USDC", decimals: USDC_DECIMALS };
    const dropAddresses = [
      process.env.NEXT_PUBLIC_MAINNET_DROP_TOKEN_ADDRESS?.trim(),
      process.env.NEXT_PUBLIC_SEPOLIA_DROP_TOKEN_ADDRESS?.trim(),
      ...(typeof window !== "undefined"
        ? [window.localStorage.getItem(MAINNET_DROP_ADDRESS_KEY), window.localStorage.getItem(SEPOLIA_DROP_ADDRESS_KEY)]
        : []),
    ].filter((item): item is string => Boolean(item));
    if (dropAddresses.some((item) => normalized === BigInt(item))) return { symbol: "DROP", decimals: DROP_DECIMALS };
  } catch {
    return null;
  }
  return null;
}

export function parseTokenAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const units = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return BigInt(units || "0");
}

export function formatTokenAmount(value: bigint, decimals = STRK_DECIMALS) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function formatTokenInputAmount(value: bigint, decimals: number) {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function privateTokenBalance(raw: unknown, tokenAddress: string) {
  const response = (raw as { value?: unknown })?.value ?? raw;
  if (!Array.isArray(response)) return BigInt(0);
  const target = BigInt(tokenAddress);
  const entry = response.find((item) => {
    const itemToken = (item as { token?: unknown; token_address?: unknown })?.token
      ?? (item as { token_address?: unknown })?.token_address
      ?? (Array.isArray(item) ? item[0] : undefined);
    try { return BigInt(String(itemToken)) === target; } catch { return false; }
  });
  if (!entry) return BigInt(0);
  const amount = (entry as { amount?: unknown; balance?: unknown })?.amount
    ?? (entry as { balance?: unknown })?.balance
    ?? (Array.isArray(entry) ? entry[1] : 0);
  try { return BigInt(String(amount ?? 0)); } catch { return BigInt(0); }
}
