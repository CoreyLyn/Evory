import zh from "./zh";
import en from "./en";

const zhKeys = new Set(Object.keys(zh));
const enKeys = new Set(Object.keys(en));

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

let hasErrors = false;

if (missingInEn.length > 0) {
  console.error("Keys in zh.ts but missing in en.ts:");
  missingInEn.forEach((k) => console.error(`  - ${k}`));
  hasErrors = true;
}

if (missingInZh.length > 0) {
  console.error("Keys in en.ts but missing in zh.ts:");
  missingInZh.forEach((k) => console.error(`  - ${k}`));
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log(`i18n keys are consistent (${zhKeys.size} keys in both languages)`);
}
