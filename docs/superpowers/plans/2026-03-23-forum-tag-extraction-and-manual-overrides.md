# Forum Tag Extraction and Manual Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做论坛标签抽取规则以修复中文漏标与英文子串误标，并把管理员 textarea 保存语义从“全量覆盖最终标签”改成“生成可持续的增删锁覆盖规则 + 重建最终标签”。

**Architecture:** 保持现有读接口仍消费 `ForumPostTag` 这一层“最终物化标签”，避免改动列表/详情/API payload。新增 `ForumPostTagOverride` 作为人工意图层，保存 `ADD | REMOVE | LOCK`；每次发帖、管理员保存、脚本回填时统一走“自动抽取 -> 应用 overrides -> 重建 final tags”的管线。抽取层改为“英文 token 边界匹配 + 中文短语 alias 匹配 + Unicode-safe freeform normalization”。

**Tech Stack:** Next.js App Router · Prisma · TypeScript · React · Node.js native test runner

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | 新增 `ForumPostTagOverrideAction` 枚举和 `ForumPostTagOverride` 模型 |
| Create | `prisma/migrations/<timestamp>_add_forum_post_tag_overrides/migration.sql` | 数据库迁移 |
| Modify | `src/lib/forum-tags.ts` | 重做标签抽取、Unicode freeform 规范化、最终标签重建入口 |
| Create | `src/lib/forum-tag-overrides.ts` | override diff / apply / materialize 逻辑 |
| Create | `src/lib/forum-tag-overrides.test.ts` | override 规则与最终物化逻辑测试 |
| Modify | `src/lib/forum-tags.test.ts` | 中文命中、边界匹配、误标回归、Unicode freeform 测试 |
| Modify | `src/test/factories.ts` | 新增 override fixture，便于 route / script 测试复用 |
| Modify | `src/app/api/admin/forum/posts/[id]/tags/route.ts` | textarea 保存改为生成 overrides 并重建 final tags |
| Modify | `src/app/api/admin/forum/posts/admin-posts.test.ts` | admin 保存标签行为测试改为验证 override 语义 |
| Modify | `src/app/api/forum/posts/route.ts` | 新建帖子后统一走“物化最终标签”管线 |
| Modify | `src/app/api/forum/forum-workflow.test.ts` | 发帖后的标签结果回归测试 |
| Modify | `scripts/forum-post-tags-backfill.mjs` | 回填脚本改为重跑抽取 + 重放 overrides，不再跳过 manual 帖子 |
| Modify | `src/scripts/forum-post-tags-backfill.test.ts` | backfill 保留人工修正语义测试 |

---

### Task 1: 重做标签抽取规则（中文命中 + 英文边界匹配 + Unicode freeform）

**Files:**
- Modify: `src/lib/forum-tags.ts`
- Test: `src/lib/forum-tags.test.ts`

- [ ] **Step 1: 先补失败测试，覆盖中文命中与误标回归**

在 `src/lib/forum-tags.test.ts` 追加这些测试：

```typescript
test("extractForumTagCandidates matches Chinese API + bugfix phrases", () => {
  const result = extractForumTagCandidates({
    title: "修复接口超时问题",
    content: "这个报错出现在 API 网关层。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.core.some((tag) => tag.slug === "bugfix"));
});

test("extractForumTagCandidates matches Chinese database + performance phrases", () => {
  const result = extractForumTagCandidates({
    title: "优化数据库查询性能",
    content: "当前 SQL 查询太慢。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "database"));
  assert.ok(result.core.some((tag) => tag.slug === "performance"));
});

test("extractForumTagCandidates does not infer bugfix from prefix", () => {
  const result = extractForumTagCandidates({
    title: "Prefix rule guidance",
    content: "Document prefix behavior for commands.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "bugfix"));
});

test("extractForumTagCandidates does not infer frontend from reactive", () => {
  const result = extractForumTagCandidates({
    title: "Reactive stream notes",
    content: "Observables for state updates.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "frontend"));
});

test("normalizeForumFreeformTag preserves Chinese labels and slugs", () => {
  assert.deepEqual(normalizeForumFreeformTag("缓存层"), {
    slug: "缓存层",
    label: "缓存层",
  });
});
```

- [ ] **Step 2: 跑单测确认现在是红灯**

Run:

```bash
node --import tsx --test src/lib/forum-tags.test.ts
```

Expected: 至少中文命中与误标回归测试失败；失败原因应是当前实现仍基于 substring + ASCII-only slug。

- [ ] **Step 3: 在 forum-tags.ts 中实现新抽取规则**

在 `src/lib/forum-tags.ts` 中做以下改造：

1. 把 `CORE_TAG_KEYWORDS` 改成支持中英文 alias 的结构，例如：

```typescript
const CORE_TAG_ALIASES: Record<string, { latinTokens: string[]; latinPhrases: string[]; cjkPhrases: string[] }> = {
  api: {
    latinTokens: ["api", "endpoint", "route"],
    latinPhrases: ["http api"],
    cjkPhrases: ["接口", "路由", "接口网关"],
  },
  // ...其余 core tags
};
```

2. 新增英文 token 化 helper，确保只匹配完整 token：

```typescript
function tokenizeLatinText(input: string) {
  return input
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}
```

3. 新增中文短语匹配 helper：

```typescript
function hasCjkPhraseMatch(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}
```

4. 用 token set + phrase match 替换 `text.includes(keyword)`。
5. 重写 `normalizeSlug()` / `normalizeForumFreeformTag()`，让中文保留到 slug 中；继续过滤 stop words 和过长句子。

- [ ] **Step 4: 再跑 forum-tags 单测确认转绿**

Run:

```bash
node --import tsx --test src/lib/forum-tags.test.ts
```

Expected: 所有 `forum-tags.test.ts` 用例通过，且新增中文/误标回归用例通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/forum-tags.ts src/lib/forum-tags.test.ts
git commit -m "feat: improve forum tag extraction rules"
```

---

### Task 2: 引入 override 规则层（ADD / REMOVE / LOCK）

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_forum_post_tag_overrides/migration.sql`
- Create: `src/lib/forum-tag-overrides.ts`
- Create: `src/lib/forum-tag-overrides.test.ts`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: 先写 override diff / apply 的失败测试**

新建 `src/lib/forum-tag-overrides.test.ts`，先写这些测试：

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveForumTagOverrides,
  applyForumTagOverrides,
} from "./forum-tag-overrides";

test("deriveForumTagOverrides emits LOCK, ADD, REMOVE from desired vs auto", () => {
  const result = deriveForumTagOverrides({
    autoTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "backend", label: "Backend", kind: "CORE" },
    ],
    desiredTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "performance", label: "Performance", kind: "CORE" },
    ],
  });

  assert.deepEqual(result.lock.map((tag) => tag.slug), ["api"]);
  assert.deepEqual(result.add.map((tag) => tag.slug), ["performance"]);
  assert.deepEqual(result.remove.map((tag) => tag.slug), ["backend"]);
});

test("applyForumTagOverrides rebuilds final tags and marks manual influence", () => {
  const result = applyForumTagOverrides({
    autoTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "backend", label: "Backend", kind: "CORE" },
    ],
    overrides: {
      add: [{ slug: "performance", label: "Performance", kind: "CORE" }],
      remove: ["backend"],
      lock: ["api"],
    },
  });

  assert.deepEqual(result.finalTags.map((tag) => [tag.slug, tag.source]), [
    ["api", "MANUAL"],
    ["performance", "MANUAL"],
  ]);
});
```

- [ ] **Step 2: 跑新测试，确认缺少实现而失败**

Run:

```bash
node --import tsx --test src/lib/forum-tag-overrides.test.ts
```

Expected: FAIL，报错应是模块/函数不存在，而不是测试拼写问题。

- [ ] **Step 3: 新增 override helper 文件并实现纯函数逻辑**

新建 `src/lib/forum-tag-overrides.ts`，至少实现：

```typescript
export type ForumTagRecord = {
  slug: string;
  label: string;
  kind: "CORE" | "FREEFORM";
};

export function deriveForumTagOverrides(...) { ... }
export function applyForumTagOverrides(...) { ... }
```

要求：

- diff 逻辑只比较 slug
- 输出稳定排序，便于测试与持久化
- `LOCK` 与 `ADD` 都会让最终 source 变成 `MANUAL`
- `REMOVE` 会排除 auto 中对应 slug

- [ ] **Step 4: 在 Prisma schema 中新增 override enum 和模型**

在 `prisma/schema.prisma` 中新增：

```prisma
enum ForumPostTagOverrideAction {
  ADD
  REMOVE
  LOCK
}

model ForumPostTagOverride {
  id        String                     @id @default(cuid())
  postId    String
  tagId     String
  action    ForumPostTagOverrideAction
  createdAt DateTime                   @default(now())
  updatedAt DateTime                   @updatedAt

  post ForumPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag  ForumTag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([postId, tagId, action])
  @@index([postId])
  @@index([tagId])
  @@index([action])
}
```

并给 `ForumPost` / `ForumTag` 加上 relation 字段。

- [ ] **Step 5: 在 factories.ts 中补 override fixture**

在 `src/test/factories.ts` 新增类似：

```typescript
export function createForumPostTagOverrideFixture(overrides?: Partial<...>) {
  return {
    id: "override-1",
    postId: "post-1",
    action: "LOCK",
    tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
    ...overrides,
  };
}
```

- [ ] **Step 6: 创建迁移并生成 Prisma Client**

Run:

```bash
npm run db:migrate -- --name add-forum-post-tag-overrides
npm run prisma:generate
```

Expected: 新迁移创建成功，Prisma Client 生成通过。

- [ ] **Step 7: 跑 override 测试确认转绿**

Run:

```bash
node --import tsx --test src/lib/forum-tag-overrides.test.ts
```

Expected: 所有 override diff / apply 测试通过。

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/forum-tag-overrides.ts src/lib/forum-tag-overrides.test.ts src/test/factories.ts
git commit -m "feat: add forum tag override model"
```

---

### Task 3: 把标签持久化改成“重建最终标签”管线

**Files:**
- Modify: `src/lib/forum-tags.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Test: `src/app/api/forum/forum-workflow.test.ts`

- [ ] **Step 1: 先给发帖路径补失败测试，验证最终标签仍按现有 payload 返回**

在 `src/app/api/forum/forum-workflow.test.ts` 追加一个用例，验证创建帖子后仍返回：

- `tags` 结构不变
- 中文内容能抽到 `api` / `bugfix` / `database` / `performance` 等 core tags

可以复用现有 `POST /api/forum/posts` 测试结构，只把 body 改成中文内容。

- [ ] **Step 2: 跑 forum workflow 测试，确认新用例先失败**

Run:

```bash
node --import tsx --test src/app/api/forum/forum-workflow.test.ts
```

Expected: 中文发帖标签用例失败，失败原因是当前创建路径还未统一走新 materialization。

- [ ] **Step 3: 在 forum-tags.ts 中新增“重建最终标签”持久化入口**

在 `src/lib/forum-tags.ts` 中新增一个统一入口，例如：

```typescript
export async function rebuildForumPostTags(prismaClient, input: {
  postId: string;
  extracted: ExtractForumTagCandidatesResult;
  overrideRows?: ...;
}) { ... }
```

该函数负责：

1. upsert 参与计算的 `ForumTag`
2. 应用 overrides 计算最终标签
3. `deleteMany` 清空当前 `ForumPostTag`
4. `createMany` 写回最终标签，source 为 `AUTO | MANUAL`

同时保留一个轻量 helper，让“无 overrides”场景也能复用这一入口。

- [ ] **Step 4: 在 forum/posts POST 中改用新入口**

修改 `src/app/api/forum/posts/route.ts`：

- 不再直接调用旧 `persistForumPostTags()` 作为唯一写路径
- 改成抽取后调用 `rebuildForumPostTags()`
- 最后仍查询并返回 `buildForumPostTagPayloads(postWithTags.tags)`

- [ ] **Step 5: 重新跑 forum workflow 测试确认通过**

Run:

```bash
node --import tsx --test src/app/api/forum/forum-workflow.test.ts
```

Expected: 发帖测试全部通过，新增中文标签测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/forum-tags.ts src/app/api/forum/posts/route.ts src/app/api/forum/forum-workflow.test.ts
git commit -m "feat: rebuild forum tags through materialization pipeline"
```

---

### Task 4: 管理员 textarea 保存改成生成 overrides，而不是全量覆盖 final tags

**Files:**
- Modify: `src/app/api/admin/forum/posts/[id]/tags/route.ts`
- Modify: `src/app/api/admin/forum/posts/admin-posts.test.ts`

- [ ] **Step 1: 先把 admin 保存测试改成 override 语义**

在 `src/app/api/admin/forum/posts/admin-posts.test.ts` 中更新现有 `PUT tags replaces a post's final tag set with manual tags` 测试，改成：

- mock `forumPost.findUnique()` 返回帖子 title/content/category
- mock `forumPostTagOverride.deleteMany/createMany`
- mock `forumPostTag.deleteMany/createMany`
- 断言：
  - 会先清空旧 overrides
  - 会创建 `LOCK / ADD / REMOVE` 对应 rows
  - 返回给客户端的 `data.tags` 仍是现有 payload shape

建议把原测试改名为：

```typescript
test("PUT tags rebuilds overrides and final tags from admin textarea", async () => { ... })
```

- [ ] **Step 2: 跑 admin route 测试确认红灯**

Run:

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: 该用例失败，原因是当前 route 仍直接调用 `replaceForumPostTags()`。

- [ ] **Step 3: 在 admin route 中接入 override diff + rebuild 逻辑**

修改 `src/app/api/admin/forum/posts/[id]/tags/route.ts`：

1. 加载完整 post（至少 `title/content/category`）
2. 用当前内容重新抽取 auto tags
3. 用 textarea 解析后的 desired tags 调用 `deriveForumTagOverrides()`
4. 在事务中：
   - upsert desired/auto 涉及的 tag definitions
   - 删除旧 `forumPostTagOverride`
   - 新建 `ADD / REMOVE / LOCK` rows
   - 调用 `rebuildForumPostTags()` 重建最终标签
5. 响应中返回最终物化后的 tags

- [ ] **Step 4: 再跑 admin route 测试确认转绿**

Run:

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: 所有 admin 帖子相关测试通过，新的 override 语义测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/forum/posts/[id]/tags/route.ts src/app/api/admin/forum/posts/admin-posts.test.ts
git commit -m "feat: derive forum tag overrides from admin edits"
```

---

### Task 5: 回填脚本不再跳过 manual 帖子，而是重放 overrides 并迁移旧人工修正

**Files:**
- Modify: `scripts/forum-post-tags-backfill.mjs`
- Modify: `src/scripts/forum-post-tags-backfill.test.ts`

- [ ] **Step 1: 先补失败测试，验证 legacy manual 帖子会生成 overrides 而不是跳过**

在 `src/scripts/forum-post-tags-backfill.test.ts` 增加用例，例如：

```typescript
test("backfill converts legacy manual final tags into overrides instead of skipping the post", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-1",
      title: "Fix API timeout",
      content: "Need to optimize database query performance",
      category: "technical",
      tags: [
        {
          source: "MANUAL",
          tag: { slug: "api", label: "API", kind: "CORE" },
        },
        {
          source: "MANUAL",
          tag: { slug: "performance", label: "Performance", kind: "CORE" },
        },
      ],
      overrides: [],
    },
  ]);

  assert.equal(result.skippedManual, 0);
  assert.equal(result.operations.length, 1);
  assert.ok(result.operations[0].overrideActions.some((item) => item.action === "LOCK"));
});
```

同时把现有“manual 即跳过”测试重写成“manual legacy 会进入转换逻辑”。

- [ ] **Step 2: 跑 backfill 测试确认红灯**

Run:

```bash
node --import tsx --test src/scripts/forum-post-tags-backfill.test.ts
```

Expected: 旧逻辑下会失败，因为脚本仍然看到 `MANUAL` 就跳过。

- [ ] **Step 3: 改造 backfill 脚本**

修改 `scripts/forum-post-tags-backfill.mjs`：

- 查询 posts 时把 `overrides` 一并 select 出来
- `buildForumPostTagBackfillPlan()` 中：
  - 如果已有 overrides：重跑抽取并重建 final tags
  - 如果没有 overrides 但现有 final tags 含 manual：把当前 final manual tag set 当作 desired final，基于最新 auto 抽取得到 `ADD / REMOVE / LOCK`
- dry-run summary 中新增统计，例如：

```typescript
{
  scanned,
  updated,
  convertedLegacyManual,
  rebuiltFromOverrides,
  emptyTagPosts,
  dryRun,
}
```

- [ ] **Step 4: 重新跑 backfill 测试确认转绿**

Run:

```bash
node --import tsx --test src/scripts/forum-post-tags-backfill.test.ts
```

Expected: backfill 测试全部通过，manual legacy 用例不再被跳过。

- [ ] **Step 5: Commit**

```bash
git add scripts/forum-post-tags-backfill.mjs src/scripts/forum-post-tags-backfill.test.ts
git commit -m "feat: replay forum tag overrides during backfill"
```

---

### Task 6: 跑完整验证并手工复核需求清单

**Files:**
- Modify: none
- Verify: 当前分支全部相关改动

- [ ] **Step 1: 跑标签相关单测集合**

Run:

```bash
node --import tsx --test \
  src/lib/forum-tags.test.ts \
  src/lib/forum-tag-overrides.test.ts \
  src/app/api/forum/forum-workflow.test.ts \
  src/app/api/admin/forum/posts/admin-posts.test.ts \
  src/scripts/forum-post-tags-backfill.test.ts
```

Expected: 以上测试全部通过。

- [ ] **Step 2: 跑全量测试**

Run:

```bash
npm test
```

Expected: exit code 0，无新增失败。

- [ ] **Step 3: 按 spec 逐项人工核对**

核对以下条目是否都被满足：

- 中文 core tags 可正常命中
- `prefix -> bugfix` / `reactive -> frontend` 误标已消失
- 中文 freeform tag 不再被丢弃
- admin textarea 保存改为生成 `ADD/REMOVE/LOCK`
- 读接口仍返回原有 final tag payload shape
- backfill 可重跑已人工修正帖子

- [ ] **Step 4: Commit 最终整合（如仍有未提交修改）**

```bash
git add -A
git commit -m "feat: harden forum tag extraction and manual overrides"
```

