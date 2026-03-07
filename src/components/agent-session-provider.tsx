"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createAgentFetch } from "@/lib/agent-client";
import {
  clearAgentSession,
  loadAgentSession,
  saveAgentSession,
  subscribeAgentSession,
  type AgentSession,
} from "@/lib/agent-session";
import {
  connectAgentSession,
  registerAgentSession,
} from "@/lib/agent-session-api";

type RegisterAgentInput = {
  name: string;
  type: string;
};

type AgentSessionContextValue = {
  session: AgentSession | null;
  isHydrated: boolean;
  isBusy: boolean;
  registerAgent: (input: RegisterAgentInput) => Promise<AgentSession>;
  connectAgent: (apiKey: string) => Promise<AgentSession>;
  refreshAgent: () => Promise<AgentSession | null>;
  disconnectAgent: () => void;
  agentFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

function getSessionSnapshot() {
  return loadAgentSession();
}

export function AgentSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useSyncExternalStore(
    subscribeAgentSession,
    getSessionSnapshot,
    () => null
  );
  const sessionRef = useRef<AgentSession | null>(session);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const syncAgent = useCallback(
    async ({
      apiKey,
      silent = false,
      clearOnError = false,
    }: {
      apiKey: string;
      silent?: boolean;
      clearOnError?: boolean;
    }) => {
      if (!silent) setIsBusy(true);

      try {
        const nextSession = await connectAgentSession({ apiKey });
        saveAgentSession(nextSession);
        return nextSession;
      } catch (error) {
        if (clearOnError) {
          clearAgentSession();
        }
        throw error;
      } finally {
        if (!silent) setIsBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    setIsHydrated(true);

    const current = loadAgentSession();
    if (current?.apiKey) {
      void syncAgent({
        apiKey: current.apiKey,
        silent: true,
        clearOnError: true,
      }).catch(() => {});
    }
  }, [syncAgent]);

  const registerAgent = useCallback(async ({ name, type }: RegisterAgentInput) => {
    setIsBusy(true);

    try {
      const nextSession = await registerAgentSession({ name, type });
      saveAgentSession(nextSession);
      return nextSession;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const connectAgent = useCallback(
    async (apiKey: string) =>
      syncAgent({
        apiKey,
      }),
    [syncAgent]
  );

  const refreshAgent = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.apiKey) return null;

    return syncAgent({
      apiKey: current.apiKey,
    });
  }, [syncAgent]);

  const disconnectAgent = useCallback(() => {
    clearAgentSession();
  }, []);

  const agentFetch = useMemo(
    () =>
      createAgentFetch({
        fetcher: (...args) => fetch(...args),
        getSession: () => sessionRef.current,
      }),
    []
  );

  const value = useMemo<AgentSessionContextValue>(
    () => ({
      session,
      isHydrated,
      isBusy,
      registerAgent,
      connectAgent,
      refreshAgent,
      disconnectAgent,
      agentFetch,
    }),
    [
      agentFetch,
      connectAgent,
      disconnectAgent,
      isBusy,
      isHydrated,
      refreshAgent,
      registerAgent,
      session,
    ]
  );

  return (
    <AgentSessionContext.Provider value={value}>
      {children}
    </AgentSessionContext.Provider>
  );
}

export function useAgentSession() {
  const context = useContext(AgentSessionContext);

  if (!context) {
    throw new Error("useAgentSession must be used within AgentSessionProvider");
  }

  return context;
}
