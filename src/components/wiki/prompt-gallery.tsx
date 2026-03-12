"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";

interface PromptSection {
  title: string;
  category: string;
  description: string;
  prompt: string;
}

interface PromptGalleryProps {
  prompts: PromptSection[];
}

export function PromptGallery({ prompts }: PromptGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");

  // Extract unique categories, adding "全部" as the default first option
  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(prompts.map((p) => p.category))
    );
    return ["全部", ...uniqueCategories];
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((prompt) => {
      const matchesSearch =
        prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prompt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prompt.prompt.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory =
        activeCategory === "全部" || prompt.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [prompts, searchQuery, activeCategory]);

  return (
    <div className="space-y-6">
      {/* Controls: Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-cyan text-white shadow-[0_0_15px_rgba(0,153,204,0.3)]"
                  : "bg-card/50 text-muted hover:bg-card hover:text-foreground border border-card-border/40"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        
        <div className="relative w-full sm:w-72">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search size={16} className="text-muted" />
          </div>
          <input
            type="text"
            placeholder="搜索提示词名称或内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-card-border/50 bg-background/50 py-2 pl-9 pr-4 text-sm text-foreground focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan backdrop-blur transition-all"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredPrompts.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-card-border p-12 text-center text-muted">
          <p className="text-sm">没有找到相关的提示词</p>
          <button 
            onClick={() => {setSearchQuery(""); setActiveCategory("全部");}}
            className="mt-2 text-xs text-cyan hover:underline transition-all"
          >
            清除过滤条件
          </button>
        </div>
      )}

      {/* Grid of Prompts */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredPrompts.map((section) => (
          <div
            key={section.title}
            className="group relative overflow-hidden rounded-2xl border border-card-border/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-cyan/30"
            style={{
              background: "var(--prompt-step-card-surface)",
              boxShadow: "var(--prompt-step-card-shadow)",
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-1 transition-opacity opacity-70 group-hover:opacity-100"
              style={{ backgroundImage: "var(--prompt-step-topline)" }}
            />
            <div className="relative mb-4 flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold text-accent transition-transform duration-300 group-hover:scale-110"
                style={{
                  background: "var(--prompt-step-badge-surface)",
                  borderColor: "var(--prompt-step-badge-border)",
                  boxShadow: "var(--prompt-step-badge-shadow)",
                }}
              >
                0{prompts.findIndex(p => p.title === section.title) + 1}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    {section.title}
                  </h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {section.description}
                </p>
              </div>
            </div>
            <div
              className="group/code relative overflow-hidden rounded-2xl border transition-colors duration-300 group-hover:border-cyan/20"
              style={{
                background: "var(--prompt-code-surface)",
                borderColor: "var(--prompt-code-border)",
                boxShadow: "var(--prompt-code-shadow)",
              }}
            >
              <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover/code:opacity-100">
                <CopyButton
                  value={section.prompt}
                  className="bg-card/80 shadow-sm backdrop-blur-md border border-card-border/50 text-foreground"
                  iconSize={14}
                />
              </div>
              <pre
                className="relative overflow-x-auto overflow-y-auto max-h-[360px] p-5 pr-12 text-xs leading-relaxed whitespace-pre-wrap select-all custom-scrollbar"
                style={{ color: "var(--prompt-code-foreground)" }}
              >
                {/* Basic pseudo-syntax highlighting for HTTP Methods and API paths */}
                <span dangerouslySetInnerHTML={{
                   __html: section.prompt
                     .replace(/(GET|POST|PUT|DELETE|PATCH)/g, '<span class="px-1 py-0.5 rounded bg-accent/10 text-accent font-mono font-semibold">$1</span>')
                     .replace(/(\/api\/[\w/{}?=-]+)/g, '<span class="text-cyan font-mono">$1</span>')
                     // Also highlight the JSON blocks slightly
                     .replace(/({[\s\S]*?})/g, '<span class="text-cyan/80 font-mono">$1</span>')
                 }} 
                />
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
