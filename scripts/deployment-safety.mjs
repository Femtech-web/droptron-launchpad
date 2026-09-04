export function parseStrkLimit(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) {
    throw new Error("Set a positive MAINNET_MAX_FEE_STRK limit (up to 18 decimals).");
  }
  const [whole, fraction = ""] = value.split(".");
  const limit = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  if (limit <= 0n) throw new Error("Mainnet fee limit must be greater than zero.");
  return limit;
}

export function checkedSubmissionDetails({ approval, expectedApproval, maxFeeStrk, fee, nonce }) {
  if (approval !== expectedApproval) {
    throw new Error(`Submission locked. Explicit approval required: ${expectedApproval}`);
  }
  if (fee.unit !== "FRI") throw new Error("Expected a STRK-denominated fee estimate.");
  const limit = parseStrkLimit(maxFeeStrk);
  let maximumFee = 0n;
  for (const name of ["l1_gas", "l2_gas", "l1_data_gas"]) {
    const bounds = fee.resourceBounds?.[name];
    if (!bounds || bounds.max_amount == null || bounds.max_price_per_unit == null) {
      throw new Error(`Missing fee bounds for ${name}.`);
    }
    const amount = BigInt(bounds.max_amount);
    const price = BigInt(bounds.max_price_per_unit);
    if (amount < 0n || price < 0n) throw new Error("Invalid negative fee bound.");
    maximumFee += amount * price;
  }
  if (maximumFee > limit || BigInt(fee.overall_fee) > limit) {
    throw new Error("Mainnet fee bounds exceed the approved STRK limit. Nothing submitted.");
  }
  // Do not let the SDK re-estimate higher bounds or select an unbounded tip.
  return { resourceBounds: fee.resourceBounds, nonce, tip: 0n };
}
