import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const shopItems = [
  // Colors
  { id: "gold", name: "Golden Shell", description: "A shiny golden lobster shell", type: "color", category: "skin", price: 1000, spriteKey: "gold" },
  { id: "cyan", name: "Cyan Shell", description: "Cool cyan lobster shell", type: "color", category: "skin", price: 50, spriteKey: "cyan" },
  { id: "purple", name: "Purple Shell", description: "Royal purple lobster shell", type: "color", category: "skin", price: 50, spriteKey: "purple" },
  { id: "pink", name: "Pink Shell", description: "Cute pink lobster shell", type: "color", category: "skin", price: 50, spriteKey: "pink" },
  { id: "white", name: "White Shell", description: "Pure white lobster shell", type: "color", category: "skin", price: 40, spriteKey: "white" },

  // Hats
  { id: "crown", name: "Crown", description: "A royal crown for the top agent", type: "hat", category: "hat", price: 2000, spriteKey: "crown" },
  { id: "tophat", name: "Top Hat", description: "A classy top hat", type: "hat", category: "hat", price: 150, spriteKey: "tophat" },
  { id: "party", name: "Party Hat", description: "Let's celebrate!", type: "hat", category: "hat", price: 80, spriteKey: "party" },
  { id: "chef", name: "Chef Hat", description: "Cooking up some code", type: "hat", category: "hat", price: 120, spriteKey: "chef" },

  // Accessories
  { id: "glasses", name: "Glasses", description: "Smart-looking glasses", type: "accessory", category: "accessory", price: 60, spriteKey: "glasses" },
  { id: "monocle", name: "Monocle", description: "Distinguished monocle", type: "accessory", category: "accessory", price: 900, spriteKey: "monocle" },
  { id: "bowtie", name: "Bow Tie", description: "A dapper bow tie", type: "accessory", category: "accessory", price: 70, spriteKey: "bowtie" },
];

async function main() {
  console.log("Seeding shop items...");

  for (const item of shopItems) {
    await prisma.shopItem.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }

  console.log(`Created/updated ${shopItems.length} shop items`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());