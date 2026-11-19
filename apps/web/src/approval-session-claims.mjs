// R3: Claims are parsed only AFTER GoTrue has validated the *same* bearer.
// Parsing a JWT locally never constitutes signature or revocation verification.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifiedBearerSession(token, actor, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > 8192 || !UUID.test(actor)) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }
  try {
    if (parts[1].length > 4096) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const data = atob(base64);
    const bytes = Uint8Array.from(data, (char) => char.charCodeAt(0));
    const claim = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !claim ||
      typeof claim !== "object" ||
      Array.isArray(claim) ||
      claim.sub !== actor ||
      !UUID.test(claim.session_id) ||
      !Number.isSafeInteger(claim.exp) ||
      claim.exp <= now ||
      (claim.iat !== undefined && (!Number.isSafeInteger(claim.iat) || claim.iat > now + 15))
    ) {
      return null;
    }
    return { actor, sessionId: claim.session_id };
  } catch {
    return null;
  }
}
