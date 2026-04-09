# User Provided API Key Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free account-level request flow for administrator-provided API keys in the Agents settings page and simplify API quota order fulfillment into a manual admin completion action.

**Architecture:** Keep `ProvidedApiKey` as the reusable admin-managed credential pool, but add a dedicated `UserProvidedApiKeyApplication` model for account-level requests so this flow stays separate from Agent quota orders. Extend the existing admin shop surface with a second management section for these applications, and update quota-order fulfillment so it records completion timestamps without requiring `providedApiKeyId`.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma, PostgreSQL, node:test, existing `withErrorHandler`/auth/request-security helpers, existing `shop-client` browser helpers.

---

### Task 1: Add the user API key application schema and fixtures

**Files:**
- Create: `prisma/migrations/20260409_user_provided_api_key_application/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/test/factories.ts`
- Test: `src/app/api/users/me/provided-api-key/route.test.ts`
- Test: `src/app/api/admin/shop/api-key-applications/route.test.ts`

- [ ] **Step 1: Write the failing route tests first**

Create route tests that expect the new model shape before touching the schema.

```ts
assert.deepEqual(json.data, {
  status: "NONE",
  application: null,
  providedApiKey: null,
});
```

```ts
assert.deepEqual(json.data[0], {
  id: "application-1",
  status: "PENDING",
  requestedAt: "2026-04-09T00:00:00.000Z",
  fulfilledAt: null,
  user: {
    id: "user-1",
    email: "owner@example.com",
    name: "Owner",
  },
  providedApiKey: null,
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/app/api/users/me/provided-api-key/route.test.ts src/app/api/admin/shop/api-key-applications/route.test.ts`

Expected: FAIL because the routes and Prisma model do not exist yet.

- [ ] **Step 3: Update the Prisma schema**

Add the enum, model, and relations needed for account-level applications.

```prisma
enum UserProvidedApiKeyApplicationStatus {
  PENDING
  FULFILLED
  FAILED
}

model UserProvidedApiKeyApplication {
  id                String                               @id @default(cuid())
  userId            String
  providedApiKeyId  String?
  status            UserProvidedApiKeyApplicationStatus @default(PENDING)
  requestedAt       DateTime                             @default(now())
  fulfilledAt       DateTime?
  completedByUserId String?
  failureReason     String?
  createdAt         DateTime                             @default(now())
  updatedAt         DateTime                             @updatedAt

  user           User           @relation("UserProvidedApiKeyApplications", fields: [userId], references: [id], onDelete: Cascade)
  providedApiKey ProvidedApiKey? @relation(fields: [providedApiKeyId], references: [id], onDelete: Restrict)
  completedBy    User?          @relation("UserProvidedApiKeyApplicationCompletedBy", fields: [completedByUserId], references: [id], onDelete: Restrict)

  @@index([userId, status])
  @@index([providedApiKeyId])
  @@index([completedByUserId])
}
```

- [ ] **Step 4: Write the migration and fixture helpers**

Migration core:

```sql
CREATE TYPE "UserProvidedApiKeyApplicationStatus" AS ENUM ('PENDING', 'FULFILLED', 'FAILED');

CREATE TABLE "UserProvidedApiKeyApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providedApiKeyId" TEXT,
  "status" "UserProvidedApiKeyApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fulfilledAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProvidedApiKeyApplication_pkey" PRIMARY KEY ("id")
);
```

Fixture core:

```ts
export function createUserProvidedApiKeyApplicationFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "application-1",
    userId: "user-1",
    providedApiKeyId: null,
    status: "PENDING",
    requestedAt: "2026-04-09T00:00:00.000Z",
    fulfilledAt: null,
    completedByUserId: null,
    failureReason: null,
    createdAt: "2026-04-09T00:00:00.000Z",
    updatedAt: "2026-04-09T00:00:00.000Z",
    ...overrides,
  };
}
```

- [ ] **Step 5: Re-run the tests**

Run: `npm test -- src/app/api/users/me/provided-api-key/route.test.ts src/app/api/admin/shop/api-key-applications/route.test.ts`

Expected: FAIL later inside route imports or handler logic instead of missing schema assumptions.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260409_user_provided_api_key_application/migration.sql src/test/factories.ts src/app/api/users/me/provided-api-key/route.test.ts src/app/api/admin/shop/api-key-applications/route.test.ts
git commit -m "feat: add user provided api key application schema"
```

### Task 2: Add the user-facing application summary and create endpoints

**Files:**
- Create: `src/app/api/users/me/provided-api-key/route.ts`
- Create: `src/app/api/users/me/provided-api-key/applications/route.ts`
- Create: `src/app/api/users/me/provided-api-key/applications/route.test.ts`
- Modify: `src/app/api/users/me/provided-api-key/route.test.ts`
- Modify: `src/lib/shop-client.ts`

- [ ] **Step 1: Write the failing POST route test**

Cover successful creation and duplicate rejection.

```ts
assert.equal(response.status, 200);
assert.equal(json.success, true);
assert.equal(json.data.status, "PENDING");
assert.equal(createArgs.data.userId, "user-1");
```

```ts
assert.equal(response.status, 409);
assert.equal(json.error, "You already have an active API key request");
```

- [ ] **Step 2: Run the user route tests**

Run: `npm test -- src/app/api/users/me/provided-api-key/route.test.ts src/app/api/users/me/provided-api-key/applications/route.test.ts`

Expected: FAIL because the POST route does not exist and the GET route is not implemented.

- [ ] **Step 3: Implement the GET summary route**

Follow the existing authenticated user route style from `src/app/api/users/me/route.ts`.

```ts
export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await authenticateUser(request);
  if (!user) {
    throw new AppError(401, "unauthorized", "Unauthorized");
  }

  const application = await prisma.userProvidedApiKeyApplication.findFirst({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      requestedAt: true,
      fulfilledAt: true,
      providedApiKey: {
        select: {
          id: true,
          label: true,
          providerLabel: true,
          maskedKey: true,
        },
      },
    },
  });

  return Response.json({
    success: true,
    data: application
      ? {
          status: application.status,
          application: {
            id: application.id,
            requestedAt: application.requestedAt,
            fulfilledAt: application.fulfilledAt,
          },
          providedApiKey: application.providedApiKey,
        }
      : {
          status: "NONE",
          application: null,
          providedApiKey: null,
        },
  });
});
```

- [ ] **Step 4: Implement the POST application route**

Require same-origin CSRF protection and reject duplicates transactionally.

```ts
const existing = await prisma.userProvidedApiKeyApplication.findFirst({
  where: {
    userId: user.id,
    status: { in: ["PENDING", "FULFILLED"] },
  },
  select: { id: true },
});

if (existing) {
  throw new AppError(409, "conflict", "You already have an active API key request");
}

const application = await prisma.userProvidedApiKeyApplication.create({
  data: {
    userId: user.id,
    status: "PENDING",
  },
  select: {
    id: true,
    status: true,
    requestedAt: true,
  },
});

return Response.json({
  success: true,
  data: {
    status: "PENDING",
    application: {
      id: application.id,
      requestedAt: application.requestedAt,
      fulfilledAt: null,
    },
    providedApiKey: null,
  },
});
```

- [ ] **Step 5: Add browser helpers in `shop-client`**

Add typed helpers for the Agents page.

```ts
export type UserProvidedApiKeySummary = {
  status: "NONE" | "PENDING" | "FULFILLED" | "FAILED";
  application: {
    id: string;
    requestedAt: string;
    fulfilledAt: string | null;
  } | null;
  providedApiKey: {
    id: string;
    label: string;
    providerLabel: string;
    maskedKey: string;
  } | null;
};

export async function fetchUserProvidedApiKeySummary(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/users/me/provided-api-key");
  return readEnvelope<UserProvidedApiKeySummary>(response);
}

export async function requestUserProvidedApiKey(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/users/me/provided-api-key/applications", {
    method: "POST",
  });
  return readEnvelope<UserProvidedApiKeySummary>(response);
}
```

- [ ] **Step 6: Re-run the user route tests**

Run: `npm test -- src/app/api/users/me/provided-api-key/route.test.ts src/app/api/users/me/provided-api-key/applications/route.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/api/users/me/provided-api-key/route.ts src/app/api/users/me/provided-api-key/applications/route.ts src/app/api/users/me/provided-api-key/route.test.ts src/app/api/users/me/provided-api-key/applications/route.test.ts src/lib/shop-client.ts
git commit -m "feat: add user provided api key request endpoints"
```

### Task 3: Add admin application management endpoints and simplify quota order fulfillment

**Files:**
- Create: `src/app/api/admin/shop/api-key-applications/route.ts`
- Create: `src/app/api/admin/shop/api-key-applications/route.test.ts`
- Create: `src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.ts`
- Create: `src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts`
- Modify: `src/app/api/admin/shop/orders/[id]/fulfill/route.ts`
- Modify: `src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`
- Modify: `src/lib/shop-client.ts`

- [ ] **Step 1: Update the failing admin tests first**

Cover the new application list and fulfillment flow, then update the quota-order fulfillment test to stop sending `providedApiKeyId`.

```ts
assert.deepEqual(json.data[0].user, {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
});
assert.equal(json.data[0].status, "PENDING");
```

```ts
assert.equal(response.status, 200);
assert.equal(json.data.providedApiKey.id, "key-1");
assert.equal(updateArgs.data.completedByUserId, "admin-1");
assert.equal(updateArgs.data.status, "FULFILLED");
```

```ts
assert.equal(response.status, 200);
assert.equal(updateArgs.data.providedApiKeyId, undefined);
assert.equal(updateArgs.data.status, "FULFILLED");
```

- [ ] **Step 2: Run the admin tests**

Run: `npm test -- src/app/api/admin/shop/api-key-applications/route.test.ts src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`

Expected: FAIL because the new routes do not exist and the current order-fulfillment route requires `providedApiKeyId`.

- [ ] **Step 3: Implement the admin list route**

Follow the existing `authenticateAdmin` + `notForAgentsResponse` pattern.

```ts
const applications = await prisma.userProvidedApiKeyApplication.findMany({
  orderBy: [{ requestedAt: "desc" }],
  select: {
    id: true,
    status: true,
    requestedAt: true,
    fulfilledAt: true,
    user: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
    providedApiKey: {
      select: {
        id: true,
        label: true,
        providerLabel: true,
        maskedKey: true,
      },
    },
  },
});
```

- [ ] **Step 4: Implement admin application fulfillment**

Validate pending application plus active provided key, then mark the application fulfilled.

```ts
const now = new Date();
const updated = await prisma.userProvidedApiKeyApplication.update({
  where: { id },
  data: {
    status: "FULFILLED",
    providedApiKeyId: payload.providedApiKeyId,
    completedByUserId: auth.user.id,
    fulfilledAt: now,
    failureReason: null,
  },
  select: {
    id: true,
    status: true,
    requestedAt: true,
    fulfilledAt: true,
    providedApiKey: {
      select: {
        id: true,
        label: true,
        providerLabel: true,
        maskedKey: true,
      },
    },
  },
});
```

- [ ] **Step 5: Simplify admin quota-order fulfillment**

Remove request-body parsing and complete the order directly.

```ts
const updated = await prisma.purchaseOrder.update({
  where: { id },
  data: {
    status: "FULFILLED",
    confirmedByUserId: auth.user.id,
    confirmedAt: now,
    fulfilledAt: now,
  },
});
```

Also update `fulfillAdminQuotaOrder` in `src/lib/shop-client.ts`:

```ts
export async function fulfillAdminQuotaOrder(fetcher: PublicFetch, orderId: string) {
  const response = await fetcher(`/api/admin/shop/orders/${orderId}/fulfill`, {
    method: "POST",
  });

  return readEnvelope<Record<string, unknown>>(response);
}
```

- [ ] **Step 6: Add admin browser helpers for applications**

```ts
export type AdminUserProvidedApiKeyApplication = {
  id: string;
  status: "PENDING" | "FULFILLED" | "FAILED";
  requestedAt: string;
  fulfilledAt: string | null;
  user: {
    id: string;
    email: string;
    name: string;
  };
  providedApiKey: {
    id: string;
    label: string;
    providerLabel: string;
    maskedKey: string;
  } | null;
};

export async function fetchAdminUserProvidedApiKeyApplications(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/admin/shop/api-key-applications");
  return readEnvelope<AdminUserProvidedApiKeyApplication[]>(response);
}

export async function fulfillAdminUserProvidedApiKeyApplication(
  fetcher: PublicFetch,
  applicationId: string,
  input: { providedApiKeyId: string }
) {
  const response = await fetcher(`/api/admin/shop/api-key-applications/${applicationId}/fulfill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return readEnvelope<AdminUserProvidedApiKeyApplication>(response);
}
```

- [ ] **Step 7: Re-run the admin tests**

Run: `npm test -- src/app/api/admin/shop/api-key-applications/route.test.ts src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/shop/api-key-applications/route.ts src/app/api/admin/shop/api-key-applications/route.test.ts src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.ts src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts src/lib/shop-client.ts
git commit -m "feat: add admin api key application management"
```

### Task 4: Add the account-level API key card to the Agents settings page

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/lib/shop-client.ts`

- [ ] **Step 1: Write the failing page tests first**

Add rendering coverage for `not_requested`, `pending`, and `fulfilled`.

```tsx
const html = renderToStaticMarkup(
  <UserProvidedApiKeyCard
    summary={{
      status: "NONE",
      application: null,
      providedApiKey: null,
    }}
    busy={false}
    onRequest={() => undefined}
  />
);

assert.match(html, /申请管理员提供的 API Key/);
assert.match(html, /申请后由管理员手动分配/);
```

```tsx
assert.match(html, /待处理/);
assert.match(html, /管理员处理中/);
```

```tsx
assert.match(html, /OpenAI Team Key/);
assert.match(html, /••••1234/);
assert.doesNotMatch(html, /sk-live-/);
```

- [ ] **Step 2: Run the page tests**

Run: `npm test -- src/app/settings/agents/page.test.tsx`

Expected: FAIL because the new card component and state do not exist yet.

- [ ] **Step 3: Add the typed summary state and loader**

Extend `loadData()` so it fetches the account-level summary alongside `/api/auth/me` and `/api/users/me/agents`.

```ts
const [userProvidedApiKeySummary, setUserProvidedApiKeySummary] =
  useState<UserProvidedApiKeySummary | null>(null);
const [requestingUserProvidedApiKey, setRequestingUserProvidedApiKey] = useState(false);

const [summaryResponse, agentsResponse] = await Promise.all([
  fetch("/api/users/me/provided-api-key"),
  fetch("/api/users/me/agents"),
]);
```

- [ ] **Step 4: Add the account-level card component**

Render this above the claim form so the page distinguishes user-account API keys from Agent claim keys.

```tsx
export function UserProvidedApiKeyCard({
  summary,
  busy,
  onRequest,
}: {
  summary: UserProvidedApiKeySummary | null;
  busy: boolean;
  onRequest: () => void | Promise<void>;
}) {
  const status = summary?.status ?? "NONE";

  return (
    <Card className="border-card-border/60 bg-card/75">
      <h2 className="font-display text-2xl font-semibold text-foreground">
        我的 API Key
      </h2>
      {status === "NONE" ? (
        <Button onClick={() => void onRequest()} disabled={busy}>
          {busy ? "申请中..." : "申请管理员提供的 API Key"}
        </Button>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 5: Implement the request action**

```ts
async function handleRequestUserProvidedApiKey() {
  setRequestingUserProvidedApiKey(true);
  setError(null);

  try {
    await requestUserProvidedApiKey();
    await loadData();
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : "申请 API Key 失败");
  } finally {
    setRequestingUserProvidedApiKey(false);
  }
}
```

- [ ] **Step 6: Re-run the page tests**

Run: `npm test -- src/app/settings/agents/page.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/lib/shop-client.ts
git commit -m "feat: add user api key request card to settings"
```

### Task 5: Split admin UI into application management and manual quota completion

**Files:**
- Modify: `src/app/admin/admin-secret-products-panel.tsx`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/lib/shop-client.ts`

- [ ] **Step 1: Write the failing admin panel tests first**

Cover the new application section and the simpler quota completion action.

```tsx
assert.match(html, /用户 API Key 申请/);
assert.match(html, /owner@example.com/);
assert.match(html, /完成分配/);
```

```tsx
assert.match(html, /API 额度订单/);
assert.match(html, /手动处理完成后再点完成订单/);
assert.doesNotMatch(html, /选择 API Key 后完成订单/);
```

- [ ] **Step 2: Run the admin panel test**

Run: `npm test -- src/app/admin/admin-secret-products-panel.test.tsx`

Expected: FAIL because the panel still binds provided API keys to quota orders and has no user-application section.

- [ ] **Step 3: Add application loading and mutation state**

Load application rows next to `secretProducts`, `providedApiKeys`, and order rows.

```ts
const [applications, setApplications] = useState<AdminUserProvidedApiKeyApplication[]>([]);
const [selectedApplicationKeys, setSelectedApplicationKeys] = useState<Record<string, string>>({});

const [products, keys, orders, nextApplications] = await Promise.all([
  fetchAdminSecretProducts(),
  fetchAdminProvidedApiKeys(),
  fetchAdminSecretProductOrders(),
  fetchAdminUserProvidedApiKeyApplications(),
]);
```

- [ ] **Step 4: Render the new user-application section**

```tsx
<section className="space-y-4">
  <div>
    <h3 className="font-display text-xl font-semibold text-foreground">
      用户 API Key 申请
    </h3>
    <p className="text-sm text-muted">
      用户免费申请自己的账号 API Key，由管理员选择一个 provided API key 手动完成分配。
    </p>
  </div>
</section>
```

Pending rows should call `fulfillAdminUserProvidedApiKeyApplication(fetch, application.id, { providedApiKeyId })`.

- [ ] **Step 5: Remove provided-key selection from quota-order completion**

Replace the old order completion control with a simple button:

```tsx
<Button
  type="button"
  onClick={() => void handleFulfillOrder(order.id)}
  disabled={busyOrderId === order.id || order.status !== "PENDING"}
>
  {busyOrderId === order.id ? "完成中..." : "完成订单"}
</Button>
```

And update the helper:

```ts
async function handleFulfillOrder(orderId: string) {
  await fulfillAdminQuotaOrder(fetch, orderId);
  await reloadData();
}
```

- [ ] **Step 6: Re-run the admin panel test**

Run: `npm test -- src/app/admin/admin-secret-products-panel.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/admin-secret-products-panel.tsx src/app/admin/admin-secret-products-panel.test.tsx src/app/admin/page.tsx src/lib/shop-client.ts
git commit -m "feat: split api key applications from quota order completion"
```

### Task 6: Run end-to-end verification for the full flow

**Files:**
- Modify: `src/app/api/users/me/provided-api-key/route.test.ts`
- Modify: `src/app/api/users/me/provided-api-key/applications/route.test.ts`
- Modify: `src/app/api/admin/shop/api-key-applications/route.test.ts`
- Modify: `src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts`
- Modify: `src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`

- [ ] **Step 1: Run the focused route and component suite**

Run:

```bash
npm test -- src/app/api/users/me/provided-api-key/route.test.ts src/app/api/users/me/provided-api-key/applications/route.test.ts src/app/api/admin/shop/api-key-applications/route.test.ts src/app/api/admin/shop/api-key-applications/[id]/fulfill/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts src/app/settings/agents/page.test.tsx src/app/admin/admin-secret-products-panel.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the broader affected shop suite**

Run:

```bash
npm test -- src/lib/shop-client.test.ts src/app/api/admin/shop/orders/route.test.ts src/app/api/agent/shop/orders/route.test.ts src/app/api/admin/shop/api-keys/route.test.ts
```

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS with Next.js production build completing and TypeScript clean.

- [ ] **Step 4: Commit the final integrated changes**

```bash
git add src/app/api/users/me/provided-api-key src/app/api/admin/shop/api-key-applications src/app/api/admin/shop/orders/[id]/fulfill/route.ts src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/app/admin/admin-secret-products-panel.tsx src/app/admin/admin-secret-products-panel.test.tsx src/lib/shop-client.ts prisma/schema.prisma prisma/migrations/20260409_user_provided_api_key_application/migration.sql src/test/factories.ts
git commit -m "feat: add user provided api key request workflow"
```
