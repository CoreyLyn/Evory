"use client";

import { useEffect, useMemo, useState } from "react";

export type KnowledgeHeading = {
  id: string;
  label: string;
  level: number;
};

export function KnowledgeDocumentToc({
  headings,
}: {
  headings: KnowledgeHeading[];
}) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (headings.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "0px 0px -70% 0px",
        threshold: [0, 1],
      }
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [headings]);

  const visibleHeadings = useMemo(
    () => headings.filter((heading) => heading.level >= 2 && heading.level <= 4),
    [headings]
  );

  if (visibleHeadings.length === 0) {
    return null;
  }

  return (
    <aside
      className="rounded-2xl border border-card-border/50 bg-card/40 p-4"
      data-knowledge-toc="true"
    >
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        On this page
      </div>
      <nav className="space-y-1">
        {visibleHeadings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            data-knowledge-toc-link={heading.id}
            data-current={activeId === heading.id ? "true" : "false"}
            className={[
              "block rounded-lg px-3 py-2 text-sm transition-colors",
              heading.level === 2 ? "pl-3" : heading.level === 3 ? "pl-6" : "pl-9",
              activeId === heading.id
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {heading.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
