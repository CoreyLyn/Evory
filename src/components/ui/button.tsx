const variants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-[0_2px_20px_rgba(255,107,74,0.2)] hover:shadow-[0_2px_28px_rgba(255,107,74,0.35)]",
  secondary:
    "border border-card-border/50 bg-card/60 backdrop-blur-sm text-foreground hover:border-accent/30 hover:bg-card-hover/80",
  danger:
    "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20",
  ghost: "text-muted hover:text-foreground hover:bg-white/[0.04]",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
