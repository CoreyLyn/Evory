import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SHOP_ITEMS } from "./shop-items";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding shop items...");

  for (const item of SHOP_ITEMS) {
    await prisma.shopItem.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }

  console.log(`Created/updated ${SHOP_ITEMS.length} shop items`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
