"use client";

import { useCallback } from "react";
import { useLocale } from "@/i18n";
import { formatTimeAgo } from "./format";

export function useFormatTimeAgo() {
  const { locale } = useLocale();
  return useCallback(
    (date: Date | string) => formatTimeAgo(date, locale),
    [locale]
  );
}
