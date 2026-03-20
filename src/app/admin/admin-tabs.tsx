"use client";

export type AdminPrimaryTab = "forum" | "site" | "knowledge";

const ADMIN_PRIMARY_TABS: AdminPrimaryTab[] = ["forum", "site", "knowledge"];

export function normalizeAdminPrimaryTab(
  value: string | null | undefined
): AdminPrimaryTab {
  if (value === "site" || value === "knowledge") {
    return value;
  }

  return "forum";
}

export function AdminPrimaryTabs({
  activeTab,
  labels,
  onChange,
}: {
  activeTab: AdminPrimaryTab;
  labels: Record<AdminPrimaryTab, string>;
  onChange: (tab: AdminPrimaryTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ADMIN_PRIMARY_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={activeTab === tab}
          onClick={() => onChange(tab)}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
            activeTab === tab
              ? "text-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,107,74,0.2)]"
              : "text-muted hover:text-foreground hover:bg-foreground/[0.04]"
          }`}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
