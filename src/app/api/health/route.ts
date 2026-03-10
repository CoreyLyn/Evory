import { NextRequest } from "next/server";

import {
  checkDatabaseReadiness,
  loadProductionEnvironment,
  type ProductionEnvironment,
} from "@/lib/production-runtime";
import { getLiveEventCapabilities } from "@/lib/live-events";

type HealthDependencies = {
  loadEnvironment?: () => ProductionEnvironment;
  checkDatabaseReadiness?: typeof checkDatabaseReadiness;
};

export function createHealthGetHandler(dependencies: HealthDependencies = {}) {
  const loadEnvironment =
    dependencies.loadEnvironment ?? (() => loadProductionEnvironment());
  const runDatabaseReadinessCheck =
    dependencies.checkDatabaseReadiness ?? checkDatabaseReadiness;

  return async function GET(request: NextRequest) {
    void request;

    try {
      const environment = loadEnvironment();
      const readiness = await runDatabaseReadinessCheck(environment.databaseUrl);

      if (!readiness.ok) {
        return Response.json(
          {
            success: false,
            error: "Service unavailable",
            data: {
              status: "degraded",
              nodeEnv: environment.nodeEnv,
              checks: {
                liveness: "ok",
                readiness: "error",
              },
              realtime: {
                mode: getLiveEventCapabilities().mode,
                transport: getLiveEventCapabilities().transport,
                reliableDeployment: getLiveEventCapabilities().reliableDeployment,
                recommendedClientMode:
                  getLiveEventCapabilities().recommendedClientMode,
              },
              reason: readiness.error,
            },
          },
          { status: 503 }
        );
      }

      return Response.json({
        success: true,
        data: {
          status: "ok",
          nodeEnv: environment.nodeEnv,
          checks: {
            liveness: "ok",
            readiness: "ok",
          },
          realtime: {
            mode: getLiveEventCapabilities().mode,
            transport: getLiveEventCapabilities().transport,
            reliableDeployment: getLiveEventCapabilities().reliableDeployment,
            recommendedClientMode:
              getLiveEventCapabilities().recommendedClientMode,
          },
        },
      });
    } catch (error) {
      return Response.json(
        {
          success: false,
          error: "Service unavailable",
          data: {
            status: "degraded",
            nodeEnv: "unknown",
            checks: {
              liveness: "ok",
              readiness: "error",
            },
            realtime: {
              mode: getLiveEventCapabilities().mode,
              transport: getLiveEventCapabilities().transport,
              reliableDeployment: getLiveEventCapabilities().reliableDeployment,
              recommendedClientMode:
                getLiveEventCapabilities().recommendedClientMode,
            },
            reason:
              error instanceof Error ? error.message : "Unknown startup error",
          },
        },
        { status: 503 }
      );
    }
  };
}

export const GET = createHealthGetHandler();
