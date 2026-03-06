const variants = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary:
    "border border-card-border bg-card text-foreground hover:border-accent/50",
  danger: "bg-danger/20 text-danger hover:bg-danger/30",
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
      className={`rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
