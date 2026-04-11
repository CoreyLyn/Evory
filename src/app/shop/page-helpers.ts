import type { PublicShopCatalogEntry } from "@/lib/shop-client";
import type {
  ShopProductTypeCounts,
  ShopProductTypeFilter,
} from "@/components/shop/category-tabs";
import type { SortOption } from "@/components/shop/sort-select";
import type { ShopItemData } from "@/components/shop/utils";

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getSearchableText(entry: PublicShopCatalogEntry): string[] {
  const fields = [safeText(entry.name), safeText(entry.description)];

  if (entry.entryType === "api_quota_product") {
    fields.push(
      safeText(entry.providerLabel),
      safeText(entry.quotaUnitLabel),
      String(entry.quotaAmount)
    );
  }

  return fields;
}

function sortItems(items: ShopItemData[], sort: SortOption): ShopItemData[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

function catalogEntryToItemData(entry: PublicShopCatalogEntry): ShopItemData {
  const name = safeText(entry.name);
  const description = safeText(entry.description);

  if (entry.entryType === "cosmetic") {
    return {
      entryType: "cosmetic",
      id: entry.id,
      name,
      description,
      type: entry.type,
      category: entry.category,
      price: entry.price,
      spriteKey: entry.spriteKey,
    };
  }

  if (entry.entryType === "api_quota_product") {
    return {
      entryType: "api_quota_product",
      id: entry.id,
      name,
      description,
      price: entry.price,
      detail: {
        providerLabel: entry.providerLabel,
        usageInstructions: entry.usageInstructions,
        quotaAmount: entry.quotaAmount,
        quotaUnitLabel: entry.quotaUnitLabel,
        allowRepeatPurchase: entry.allowRepeatPurchase,
        perAgentPurchaseLimit: entry.perAgentPurchaseLimit,
      },
    };
  }

  const exhaustiveCheck: never = entry;
  throw new Error(`Unsupported shop catalog entry: ${String(exhaustiveCheck)}`);
}

export function getTypeCounts(
  catalog: readonly PublicShopCatalogEntry[]
): ShopProductTypeCounts {
  const counts: ShopProductTypeCounts = {
    all: catalog.length,
    cosmetics: 0,
    secretProducts: 0,
  };

  for (const entry of catalog) {
    if (entry.entryType === "cosmetic") {
      counts.cosmetics += 1;
    } else if (entry.entryType === "api_quota_product") {
      counts.secretProducts += 1;
    }
  }

  return counts;
}

export function filterAndSortCatalogEntries(input: {
  catalog: readonly PublicShopCatalogEntry[];
  activeTab: ShopProductTypeFilter;
  search: string;
  sort: SortOption;
}): ShopItemData[] {
  const q = input.search.trim().toLowerCase();
  let result = input.catalog;

  if (input.activeTab === "cosmetics") {
    result = result.filter((entry) => entry.entryType === "cosmetic");
  } else if (input.activeTab === "secretProducts") {
    result = result.filter((entry) => entry.entryType === "api_quota_product");
  }

  if (q) {
    result = result.filter((entry) => {
      return getSearchableText(entry).some((value) =>
        value.toLowerCase().includes(q)
      );
    });
  }

  return sortItems(result.map(catalogEntryToItemData), input.sort);
}

export function mapCatalogEntryToItemData(
  entry: PublicShopCatalogEntry
): ShopItemData {
  return catalogEntryToItemData(entry);
}
