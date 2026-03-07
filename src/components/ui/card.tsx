export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-card-border/50 bg-card/60 backdrop-blur-md p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  );
}
