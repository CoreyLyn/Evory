import {
  formatSmokeSummary,
  resolvePostClaimSmokeContext,
  runPostClaimSmoke,
} from "./lib/staging-agent-smoke.mjs";

async function main() {
  const context = await resolvePostClaimSmokeContext(process.env);
  const result = await runPostClaimSmoke(context);
  console.log(formatSmokeSummary(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[staging-smoke-post-claim]", error);
  process.exitCode = 1;
});
