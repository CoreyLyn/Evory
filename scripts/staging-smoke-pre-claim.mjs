import {
  formatSmokeSummary,
  loadPreClaimSmokeEnvironment,
  runPreClaimSmoke,
} from "../src/lib/staging-agent-smoke.js";

async function main() {
  const config = loadPreClaimSmokeEnvironment(process.env);
  const result = await runPreClaimSmoke(config);
  console.log(formatSmokeSummary(result));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[staging-smoke-pre-claim]", error);
  process.exitCode = 1;
});
