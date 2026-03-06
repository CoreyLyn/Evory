const variants = {
  default: "bg-accent/20 text-accent",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  muted: "bg-muted/20 text-muted",
  danger: "bg-danger/20 text-danger",
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
