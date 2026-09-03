function readableError(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

export function productErrorMessage(error: unknown, fallback: string) {
  const message = readableError(error).toLowerCase();

  if (message.includes("user_refused") || message.includes("user rejected") || message.includes("cancelled")) {
    return "Request cancelled. Nothing changed.";
  }
  if (message.includes("failed to sign message") || message.includes("sign message")) {
    return "Ready could not complete workspace sign-in. Unlock Ready and try again.";
  }
  if (message.includes("privacy_leak")) {
    return "Ready stopped this request because it could expose private activity. Wait for recent notes to mature and try again.";
  }
  if (message.includes("not_registered")) {
    return "Enable private tokens in Ready before trying again.";
  }
  if (message.includes("invalid_request_payload")) {
    return "Ready could not prepare this private request. Refresh Droptron and try again; nothing was submitted.";
  }
  if (message.includes("insufficient") || message.includes("max fee") || message.includes("balance")) {
    return "There is not enough STRK to cover this transaction and its network fee.";
  }
  if (message.includes("nonce")) {
    return "The wallet state changed before submission. Reconnect and try again.";
  }
  if (message.includes("chain") || message.includes("network")) {
    return "The wallet and Droptron are on different networks. Switch both to the same Starknet network and retry.";
  }
  if (message.includes("rpc") || message.includes("fetch") || message.includes("networkerror")) {
    return "Starknet is temporarily unavailable. Your request was not submitted; try again shortly.";
  }
  if (message.includes("timeout") || message.includes("still confirming")) {
    return "The transaction was submitted and is still confirming. Check again shortly.";
  }
  if (message.includes("already declared")) {
    return "The contract class is already on Sepolia. Continue with deployment.";
  }

  return fallback;
}
