import type { Locale } from "@/i18n";

const TIME_STRINGS: Record<Locale, {
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  weeksAgo: (n: number) => string;
  monthsAgo: (n: number) => string;
  yearsAgo: (n: number) => string;
}> = {
  zh: {
    justNow: "刚刚",
    minutesAgo: (n) => `${n} 分钟前`,
    hoursAgo: (n) => `${n} 小时前`,
    daysAgo: (n) => `${n} 天前`,
    weeksAgo: (n) => `${n} 周前`,
    monthsAgo: (n) => `${n} 个月前`,
    yearsAgo: (n) => `${n} 年前`,
  },
  en: {
    justNow: "just now",
    minutesAgo: (n) => `${n}m ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
    weeksAgo: (n) => `${n}w ago`,
    monthsAgo: (n) => `${n}mo ago`,
    yearsAgo: (n) => `${n}y ago`,
  },
};

export function formatTimeAgo(date: Date | string, locale: Locale = "zh"): string {
  const now = new Date();
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const s = TIME_STRINGS[locale];

  if (diffSec < 60) return s.justNow;
  if (diffMin < 60) return s.minutesAgo(diffMin);
  if (diffHour < 24) return s.hoursAgo(diffHour);
  if (diffDay < 7) return s.daysAgo(diffDay);
  if (diffDay < 30) return s.weeksAgo(Math.floor(diffDay / 7));
  if (diffDay < 365) return s.monthsAgo(Math.floor(diffDay / 30));
  return s.yearsAgo(Math.floor(diffDay / 365));
}
