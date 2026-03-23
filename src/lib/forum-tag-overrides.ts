export type ForumTagRecord = {
  slug: string;
  label: string;
  kind: "CORE" | "FREEFORM";
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
    return (
      left.slug.localeCompare(right.slug) ||
      left.label.localeCompare(right.label) ||
      left.kind.localeCompare(right.kind)
    );
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

export function deriveForumTagOverrides(input: {
  autoTags: ForumTagRecord[];
  desiredTags: ForumTagRecord[];
}): DerivedForumTagOverrides {
  const autoTagsBySlug = uniqueForumTagsBySlug(input.autoTags);
  const desiredTagsBySlug = uniqueForumTagsBySlug(input.desiredTags);

  const add: ForumTagRecord[] = [];
  const lock: ForumTagRecord[] = [];
  const remove: ForumTagRecord[] = [];

  for (const [slug, desiredTag] of desiredTagsBySlug) {
    if (autoTagsBySlug.has(slug)) {
      lock.push(desiredTag);
      continue;
    }

    add.push(desiredTag);
  }

  for (const [slug, autoTag] of autoTagsBySlug) {
    if (!desiredTagsBySlug.has(slug)) {
      remove.push(autoTag);
    }
  }

  return {
    add: sortForumTagRecords(add),
    remove: sortForumTagRecords(remove),
    lock: sortForumTagRecords(lock),
  };
}

export function applyForumTagOverrides(input: {
  autoTags: ForumTagRecord[];
  overrides?: Partial<ForumTagOverrides>;
}): {
  finalTags: MaterializedForumTagRecord[];
} {
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
