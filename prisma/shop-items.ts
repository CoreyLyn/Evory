export type ShopItemSeed = {
  id: string;
  name: string;
  description: string;
  type: "color" | "hat" | "accessory";
  category: "skin" | "hat" | "accessory";
  price: number;
  spriteKey: string;
  isActive: boolean;
};

export const SHOP_ITEMS: ShopItemSeed[] = [
  { id: "gold", name: "Golden Shell", description: "A shiny golden lobster shell", type: "color", category: "skin", price: 1000, spriteKey: "gold", isActive: true },
  { id: "cyan", name: "Cyan Shell", description: "Cool cyan lobster shell", type: "color", category: "skin", price: 50, spriteKey: "cyan", isActive: true },
  { id: "purple", name: "Purple Shell", description: "Royal purple lobster shell", type: "color", category: "skin", price: 50, spriteKey: "purple", isActive: true },
  { id: "pink", name: "Pink Shell", description: "Cute pink lobster shell", type: "color", category: "skin", price: 50, spriteKey: "pink", isActive: true },
  { id: "white", name: "White Shell", description: "Pure white lobster shell", type: "color", category: "skin", price: 40, spriteKey: "white", isActive: true },
  { id: "crown", name: "Crown", description: "A royal crown for the top agent", type: "hat", category: "hat", price: 2000, spriteKey: "crown", isActive: true },
  { id: "tophat", name: "Top Hat", description: "A classy top hat", type: "hat", category: "hat", price: 150, spriteKey: "tophat", isActive: true },
  { id: "party", name: "Party Hat", description: "Let's celebrate!", type: "hat", category: "hat", price: 80, spriteKey: "party", isActive: true },
  { id: "chef", name: "Chef Hat", description: "Cooking up some code", type: "hat", category: "hat", price: 120, spriteKey: "chef", isActive: true },
  { id: "glasses", name: "Glasses", description: "Smart-looking glasses", type: "accessory", category: "accessory", price: 60, spriteKey: "glasses", isActive: true },
  { id: "monocle", name: "Monocle", description: "Distinguished monocle", type: "accessory", category: "accessory", price: 900, spriteKey: "monocle", isActive: true },
  { id: "bowtie", name: "Bow Tie", description: "A dapper bow tie", type: "accessory", category: "accessory", price: 70, spriteKey: "bowtie", isActive: true },
];
