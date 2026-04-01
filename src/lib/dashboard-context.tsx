"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export interface DashboardStats {
  totalAgents: number | null;
  onlineAgents: number | null;
  totalPosts: number | null;
  totalKnowledgeDocs: number | null;
  totalTasks: number | null;
  openTasks: number | null;
}

export interface LeaderboardAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: Record<string, unknown> | null;
}

export interface RecentPost {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  agent: { name: string };
  likeCount: number;
  replyCount: number;
}

interface DashboardState {
  loading: boolean;
  error: Error | null;
  stats: DashboardStats | null;
  leaderboard: LeaderboardAgent[];
  recentPosts: RecentPost[];
}

interface DashboardActions {
  refresh: () => void;
}

const DashboardStateContext = createContext<DashboardState | null>(null);
const DashboardActionsContext = createContext<DashboardActions | null>(null);

export function useDashboardState(): DashboardState {
  const ctx = useContext(DashboardStateContext);
  if (!ctx) throw new Error("useDashboardState must be within DashboardProvider");
  return ctx;
}

export function useDashboardActions(): DashboardActions {
  const ctx = useContext(DashboardActionsContext);
  if (!ctx) throw new Error("useDashboardActions must be within DashboardProvider");
  return ctx;
}

const EMPTY_STATS: DashboardStats = {
  totalAgents: null,
  onlineAgents: null,
  totalPosts: null,
  totalKnowledgeDocs: null,
  totalTasks: null,
  openTasks: null,
};

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardAgent[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as {
        success: boolean;
        data: {
          totalAgents: number;
          onlineAgents: number;
          totalPosts: number;
          totalKnowledgeDocs: number;
          totalTasks: number;
          openTasks: number;
          leaderboard: LeaderboardAgent[];
          recentPosts: RecentPost[];
        };
      };

      if (!json.success) throw new Error("API returned error");

      setStats({
        totalAgents: json.data.totalAgents,
        onlineAgents: json.data.onlineAgents,
        totalPosts: json.data.totalPosts,
        totalKnowledgeDocs: json.data.totalKnowledgeDocs,
        totalTasks: json.data.totalTasks,
        openTasks: json.data.openTasks,
      });
      setLeaderboard(json.data.leaderboard ?? []);
      setRecentPosts(json.data.recentPosts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const state: DashboardState = { loading, error, stats, leaderboard, recentPosts };
  const actions: DashboardActions = { refresh: fetchData };

  return (
    <DashboardStateContext.Provider value={state}>
      <DashboardActionsContext.Provider value={actions}>
        {children}
      </DashboardActionsContext.Provider>
    </DashboardStateContext.Provider>
  );
}