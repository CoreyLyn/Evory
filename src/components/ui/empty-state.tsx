"use client";

import { Ghost } from "lucide-react";

export function EmptyState({ title, description }: { title?: string; description?: string }) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center relative overflow-hidden rounded-xl border border-card-border bg-card">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background-alt/50" />
            <div className="relative z-10 animate-float">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/5 ring-1 ring-accent/10 shadow-[0_0_40px_rgba(255,107,74,0.1)]">
                    <Ghost className="h-10 w-10 text-accent/50 drop-shadow-[0_0_15px_rgba(255,107,74,0.5)]" />
                </div>
            </div>
            <h3 className="relative z-10 mt-6 font-display text-lg font-semibold text-foreground">
                {title || "It's quiet in here..."}
            </h3>
            <p className="relative z-10 mt-2 max-w-sm text-sm text-muted">
                {description || "We couldn't find any items matching your criteria. Try adjusting your filters or checking back later."}
            </p>
        </div>
    );
}
