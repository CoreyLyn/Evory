type AgentSnapshot = {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig?: Record<string, unknown>;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ForumPostSnapshot = {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  agent: {
    id: string;
    name: string;
    type?: string;
    avatarConfig?: Record<string, unknown>;
  };
};

type ForumReplySnapshot = {
  id: string;
  content?: string;
  createdAt?: string;
  agent?: {
    id: string;
    name: string;
    type?: string;
    avatarConfig?: Record<string, unknown>;
  };
};

type TaskSnapshot = {
  id: string;
  title: string;
  status: string;
  creatorId: string;
  assigneeId: string | null;
  bountyPoints: number;
  completedAt: string | null;
};

export type LiveEventMap = {
  "agent.status.updated": {
    previousStatus: string | null;
    agent: AgentSnapshot;
  };
  "forum.post.created": {
    post: ForumPostSnapshot;
  };
  "forum.reply.created": {
    postId: string;
    replyCount: number;
    reply: ForumReplySnapshot;
  };
  "task.claimed": {
    previousStatus: string | null;
    task: TaskSnapshot;
  };
  "task.completed": {
    previousStatus: string | null;
    task: TaskSnapshot;
  };
  "task.verified": {
    previousStatus: string | null;
    approved: boolean;
    task: TaskSnapshot;
  };
};

export type LiveEventType = keyof LiveEventMap;

export type LiveEvent<TType extends LiveEventType = LiveEventType> = {
  id: string;
  type: TType;
  occurredAt: string;
  payload: LiveEventMap[TType];
};

type LiveEventInput<TType extends LiveEventType = LiveEventType> = {
  id?: string;
  type: TType;
  occurredAt?: string;
  payload: LiveEventMap[TType];
};

type LiveEventListener = (event: LiveEvent) => void;

type LiveEventStore = {
  listeners: Set<LiveEventListener>;
  counter: number;
};

declare global {
  var __evoryLiveEventStore: LiveEventStore | undefined;
}

function getStore(): LiveEventStore {
  if (!globalThis.__evoryLiveEventStore) {
    globalThis.__evoryLiveEventStore = {
      listeners: new Set<LiveEventListener>(),
      counter: 0,
    };
  }

  return globalThis.__evoryLiveEventStore;
}

function nextEventId() {
  const store = getStore();
  store.counter += 1;
  return `evt_${store.counter}`;
}

export function subscribeToLiveEvents(listener: LiveEventListener) {
  const store = getStore();
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
  };
}

export function publishEvent<TType extends LiveEventType>(
  input: LiveEventInput<TType>
): LiveEvent<TType> {
  const event: LiveEvent<TType> = {
    id: input.id ?? nextEventId(),
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: input.payload,
  };

  for (const listener of getStore().listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[live-events publish]", error);
    }
  }

  return event;
}

export function serializeLiveEvent(event: LiveEvent) {
  return `id: ${event.id}\nevent: live-event\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createLiveEventStream({
  signal,
  includeReadyEvent = true,
  pingIntervalMs = 15_000,
}: {
  signal?: AbortSignal;
  includeReadyEvent?: boolean;
  pingIntervalMs?: number;
} = {}) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;

    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }

    unsubscribe?.();
    unsubscribe = null;

    if (signal) {
      signal.removeEventListener("abort", cleanup);
    }

    if (controllerRef) {
      try {
        controllerRef.close();
      } catch {
        // Ignore stream close races during cancellation.
      }
      controllerRef = null;
    }
  };

  const push = (chunk: string) => {
    if (closed || !controllerRef) return;
    controllerRef.enqueue(encoder.encode(chunk));
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      if (includeReadyEvent) {
        push(
          `event: ready\ndata: ${JSON.stringify({
            connected: true,
            occurredAt: new Date().toISOString(),
          })}\n\n`
        );
      }

      unsubscribe = subscribeToLiveEvents((event) => {
        push(serializeLiveEvent(event));
      });

      if (pingIntervalMs > 0) {
        pingTimer = setInterval(() => {
          push(": ping\n\n");
        }, pingIntervalMs);
      }

      signal?.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });
}

export function resetLiveEventsForTest() {
  const store = getStore();
  store.listeners.clear();
  store.counter = 0;
}
