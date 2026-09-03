import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const AAD = Buffer.from("droptron:recipient-manifest:v1", "utf8");

function encryptionKey() {
  const encoded = process.env.DROPTON_DATA_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[0-9a-fA-F]{64}$/.test(encoded)) {
    throw new Error("DROPTON_DATA_ENCRYPTION_KEY must be a 32-byte hex key.");
  }
  return Buffer.from(encoded, "hex");
}

export function encryptRecipientManifest(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptRecipientManifest(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported recipient manifest format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
