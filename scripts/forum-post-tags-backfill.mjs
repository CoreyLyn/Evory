import { fileURLToPath } from "node:url";
import path from "node:path";

import prisma from "../src/lib/prisma.ts";
import {
  extractForumTagCandidates,
  replaceForumPostTags,
} from "../src/lib/forum-tags.ts";

function flattenExtractedTags(extracted) {
  return [
    ...extracted.core.map((tag) => ({
      slug: tag.slug,
      label: tag.label,
      kind: "CORE",
    })),
    ...extracted.freeform.map((tag) => ({
      slug: tag.slug,
      label: tag.label,
      kind: "FREEFORM",
    })),
  ];
}

export async function buildForumPostTagBackfillPlan(posts) {
  const operations = [];
  let skippedManual = 0;
  let emptyTagPosts = 0;

  for (const post of posts) {
    if ((post.tags ?? []).some((tag) => tag.source === "MANUAL")) {
      skippedManual += 1;
      continue;
    }

    const extracted = extractForumTagCandidates({
      title: post.title,
      content: post.content,
      category: post.category,
    });
    const tags = flattenExtractedTags(extracted);

    if (tags.length === 0) {
      emptyTagPosts += 1;
      if ((post.tags ?? []).length === 0) {
        continue;
      }
    }

    operations.push({
      postId: post.id,
      tags,
    });
  }

  return {
    operations,
    skippedManual,
    emptyTagPosts,
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
  let skippedManual = 0;
  let emptyTagPosts = 0;

  for (;;) {
    const posts = await prismaClient.forumPost.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        tags: {
          select: {
            source: true,
            tag: {
              select: {
                slug: true,
                label: true,
                kind: true,
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
    skippedManual += plan.skippedManual;
    emptyTagPosts += plan.emptyTagPosts;

    if (!dryRun) {
      for (const operation of plan.operations) {
        await replaceForumPostTags(prismaClient, {
          postId: operation.postId,
          tags: operation.tags,
          source: "AUTO",
        });
      }
    }

    updated += plan.operations.length;
    cursor = posts.at(-1)?.id;

    logger.info(
      `[forum-post-tags-backfill] processed=${scanned} updated=${updated} skippedManual=${skippedManual} emptyTagPosts=${emptyTagPosts}`
    );
  }

  const summary = {
    scanned,
    updated,
    skippedManual,
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
