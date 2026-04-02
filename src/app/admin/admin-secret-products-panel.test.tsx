import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecretProductsPanel } from "./admin-secret-products-panel";

test("AdminSecretProductsPanel renders provider fields and inventory import textarea", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          inventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.form\.providerLabel/);
  assert.match(html, /admin\.products\.form\.usageInstructions/);
  assert.match(html, /admin\.products\.inventory\.secrets/);
  assert.match(html, /textarea/);
});
