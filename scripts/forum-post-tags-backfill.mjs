import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

import prisma from "../src/lib/prisma.ts";

const require = createRequire(import.meta.url);
const {
  normalizeForumSuggestedTags,
  rebuildForumPostTags,
} = require("../src/lib/forum-tags.ts");
const { applyForumTagOverrides, deriveForumTagOverrides } = require(
  "../src/lib/forum-tag-overrides.ts"
);

function flattenLegacyManualTags(tags) {
  return (tags ?? [])
    .filter((tag) => tag.source === "MANUAL")
    .map(({ tag }) => ({
      slug: tag.slug,
      label: tag.label,
    }));
}

function normalizeOverrideActions(overrides) {
  return (overrides ?? []).map((override) => ({
    action: override.action,
    tag: {
      slug: override.tag.slug,
      label: override.tag.label,
    },
  }));
}

function buildOverrideActions(derivedOverrides) {
  return [
    ...derivedOverrides.add.map((tag) => ({ action: "ADD", tag })),
    ...derivedOverrides.remove.map((tag) => ({ action: "REMOVE", tag })),
    ...derivedOverrides.lock.map((tag) => ({ action: "LOCK", tag })),
  ];
}

function buildOverrideInput(overrideActions) {
  return {
    add: overrideActions
      .filter((override) => override.action === "ADD")
      .map((override) => override.tag),
    remove: overrideActions
      .filter((override) => override.action === "REMOVE")
      .map((override) => override.tag.slug),
    lock: overrideActions
      .filter((override) => override.action === "LOCK")
      .map((override) => override.tag),
  };
}

function flattenFinalTags(finalTags) {
  return finalTags.map(({ source: _source, ...tag }) => tag);
}

function uniqueTagsBySlug(tags) {
  const tagsBySlug = new Map();

  for (const tag of tags) {
    if (!tagsBySlug.has(tag.slug)) {
      tagsBySlug.set(tag.slug, tag);
    }
  }

  return [...tagsBySlug.values()];
}

async function persistForumPostTagBackfillOperation(prismaClient, operation) {
  const participatingTags = uniqueTagsBySlug([
    ...operation.automaticTags,
    ...operation.overrideActions.map((override) => override.tag),
  ]);
  const tagIdsBySlug = new Map();

  await Promise.all(
    participatingTags.map(async (tag) => {
      const record = await prismaClient.forumTag.upsert({
        where: { slug: tag.slug },
        update: {
          label: tag.label,
        },
        create: {
          slug: tag.slug,
          label: tag.label,
        },
      });

      tagIdsBySlug.set(tag.slug, record.id);
    })
  );

  await prismaClient.forumPostTagOverride.deleteMany({
    where: { postId: operation.postId },
  });

  if (operation.overrideActions.length > 0) {
    await prismaClient.forumPostTagOverride.createMany({
      data: operation.overrideActions.map((override) => ({
        postId: operation.postId,
        tagId: tagIdsBySlug.get(override.tag.slug),
        action: override.action,
      })),
      skipDuplicates: true,
    });
  }

  await rebuildForumPostTags(prismaClient, {
    postId: operation.postId,
    automaticTags: operation.automaticTags,
    overrideRows: operation.overrideActions,
  });
}

async function executeForumPostTagBackfillOperation(prismaClient, operation) {
  if (typeof prismaClient.$transaction === "function") {
    await prismaClient.$transaction(async (tx) => {
      await persistForumPostTagBackfillOperation(tx, operation);
    });
    return;
  }

  await persistForumPostTagBackfillOperation(prismaClient, operation);
}

export async function buildForumPostTagBackfillPlan(posts) {
  const operations = [];
  let skippedManual = 0;
  let emptyTagPosts = 0;
  let convertedLegacyManual = 0;
  let rebuiltFromOverrides = 0;

  for (const post of posts) {
    const automaticTags = normalizeForumSuggestedTags(
      Array.isArray(post.suggestedTags)
        ? post.suggestedTags.filter((tag) => typeof tag === "string")
        : []
    );
    const existingOverrideActions = normalizeOverrideActions(post.overrides);
    const legacyManualTags = flattenLegacyManualTags(post.tags);

    let overrideActions = existingOverrideActions;

    if (existingOverrideActions.length > 0) {
      rebuiltFromOverrides += 1;
    } else if (legacyManualTags.length > 0) {
      overrideActions = buildOverrideActions(
        deriveForumTagOverrides({
          autoTags: automaticTags,
          desiredTags: legacyManualTags,
        })
      );
      convertedLegacyManual += 1;
    }

    const { finalTags } = applyForumTagOverrides({
      autoTags: automaticTags,
      overrides: buildOverrideInput(overrideActions),
    });
    const tags = flattenFinalTags(finalTags);

    if (automaticTags.length === 0) {
      emptyTagPosts += 1;
      if (tags.length === 0 && flattenLegacyManualTags(post.tags).length === 0 && overrideActions.length === 0) {
        continue;
      }
    }

    operations.push({
      postId: post.id,
      automaticTags,
      tags,
      overrideActions,
    });
  }

  return {
    operations,
    skippedManual,
    emptyTagPosts,
    convertedLegacyManual,
    rebuiltFromOverrides,
  };
}

export async function runForumPostTagBackfill(options = {}) {
  const prismaClient = options.prismaClient ?? prisma;
  const batchSize = Math.max(1, Number.parseInt(`${options.batchSize ?? 100}`, 10) || 100);
  const dryRun = Boolean(options.dryRun);
  const logger = options.logger ?? console;

  let cursor;
  let scanned = 0;
  let updated = 0;
  let emptyTagPosts = 0;
  let convertedLegacyManual = 0;
  let rebuiltFromOverrides = 0;

  for (;;) {
    const posts = await prismaClient.forumPost.findMany({
      select: {
        id: true,
        suggestedTags: true,
        tags: {
          select: {
            source: true,
            tag: {
              select: {
                slug: true,
                label: true,
              },
            },
          },
        },
        overrides: {
          select: {
            action: true,
            tag: {
              select: {
                slug: true,
                label: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    if (posts.length === 0) {
      break;
    }

    scanned += posts.length;

    const plan = await buildForumPostTagBackfillPlan(posts);
    emptyTagPosts += plan.emptyTagPosts;
    convertedLegacyManual += plan.convertedLegacyManual;
    rebuiltFromOverrides += plan.rebuiltFromOverrides;

    if (!dryRun) {
      for (const operation of plan.operations) {
        await executeForumPostTagBackfillOperation(prismaClient, operation);
      }
    }

    updated += plan.operations.length;
    cursor = posts.at(-1)?.id;

    logger.info(
      `[forum-post-tags-backfill] processed=${scanned} updated=${updated} convertedLegacyManual=${convertedLegacyManual} rebuiltFromOverrides=${rebuiltFromOverrides} emptyTagPosts=${emptyTagPosts}`
    );
  }

  const summary = {
    scanned,
    updated,
    convertedLegacyManual,
    rebuiltFromOverrides,
    emptyTagPosts,
    dryRun,
  };

  logger.info("[forum-post-tags-backfill] summary", summary);

  return summary;
}

function parseArgs(args = process.argv.slice(2)) {
  const dryRun = args.includes("--dry-run");
  const batchSizeIndex = args.indexOf("--batch-size");
  const batchSize =
    batchSizeIndex >= 0 ? Number.parseInt(args[batchSizeIndex + 1] ?? "", 10) : 100;

  return {
    dryRun,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100,
  };
}

async function main() {
  await runForumPostTagBackfill(parseArgs());
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  main().catch((error) => {
    console.error("[forum-post-tags-backfill]", error);
    process.exitCode = 1;
  });
}
