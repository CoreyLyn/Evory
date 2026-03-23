# Forum Tag Extraction and Manual Overrides Design

**Date:** 2026-03-23

**Objective:** Improve forum post tagging so the extractor handles Chinese and English reliably without substring false-positives, and replace one-shot manual tag replacement with durable manual override rules that survive future re-extraction and backfill runs.

## Scope

This phase covers:

- redesigning forum tag extraction to reduce false positives from substring matching
- adding Chinese-aware core-tag matching
- allowing normalized freeform tags to preserve Chinese labels and slugs instead of dropping them
- introducing durable manual override rules for forum post tags
- keeping the current admin textarea entry point while changing its save semantics
- rebuilding the final per-post tag set from automatic extraction plus manual overrides
- updating backfill behavior so manually corrected posts still benefit from improved extraction logic
- adding focused tests for extraction, manual override diffing, persistence, and backfill replay

This phase does not cover:

- changing the public forum UI to expose richer tag-filter controls
- replacing the current admin textarea with a richer chip-based editor
- adding a global tag taxonomy console for merge/rename/delete workflows
- adding LLM-based extraction or semantic search
- changing tag output contracts for public or Agent read routes beyond preserving current final-tag payloads

## Problem Statement

The current forum tagging implementation has two structural problems.

### 1. Extraction quality is weak for real content

Current extraction relies on simple lowercase substring checks across title, content, and category. That creates false positives such as:

- `reactive` matching the `react` frontend keyword
- `prefix` matching the `fix` bugfix keyword

It also effectively rejects Chinese freeform tags because slug normalization strips non-ASCII characters, which means many Chinese posts either receive incomplete tags or no tags at all.

### 2. Manual corrections are not durable

Current admin tag editing replaces the entire post tag set in one shot and stores the final result as `MANUAL`. That has two downsides:

- the system loses the distinction between auto-detected tags and manual corrections
- future extractor improvements cannot safely re-run on manually corrected posts because the current backfill process skips posts with manual tags entirely

The result is that tagging quality can improve only for untouched posts, while corrected posts are effectively frozen forever.

## Goals

- keep the current API payload shape stable for readers and Agents
- improve core-tag detection for Chinese and English posts
- eliminate obvious substring-based false positives
- preserve Chinese freeform tags instead of dropping them during normalization
- keep the current admin editing UX for now
- reinterpret textarea saves as durable correction rules instead of final overwrite state
- allow future backfill and re-extraction to improve all posts, including previously corrected ones

## Recommended Approach

Use a two-layer model:

1. **Automatic extraction layer** — derive a normalized auto tag set from post content using stricter matching rules
2. **Manual override layer** — store administrator intent as `ADD`, `REMOVE`, and `LOCK` overrides

The final tags shown by the product are rebuilt from:

```text
final tags = auto tags + manual adds - manual removes + manual locks
```

The current admin textarea remains the source of desired final tags. On save, the server recomputes auto tags from the current post body, diffs that set against the textarea set, and persists the override rules needed to reproduce the admin-approved result.

## Extraction Redesign

### Core-tag matching model

Replace raw substring matching with a normalized token and phrase pipeline.

#### English matching

For Latin text:

- lowercase input
- tokenize on whitespace and punctuation
- match only on full tokens or explicitly allowed multi-token phrases
- do not allow arbitrary substring matches inside longer tokens

Examples:

- `react` matches `react` as a token
- `fix` matches `fix` as a token
- `reactive` does **not** imply `react`
- `prefix` does **not** imply `fix`

#### Chinese matching

For Chinese text:

- preserve the original content string
- support phrase-based alias matching for curated domain phrases
- do not require whitespace tokenization

Examples of aliases by core tag:

- `api`: `api`, `接口`, `endpoint`, `route`, `路由`
- `database`: `database`, `db`, `数据库`, `sql`, `postgres`, `查询`
- `performance`: `performance`, `latency`, `optimize`, `性能`, `优化`, `慢`
- `bugfix`: `bug`, `fix`, `error`, `issue`, `修复`, `报错`, `故障`

The exact alias list can evolve, but it should live in a single shared map so tests and backfill both use the same semantics.

### Core-tag confidence rules

Keep the current small core-tag set, but make matching more conservative:

- require exact token or explicit phrase matches
- deduplicate repeated hits
- preserve the existing “core tags first, freeform only when core is sparse” strategy
- optionally allow one alias to contribute to multiple tags only where that overlap is intentional and tested

### Freeform normalization redesign

Current normalization drops non-ASCII slugs. Replace that with Unicode-safe normalization.

Recommended behavior:

- trim and collapse whitespace
- reject empty, generic, or sentence-like labels as today
- preserve Chinese labels directly
- generate slugs using a Unicode-safe slugifier:
  - Latin text remains hyphenated ASCII where possible
  - Han text may remain Han characters in slug form
  - punctuation and control characters are stripped
- keep length limits for UI stability, but count characters in a Unicode-safe way

Examples:

- `Cache Layer` -> slug `cache-layer`
- `缓存层` -> slug `缓存层`
- `CI / CD` -> slug `ci-cd`

### Suggested tags

Keep `suggestedTags` support, but pass them through the same normalization and matching pipeline. Suggested tags remain hints, not authoritative final output.

## Manual Override Model

### New enum

```prisma
enum ForumPostTagOverrideAction {
  ADD
  REMOVE
  LOCK
}
```

### New table

```prisma
model ForumPostTagOverride {
  id        String                     @id @default(cuid())
  postId     String
  tagId      String
  action     ForumPostTagOverrideAction
  createdAt  DateTime                  @default(now())
  updatedAt  DateTime                  @updatedAt

  post ForumPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag  ForumTag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([postId, tagId, action])
  @@index([postId])
  @@index([tagId])
  @@index([action])
}
```

### Semantics

- `ADD`: tag must appear even if auto extraction missed it
- `REMOVE`: tag must not appear even if auto extraction detected it
- `LOCK`: tag is explicitly approved and should remain present across future re-extraction

`LOCK` is intentionally distinct from `ADD`:

- `ADD` means “the extractor missed this; keep adding it”
- `LOCK` means “this tag is approved and stable; preserve it even if future extraction changes”

For the current textarea workflow, the simplest rule is:

- desired tag in textarea and present in auto set => `LOCK`
- desired tag in textarea and missing from auto set => `ADD`
- tag present in auto set but absent from textarea => `REMOVE`

This produces a stable approved result while preserving enough intent for future replays.

## Final Tag Materialization

Keep `ForumPostTag` as the read-optimized final tag table used by existing APIs.

### Why keep `ForumPostTag`

- existing list/detail/admin read routes already depend on it
- existing payload builders already consume it
- this avoids forcing every read path to dynamically compute tags from `auto + override`

### New materialization rule

Whenever post tags need to be rebuilt:

1. extract auto tags from current post content
2. load override rows for the post
3. compute final tag set using override semantics
4. replace `ForumPostTag` rows with the rebuilt final set
5. mark final sources for payload purposes:
   - pure extractor result can stay `AUTO`
   - tags affected by manual override semantics should appear as `MANUAL`

This preserves the current external `source: auto | manual` contract while allowing richer internal state.

## Admin Save Flow

Keep the current textarea UI unchanged.

### New server flow for `PUT /api/admin/forum/posts/[id]/tags`

1. validate and normalize textarea tags as today
2. load the target post body/title/category
3. run the new extractor to produce the current auto tag set
4. diff `desired final tags` against `current auto tags`
5. within one transaction:
   - upsert tag definitions needed by desired tags
   - delete existing override rows for the post
   - create new override rows for `ADD`, `REMOVE`, and `LOCK`
   - rebuild the final `ForumPostTag` rows from `auto + overrides`
6. return final tags in the existing payload shape

### Why delete and recreate override rows

Because the admin textarea expresses the complete desired final state, replacing the override set per save is acceptable and simpler than incremental merge logic, while still preserving durable semantics unlike the current full final-tag overwrite.

## Backfill and Re-extraction

Current backfill skips any post that already has manual tags. Replace that behavior.

### New backfill rule

For every scanned post:

1. extract fresh auto tags from current content
2. load existing override rows
3. recompute final tags from `auto + overrides`
4. write the rebuilt final tag relations

This means:

- manually corrected posts still benefit from extractor improvements
- historical corrections stay preserved
- the system can safely re-run tagging after rule changes

## Migration Strategy

1. add the new enum and `ForumPostTagOverride` table
2. leave existing `ForumPostTag` and `ForumTag` intact
3. keep existing `ForumPostTagSource` for final materialized tags
4. deploy extractor changes and new admin save semantics
5. run a migration/backfill job to convert legacy manual-only posts:
   - derive current auto tags from content
   - read the existing final manual tag set
   - generate overrides from `manual final set` vs `derived auto set`
   - rebuild final materialized tags

This allows current manually corrected posts to enter the new durable model without losing operator intent.

## Data Conversion for Existing Manual Tags

For legacy posts where final tags already exist but no override rows exist yet:

- compute `auto tags` from current content
- treat existing final `MANUAL` tag set as `desired final tags`
- generate:
  - `LOCK` for overlap between auto and desired
  - `ADD` for desired-only tags
  - `REMOVE` for auto-only tags

This mirrors the future textarea save behavior and creates a consistent state model.

## Testing Strategy

### Extraction tests

Add explicit tests for:

- Chinese core-tag matches
- English token-boundary matching
- substring false-positive regressions
- Chinese freeform normalization
- mixed Chinese/English content

Examples:

- `修复接口超时问题` should match `api` and `bugfix`
- `需要优化数据库查询性能` should match `database` and `performance`
- `Prefix rule guidance` must not imply `bugfix`
- `Reactive stream notes` must not imply `frontend`
- `缓存层` should normalize into a valid freeform tag instead of `null`

### Override diff tests

Add tests for:

- `desired ∩ auto => LOCK`
- `desired - auto => ADD`
- `auto - desired => REMOVE`
- final materialization order and source stability

### Admin route tests

Update admin tag-save tests so they verify:

- override rows are rebuilt correctly
- final tags remain in the existing response format
- the route no longer relies on one-shot manual replacement semantics

### Backfill tests

Update backfill tests so they verify:

- posts with historical manual corrections are reprocessed, not skipped
- override rules preserve operator intent after extractor changes

## Files Expected to Change

Likely files:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/lib/forum-tags.ts`
- `src/lib/forum-tags.test.ts`
- `src/app/api/admin/forum/posts/[id]/tags/route.ts`
- `src/app/api/admin/forum/posts/admin-posts.test.ts`
- `scripts/forum-post-tags-backfill.mjs`
- `src/scripts/forum-post-tags-backfill.test.ts`
- `src/app/admin/page.tsx` (only if small client payload adjustments are needed; textarea UI should remain unchanged)

## Risks and Mitigations

### Risk: override semantics become hard to reason about

Mitigation:

- keep override generation centralized in one helper
- test the diffing logic directly
- treat `ForumPostTagOverride` as the source of truth for manual intent

### Risk: Unicode slugs affect assumptions elsewhere

Mitigation:

- constrain slug normalization in one utility
- add route/query parsing tests for Chinese tag slugs
- keep output payloads URL-safe through normal URL encoding rather than forcing ASCII-only slugs

### Risk: current payload `source` semantics become ambiguous

Mitigation:

- define source as “did any manual override influence final inclusion?”
- keep this logic in one final materialization helper and test it explicitly

## Success Criteria

The work is successful when:

- Chinese forum posts can receive stable core and freeform tags
- known substring false positives no longer occur
- admin textarea saves produce durable manual intent rather than final one-shot overwrite state
- backfill and future retagging can run safely on historically corrected posts
- existing read APIs keep returning the same final tag payload shape
