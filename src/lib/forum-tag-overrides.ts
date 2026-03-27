export type ForumTagRecord = {
  slug: string;
  label: string;
};

export type DerivedForumTagOverrides = {
  add: ForumTagRecord[];
  remove: ForumTagRecord[];
  lock: ForumTagRecord[];
};

export type ForumTagOverrides = {
  add: ForumTagRecord[];
  remove: string[];
  lock: ForumTagRecord[];
};

export type MaterializedForumTagRecord = ForumTagRecord & {
  source: "AUTO" | "MANUAL";
};

function sortForumTagRecords<T extends ForumTagRecord>(tags: T[]) {
  return [...tags].sort((left, right) => {
    return left.slug.localeCompare(right.slug) || left.label.localeCompare(right.label);
  });
}

function uniqueForumTagsBySlug(tags: ForumTagRecord[]) {
  const bySlug = new Map<string, ForumTagRecord>();

  for (const tag of tags) {
    if (!bySlug.has(tag.slug)) {
      bySlug.set(tag.slug, tag);
    }
  }

  return bySlug;
}

function uniqueSlugSet(slugs: string[]) {
  return new Set(slugs);
}

function assertNoConflictingForumTagOverrides(overrides?: Partial<ForumTagOverrides>) {
  const overrideBuckets = new Map<string, Set<"add" | "remove" | "lock">>();

  for (const tag of overrides?.add ?? []) {
    const buckets = overrideBuckets.get(tag.slug) ?? new Set();
    buckets.add("add");
    overrideBuckets.set(tag.slug, buckets);
  }

  for (const slug of overrides?.remove ?? []) {
    const buckets = overrideBuckets.get(slug) ?? new Set();
    buckets.add("remove");
    overrideBuckets.set(slug, buckets);
  }

  for (const tag of overrides?.lock ?? []) {
    const buckets = overrideBuckets.get(tag.slug) ?? new Set();
    buckets.add("lock");
    overrideBuckets.set(tag.slug, buckets);
  }

  const conflictingSlugs = [...overrideBuckets.entries()]
    .filter(([, buckets]) => buckets.size > 1)
    .map(([slug]) => slug)
    .sort((left, right) => left.localeCompare(right));

  if (conflictingSlugs.length > 0) {
    throw new Error(
      `Conflicting forum tag overrides for slug(s): ${conflictingSlugs.join(", ")}`
    );
  }
}

export function deriveForumTagOverrides(input: {
  autoTags: ForumTagRecord[];
  desiredTags: ForumTagRecord[];
}): DerivedForumTagOverrides {
  const autoTagsBySlug = uniqueForumTagsBySlug(input.autoTags);
  const desiredTagsBySlug = uniqueForumTagsBySlug(input.desiredTags);

  const add: ForumTagRecord[] = [];
  const remove: ForumTagRecord[] = [];

  for (const [slug, desiredTag] of desiredTagsBySlug) {
    if (!autoTagsBySlug.has(slug)) {
      add.push(desiredTag);
    }
  }

  for (const [slug, autoTag] of autoTagsBySlug) {
    if (!desiredTagsBySlug.has(slug)) {
      remove.push(autoTag);
    }
  }

  return {
    add: sortForumTagRecords(add),
    remove: sortForumTagRecords(remove),
    lock: [],
  };
}

export function applyForumTagOverrides(input: {
  autoTags: ForumTagRecord[];
  overrides?: Partial<ForumTagOverrides>;
}): {
  finalTags: MaterializedForumTagRecord[];
} {
  assertNoConflictingForumTagOverrides(input.overrides);

  const autoTagsBySlug = uniqueForumTagsBySlug(input.autoTags);
  const addTagsBySlug = uniqueForumTagsBySlug(input.overrides?.add ?? []);
  const lockTagsBySlug = uniqueForumTagsBySlug(input.overrides?.lock ?? []);
  const removeSlugs = uniqueSlugSet(input.overrides?.remove ?? []);

  const finalTagsBySlug = new Map<string, MaterializedForumTagRecord>();

  for (const tag of sortForumTagRecords([...autoTagsBySlug.values()])) {
    if (removeSlugs.has(tag.slug)) {
      continue;
    }

    finalTagsBySlug.set(tag.slug, {
      ...tag,
      source: lockTagsBySlug.has(tag.slug) ? "MANUAL" : "AUTO",
    });
  }

  for (const tag of sortForumTagRecords([...lockTagsBySlug.values()])) {
    finalTagsBySlug.set(tag.slug, {
      ...tag,
      source: "MANUAL",
    });
  }

  for (const tag of sortForumTagRecords([...addTagsBySlug.values()])) {
    finalTagsBySlug.set(tag.slug, {
      ...tag,
      source: "MANUAL",
    });
  }

  return {
    finalTags: sortForumTagRecords([...finalTagsBySlug.values()]),
  };
}
