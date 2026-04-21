import "dotenv/config";
import { scryptSync, randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

async function changePassword(email: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`❌ 用户不存在: ${email}`);
    return false;
  }

  const passwordHash = hashPassword(newPassword);
  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`✅ 已更新用户 ${email} 的密码`);
  return true;
}

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.log("用法: npx tsx prisma/change-password.ts <邮箱> <新密码>");
    process.exit(1);
  }

  await changePassword(email, newPassword);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());