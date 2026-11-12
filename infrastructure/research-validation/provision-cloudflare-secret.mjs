// One-shot encrypted GitHub Actions secret transfer; no credential output.
const account = "0257b4518015b64bd28bca05b803de27";
const worker = "autolearnpro-api-staging";
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
const semanticKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
if (!cloudflareToken || !semanticKey) {
  console.error("PROVISIONING_BLOCKED=missing_github_actions_secret");
  process.exit(2);
}
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,
  {
    method: "PUT",
    headers: {
      authorization: `Bearer ${cloudflareToken}`,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({ name: "SEMANTIC_SCHOLAR_API_KEY", type: "secret_text", text: semanticKey }),
    signal: AbortSignal.timeout(20000)
  }
);
if (!response.ok) {
  // Do not log response bodies: they may contain credentials or echo provider inputs.
  console.error(`PROVISIONING_FAILED=HTTP_${response.status}`);
  process.exit(1);
}
const json = await response.json();
if (json.success !== true) {
  console.error("PROVISIONING_FAILED=provider_rejected");
  process.exit(1);
}
console.log("PROVISIONING_SUCCESS=SEMANTIC_SCHOLAR_API_KEY");
