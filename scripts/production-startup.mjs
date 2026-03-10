import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { Client } from "pg";

const require = createRequire(import.meta.url);
const REQUIRED_ENV_KEYS = ["DATABASE_URL"];
const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = "0.0.0.0";
const DEFAULT_NODE_ENV = "production";
const DEFAULT_DATABASE_PROBE_TIMEOUT_MS = 5000;

function readRequiredEnvValue(env, key) {
  return env[key]?.trim() ?? "";
}

function loadProductionEnvironment(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => readRequiredEnvValue(env, key) === "");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const portValue = env.PORT?.trim();
  const port = portValue ? Number.parseInt(portValue, 10) : DEFAULT_PORT;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer. Received: ${portValue ?? "undefined"}`);
  }

  const nodeEnvValue = env.NODE_ENV?.trim();
  const nodeEnv =
    nodeEnvValue === "development" || nodeEnvValue === "test"
      ? nodeEnvValue
      : DEFAULT_NODE_ENV;

  return {
    databaseUrl: readRequiredEnvValue(env, "DATABASE_URL"),
    nodeEnv,
    port,
    hostname: env.HOSTNAME?.trim() || DEFAULT_HOSTNAME,
    databaseProbeTimeoutMs: DEFAULT_DATABASE_PROBE_TIMEOUT_MS,
  };
}

async function checkDatabaseReadiness(connectionString, timeoutMs) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });

  await client.connect();

  try {
    await client.query("select 1");
  } finally {
    await client.end();
  }
}

function runNodeCommand(modulePath, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [modulePath, ...args], {
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code ?? "unknown"}`));
    });
  });
}

async function runChecks() {
  const config = loadProductionEnvironment();
  await checkDatabaseReadiness(config.databaseUrl, config.databaseProbeTimeoutMs);
  console.log(
    JSON.stringify({
      success: true,
      hostname: config.hostname,
      nodeEnv: config.nodeEnv,
      port: config.port,
    })
  );
  return config;
}

async function runProductionStart() {
  const config = await runChecks();
  const env = {
    ...process.env,
    NODE_ENV: config.nodeEnv,
    PORT: String(config.port),
    HOSTNAME: config.hostname,
  };

  await runNodeCommand(require.resolve("prisma/build/index.js"), ["migrate", "deploy"], env);
  await runNodeCommand(
    require.resolve("next/dist/bin/next"),
    ["start", "-H", config.hostname, "-p", String(config.port)],
    env
  );
}

async function main() {
  const command = process.argv[2] ?? "check";

  if (command === "check") {
    await runChecks();
    return;
  }

  if (command === "start") {
    await runProductionStart();
    return;
  }

  throw new Error(`Unsupported production-startup command: ${command}`);
}

main().catch((error) => {
  console.error("[production-startup]", error);
  process.exitCode = 1;
});
