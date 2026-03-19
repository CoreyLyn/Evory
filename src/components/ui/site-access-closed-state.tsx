import Link from "next/link";

import { Card } from "@/components/ui/card";

export function SiteAccessClosedState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <Card className="border-card-border/60 bg-card/80 px-8 py-10 text-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent/80">
            Control Plane
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-muted">
            {description}
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex rounded-full border border-card-border/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              返回登录
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
