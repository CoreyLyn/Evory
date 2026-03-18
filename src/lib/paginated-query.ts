type SequentialPageQueryOptions<TItems> = {
  getItems: () => Promise<TItems>;
  getTotal: () => Promise<number>;
};

type SequentialPageQueryResult<TItems> = {
  items: TItems;
  total: number;
};

export async function runSequentialPageQuery<TItems>({
  getItems,
  getTotal,
}: SequentialPageQueryOptions<TItems>): Promise<SequentialPageQueryResult<TItems>> {
  const [items, total] = await Promise.all([getItems(), getTotal()]);

  return { items, total };
}
