import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedSubmissionDetails, parseStrkLimit } from "./deployment-safety.mjs";
const bounds = { max_amount: 1n, max_price_per_unit: 10n ** 18n };
const fee = { unit: "FRI", overall_fee: 2n * 10n ** 18n, resourceBounds: { l1_gas: bounds, l2_gas: bounds, l1_data_gas: bounds } };
const approved = { approval: "declare:0x1", expectedApproval: "declare:0x1", maxFeeStrk: "3", fee, nonce: "0x4" };
test("parses exact limits without floating-point conversion", () => assert.equal(parseStrkLimit("3.000000000000000001"), 3000000000000000001n));
test("rejects missing, zero, negative, exponent and overprecision limits", () => {
  for (const value of [undefined, "0", "-1", "1e3", "1.0000000000000000001"]) assert.throws(() => parseStrkLimit(value));
});
test("binds submission to exact artifact approval", () => assert.throws(() => checkedSubmissionDetails({ ...approved, approval: "declare:0x2" })));
test("limits maximum resource liability, not just optimistic estimate", () => assert.throws(() => checkedSubmissionDetails({ ...approved, maxFeeStrk: "2" })));
test("rejects missing resource bounds and wrong fee units", () => {
  assert.throws(() => checkedSubmissionDetails({ ...approved, fee: { ...fee, resourceBounds: {} } }));
  assert.throws(() => checkedSubmissionDetails({ ...approved, fee: { ...fee, unit: "WEI" } }));
});
test("passes the estimated bounds, nonce and zero tip without re-estimation", () => assert.deepEqual(checkedSubmissionDetails(approved), { resourceBounds: fee.resourceBounds, nonce: "0x4", tip: 0n }));
