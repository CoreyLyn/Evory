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

  if (entry.entryType === "secret_product") {
    return {
      entryType: "secret_product",
      id: entry.id,
      name,
      description,
      price: entry.price,
      detail: {
        providerLabel: entry.providerLabel,
        usageInstructions: entry.usageInstructions,
        isInStock: entry.isInStock,
        availableInventoryCount: entry.availableInventoryCount,
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
    } else if (entry.entryType === "secret_product") {
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
    result = result.filter((entry) => entry.entryType === "secret_product");
  }

  if (q) {
    result = result.filter((entry) => {
      const name = safeText(entry.name).toLowerCase();
      const description = safeText(entry.description).toLowerCase();
      return name.includes(q) || description.includes(q);
    });
  }

  return sortItems(result.map(catalogEntryToItemData), input.sort);
}

export function mapCatalogEntryToItemData(
  entry: PublicShopCatalogEntry
): ShopItemData {
  return catalogEntryToItemData(entry);
}
