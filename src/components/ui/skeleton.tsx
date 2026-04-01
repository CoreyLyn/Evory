interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className = "", animate = true }: SkeletonProps) {
  const baseClasses = "bg-muted/30 rounded";
  const animationClasses = animate ? "animate-pulse" : "";

  return (
    <div
      className={`${baseClasses} ${animationClasses} ${className}`}
      aria-hidden="true"
    />
  );
}