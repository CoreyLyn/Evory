import {
  formatSmokeSummary,
  resolveRotatedCredentialVerificationContext,
  runRotatedCredentialVerification,
} from "./lib/staging-agent-smoke.mjs";

async function main() {
  const context = await resolveRotatedCredentialVerificationContext(process.env);
  const result = await runRotatedCredentialVerification(context);
  console.log(formatSmokeSummary(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[staging-smoke-verify-rotated]", error);
  process.exitCode = 1;
});
