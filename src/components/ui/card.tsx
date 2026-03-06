export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-card-border bg-card p-6 ${className}`}
    >
      {children}
    </div>
  );
}
