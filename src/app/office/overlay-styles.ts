import type { CSSProperties } from "react";

type OfficeResolvedTheme = "light" | "dark" | undefined;

export const OFFICE_SIDEBAR_TOGGLE_CLASS =
  "border border-card-border/50 bg-background/60 shadow-xl hover:bg-background/80 backdrop-blur-xl";

export const OFFICE_SIDEBAR_SURFACE_CLASS =
  "border-r border-card-border/50 bg-background/80 shadow-2xl backdrop-blur-2xl";

export const OFFICE_HEADER_BADGE_CLASS =
  "text-slate-600 bg-[rgba(15,23,42,0.05)] dark:text-muted dark:bg-foreground/5";

export const OFFICE_SEARCH_INPUT_CLASS =
  "border border-card-border/40 bg-foreground/[0.02] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/35";

export const OFFICE_FILTER_ACTIVE_CLASS =
  "bg-accent/12 text-accent ring-1 ring-accent/15";

export const OFFICE_FILTER_IDLE_CLASS =
  "bg-[rgba(15,23,42,0.045)] text-slate-500 hover:bg-[rgba(15,23,42,0.07)] hover:text-slate-700 dark:bg-foreground/5 dark:text-muted dark:hover:text-foreground";

export const OFFICE_AGENT_ROW_IDLE_CLASS =
  "hover:bg-[rgba(15,23,42,0.035)]";

export const OFFICE_AGENT_ROW_SELECTED_CLASS =
  "bg-accent/10 ring-1 ring-accent/20";

export const OFFICE_LEGEND_SURFACE_CLASS =
  "border border-card-border/50 bg-background/60 shadow-xl backdrop-blur-xl";

export const OFFICE_DETAIL_CARD_SURFACE_CLASS =
  "border border-card-border/60 bg-card/80 shadow-2xl backdrop-blur-2xl";

export const OFFICE_DETAIL_BANNER_FADE_CLASS =
  "bg-gradient-to-t from-white via-white/40 to-transparent dark:from-background/90 dark:via-transparent dark:to-transparent";

export const OFFICE_DETAIL_CLOSE_BUTTON_CLASS =
  "bg-background/40 text-muted hover:text-foreground hover:bg-card";

export const OFFICE_DETAIL_AVATAR_CLASS =
  "border-slate-200/85 bg-white dark:border-card-border dark:bg-background-alt";

export const OFFICE_STAT_CARD_CLASS =
  "border border-card-border/50 bg-card";

export const OFFICE_INFO_CARD_CLASS =
  "border border-card-border/50 bg-card/50";

function lightOnlyStyle(
  theme: OfficeResolvedTheme,
  style: CSSProperties
): CSSProperties | undefined {
  return theme === "light" ? style : undefined;
}

export function getOfficeSidebarToggleStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.96)",
    borderColor: "rgba(203, 213, 225, 0.88)",
    boxShadow: "0 18px 48px -28px rgba(15, 23, 42, 0.28)",
    backdropFilter: "none",
  });
}

export function getOfficeSidebarSurfaceStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.985)",
    borderRightColor: "rgba(203, 213, 225, 0.92)",
    boxShadow: "0 24px 64px -32px rgba(15, 23, 42, 0.28)",
    backdropFilter: "none",
  });
}

export function getOfficeSearchInputStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.96)",
    borderColor: "rgba(203, 213, 225, 0.9)",
  });
}

export function getOfficeLegendSurfaceStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(203, 213, 225, 0.9)",
    boxShadow: "0 18px 48px -28px rgba(15, 23, 42, 0.26)",
    backdropFilter: "none",
  });
}

export function getOfficeDetailCardStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.985)",
    borderColor: "rgba(203, 213, 225, 0.92)",
    boxShadow: "0 32px 90px -38px rgba(15, 23, 42, 0.34)",
    backdropFilter: "none",
  });
}

export function getOfficeStatCardStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(226, 232, 240, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.98)",
  });
}

export function getOfficeInfoCardStyle(theme: OfficeResolvedTheme): CSSProperties | undefined {
  return lightOnlyStyle(theme, {
    background: "rgba(248, 250, 252, 0.9)",
    borderColor: "rgba(226, 232, 240, 0.92)",
  });
}
