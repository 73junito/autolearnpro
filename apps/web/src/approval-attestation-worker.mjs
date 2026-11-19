// D02-E: runtime-neutral approval attestation for Cloudflare Workers.
// This module never reads secrets from public request data.
const encoder = new TextEncoder();
const KEY_PATTERN = /^[0-9a-f]{64}$/i;

export function hasValidAttestationKey(key) {
  return typeof key === "string" && KEY_PATTERN.test(key);
}

function fromHex(key) {
  return Uint8Array.from(key.match(/../g), (part) => parseInt(part, 16));
}

export function encodeApprovalMessage(parts) {
  return parts
    .map((value) => {
      const text = String(value);
      return `${encoder.encode(text).byteLength}:${text}`;
    })
    .join("|");
}

export async function signWorkerApproval(key, operation, actor, args = [], options = {}) {
  if (!hasValidAttestationKey(key)) throw new Error("approval attestation key is not configured");
  if (!Array.isArray(args) || args.some((value) => value === null || value === undefined)) {
    throw new TypeError("invalid attestation arguments");
  }
  const subtle = options.subtle ?? crypto.subtle;
  const nonce = options.nonce ?? crypto.randomUUID();
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const parts = [operation, actor, ...args, String(issuedAt), nonce];
  const material = await subtle.importKey(
    "raw",
    fromHex(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await subtle.sign("HMAC", material, encoder.encode(encodeApprovalMessage(parts)));
  const signature = Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [issuedAt, nonce, signature];
}
