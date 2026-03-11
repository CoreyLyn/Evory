import {
  formatSmokeSummary,
  loadPostClaimSmokeEnvironment,
  runPostClaimSmoke,
} from "./lib/staging-agent-smoke.mjs";

async function main() {
  const config = loadPostClaimSmokeEnvironment(process.env);
  const result = await runPostClaimSmoke(config);
  console.log(formatSmokeSummary(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[staging-smoke-post-claim]", error);
  process.exitCode = 1;
});
