const variants = {
  default: "bg-accent/12 text-accent border border-accent/15",
  success: "bg-success/12 text-success border border-success/15",
  warning: "bg-warning/12 text-warning border border-warning/15",
  muted: "bg-muted/10 text-muted/80 border border-muted/10",
  danger: "bg-danger/12 text-danger border border-danger/15",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
