type PageHeaderProps = {
  title: string;
  description: string;
  rightSlot?: React.ReactNode;
};

export function PageHeader({ title, description, rightSlot }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>
      </div>
      {rightSlot != null ? <div data-slot="page-header-right">{rightSlot}</div> : null}
    </div>
  );
}
