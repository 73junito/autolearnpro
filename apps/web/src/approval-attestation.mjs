import { createHmac, randomUUID } from "node:crypto";

// The attestation secret is server-side only; it must never be placed in
// source, logs, public Cloudflare bindings or a browser bundle.
export function validApprovalKey(key) {
  return typeof key === "string" && /^[0-9a-f]{64}$/i.test(key);
}

export function signApprovalOperation(key, operation, actor, args = []) {
  if (!validApprovalKey(key)) {
    throw new Error("approval attestation key is not configured");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  // Length-prefixing prevents delimiter or Unicode ambiguity. PostgreSQL
  // constructs exactly the same UTF-8 text in verify_approval_attestation.
  const parts = [operation, actor, ...args.map(String), String(issuedAt), nonce];
  const message = parts.map(part =>
    `${Buffer.byteLength(part, "utf8")}:${part}`
  ).join("|");
  const signature = createHmac("sha256", Buffer.from(key, "hex"))
    .update(message, "utf8").digest("hex");
  return [issuedAt, nonce, signature];
}
