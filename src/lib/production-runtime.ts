import { Client } from "pg";

export const REQUIRED_PRODUCTION_ENV_VARS = ["DATABASE_URL"] as const;

export type ProductionEnvironment = {
  databaseUrl: string;
  nodeEnv: "production" | "development" | "test";
  port: number;
  hostname: string;
};

const DEFAULT_DATABASE_PROBE_TIMEOUT_MS = 5000;

export class ProductionStartupError extends Error {
  code: "INVALID_ENV" | "MISSING_ENV" | "DATABASE_UNAVAILABLE";

  constructor(
    code: ProductionStartupError["code"],
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ProductionStartupError";
    this.code = code;
  }
}

function readRequiredEnvValue(
  env: Partial<Record<string, string | undefined>>,
  key: (typeof REQUIRED_PRODUCTION_ENV_VARS)[number]
) {
  return env[key]?.trim() ?? "";
}

export function loadProductionEnvironment(
  env: Partial<Record<string, string | undefined>> = process.env
): ProductionEnvironment {
  const missing = REQUIRED_PRODUCTION_ENV_VARS.filter(
    (key) => readRequiredEnvValue(env, key) === ""
  );

  if (missing.length > 0) {
    throw new ProductionStartupError(
      "MISSING_ENV",
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  const portValue = env.PORT?.trim();
  const port = portValue ? Number.parseInt(portValue, 10) : 3000;

  if (!Number.isInteger(port) || port <= 0) {
    throw new ProductionStartupError(
      "INVALID_ENV",
      `PORT must be a positive integer. Received: ${portValue ?? "undefined"}`
    );
  }

  const nodeEnvValue = env.NODE_ENV?.trim();
  const nodeEnv =
    nodeEnvValue === "development" || nodeEnvValue === "test"
      ? nodeEnvValue
      : "production";

  return {
    databaseUrl: readRequiredEnvValue(env, "DATABASE_URL"),
    nodeEnv,
    port,
    hostname: env.HOSTNAME?.trim() || "0.0.0.0",
  };
}

async function defaultDatabaseProbe(connectionString: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: DEFAULT_DATABASE_PROBE_TIMEOUT_MS,
    query_timeout: DEFAULT_DATABASE_PROBE_TIMEOUT_MS,
  });
  await client.connect();

  try {
    await client.query("select 1");
  } finally {
    await client.end();
  }
}

export async function checkDatabaseReadiness(
  connectionString: string,
  options: {
    probe?: (connectionString: string) => Promise<void>;
  } = {}
) {
  try {
    await (options.probe ?? defaultDatabaseProbe)(connectionString);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export async function assertDatabaseReadiness(
  connectionString: string,
  options: {
    probe?: (connectionString: string) => Promise<void>;
  } = {}
) {
  const result = await checkDatabaseReadiness(connectionString, options);

  if (!result.ok) {
    throw new ProductionStartupError(
      "DATABASE_UNAVAILABLE",
      result.error,
      { cause: result.error }
    );
  }
}

export async function runProductionStartupChecks(
  env: Partial<Record<string, string | undefined>> = process.env,
  options: {
    probe?: (connectionString: string) => Promise<void>;
  } = {}
) {
  const config = loadProductionEnvironment(env);
  await assertDatabaseReadiness(config.databaseUrl, options);
  return config;
}
