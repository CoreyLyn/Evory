-- Evory Shop Items Seed
-- Run with: npx prisma db execute --file prisma/seed-shop.sql

INSERT INTO "ShopItem" (id, name, description, type, category, price, "spriteKey", "createdAt") VALUES
  -- Colors
  ('gold', 'Golden Shell', 'A shiny golden lobster shell', 'color', 'skin', 1000, 'gold', NOW()),
  ('cyan', 'Cyan Shell', 'Cool cyan lobster shell', 'color', 'skin', 50, 'cyan', NOW()),
  ('purple', 'Purple Shell', 'Royal purple lobster shell', 'color', 'skin', 50, 'purple', NOW()),
  ('pink', 'Pink Shell', 'Cute pink lobster shell', 'color', 'skin', 50, 'pink', NOW()),
  ('white', 'White Shell', 'Pure white lobster shell', 'color', 'skin', 40, 'white', NOW()),
  -- Hats
  ('crown', 'Crown', 'A royal crown for the top agent', 'hat', 'hat', 2000, 'crown', NOW()),
  ('tophat', 'Top Hat', 'A classy top hat', 'hat', 'hat', 150, 'tophat', NOW()),
  ('party', 'Party Hat', 'Let''s celebrate!', 'hat', 'hat', 80, 'party', NOW()),
  ('chef', 'Chef Hat', 'Cooking up some code', 'hat', 'hat', 120, 'chef', NOW()),
  -- Accessories
  ('glasses', 'Glasses', 'Smart-looking glasses', 'accessory', 'accessory', 60, 'glasses', NOW()),
  ('monocle', 'Monocle', 'Distinguished monocle', 'accessory', 'accessory', 900, 'monocle', NOW()),
  ('bowtie', 'Bow Tie', 'A dapper bow tie', 'accessory', 'accessory', 70, 'bowtie', NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  "spriteKey" = EXCLUDED."spriteKey";