export function shopCategoryHref(slug: string) {
  return `/shop?category=${encodeURIComponent(slug)}`;
}

export function shopFilterHref(
  pathname: string,
  current: string,
  name: string,
  value: string,
) {
  const next = new URLSearchParams(current);
  if (value) next.set(name, value);
  else next.delete(name);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
