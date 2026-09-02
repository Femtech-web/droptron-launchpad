export const STRK_TOKEN_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const STRK_DECIMALS = 18;

export function formatTokenAmount(value: bigint, decimals = STRK_DECIMALS) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
