import type { ActionKind } from "./private-action-panel";
import type { PrivacySetupIssue } from "./privacy-registration";

const walletErrorCodes: Record<number, string> = {
  113: "USER_REFUSED_OP",
  114: "INVALID_REQUEST_PAYLOAD",
  117: "CHAIN_ID_NOT_SUPPORTED",
  118: "NOT_REGISTERED",
  119: "INSUFFICIENT_PRIVATE_BALANCE",
  120: "PRIVACY_LEAK",
  162: "API_VERSION_NOT_SUPPORTED",
  163: "UNKNOWN_ERROR",
};

function errorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${error.cause ? String(error.cause) : ""}`;
  }
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

export function walletErrorName(error: unknown) {
  const raw = errorText(error);
  const candidate = typeof error === "object" && error !== null
    ? error as { code?: unknown; data?: { code?: unknown } }
    : null;
  const numericCode = Number(candidate?.code ?? candidate?.data?.code ?? Number.NaN);
  return walletErrorCodes[numericCode]
    ?? Object.values(walletErrorCodes).find((code) => raw.includes(code));
}

function privacySetupMessage(issue: PrivacySetupIssue) {
  if (issue === "unregistered") return "Ready privacy setup failed. Retry in Ready.";
  if (issue === "registered") return "Privacy is enabled, but Ready could not open private state. Reopen Ready and retry.";
  return "Ready privacy setup is unavailable. Try again shortly.";
}

export function privateBalanceErrorMessage(error: unknown, setupIssue: PrivacySetupIssue = "unknown") {
  const code = walletErrorName(error);
  if (code === "USER_REFUSED_OP") return "Balance request cancelled.";
  if (code === "NOT_REGISTERED") return privacySetupMessage(setupIssue);
  if (code === "CHAIN_ID_NOT_SUPPORTED") return "Switch Ready and Droptron to the same supported network, then try again.";
  if (code === "API_VERSION_NOT_SUPPORTED") return "Update Ready, reconnect, and try again.";
  if (setupIssue !== "unknown") return privacySetupMessage(setupIssue);
  return "Ready could not read private balances. Retry in Ready.";
}

export function privateActionErrorMessage(
  error: unknown,
  { kind, symbol, setupIssue = "unknown" }: { kind: ActionKind; symbol: string; setupIssue?: PrivacySetupIssue },
) {
  const raw = errorText(error);
  const namedCode = walletErrorName(error);
  const action = kind === "deposit" ? "shield" : kind === "transfer" ? "transfer" : "unshield";

  if (raw.toLowerCase().includes("missing channel context")) {
    return "The recipient has not enabled private tokens. Ask them to enable privacy in Ready first.";
  }

  switch (namedCode) {
    case "USER_REFUSED_OP":
      return "Request cancelled. No funds moved.";
    case "INVALID_REQUEST_PAYLOAD":
      return `Ready could not prepare this ${action} request. Refresh Droptron and try again. No funds moved.`;
    case "CHAIN_ID_NOT_SUPPORTED":
      return "Ready is on an unsupported network. Switch Ready and Droptron to the same Starknet network.";
    case "NOT_REGISTERED":
      return privacySetupMessage(setupIssue);
    case "INSUFFICIENT_PRIVATE_BALANCE":
      return `Your private ${symbol} balance does not cover the amount and pool fee for this ${action}.`;
    case "PRIVACY_LEAK":
      return "Ready stopped this action because it could expose private activity. Change the amount or wait before trying again.";
    case "API_VERSION_NOT_SUPPORTED":
      return "This Ready version cannot complete the action. Update Ready, reconnect, and try again.";
    case "UNKNOWN_ERROR":
      return setupIssue === "unregistered"
        ? "Enable private tokens in Ready before trying again."
        : `Ready could not complete this ${action}. No funds moved.`;
    default:
      break;
  }

  const normalized = raw.toLowerCase();
  if (normalized.includes("insufficient") || normalized.includes("balance")) {
    return kind === "deposit"
      ? `Your public ${symbol} balance or STRK gas balance is too low for this shield.`
      : `Your private ${symbol} balance does not cover the amount and pool fee for this ${action}.`;
  }
  if (normalized.includes("screen") || normalized.includes("compliance")) {
    return "STRK20 screening did not approve this deposit. No funds moved.";
  }
  if (normalized.includes("network") || normalized.includes("chain")) {
    return "Ready and Droptron are on different networks. Switch both to the same Starknet network.";
  }

  return `Ready could not complete this ${action}. No transaction was submitted. Try again.`;
}
