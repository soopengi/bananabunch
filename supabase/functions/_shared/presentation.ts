export function groupedPoints(ledger: any[], user: string) {
  const groups = new Map<string, number>();
  for (const l of ledger.filter((l) => l.user === user))
    groups.set(l.reason, (groups.get(l.reason) || 0) + l.points);
  return [...groups]
    .map(([reason, points]) => ({ reason, points }))
    .filter((l) => l.points !== 0);
}
export function birthdayOrder(a: any, b: any) {
  return (
    (a.birthday || "99-99").localeCompare(b.birthday || "99-99") ||
    a.name.localeCompare(b.name)
  );
}
export function eventWishes(
  event: any,
  day = new Date().toISOString().slice(0, 10),
) {
  const result = event.options
    .filter(
      (o: any) =>
        o.kind === "wishlist" &&
        (event.date < day ||
          !o.expiresAt ||
          Date.parse(o.expiresAt) > Date.now()),
    )
    .map((o: any) => ({ ...o, votable: true }));
  const ids = new Set(result.map((o: any) => o.sourceWishlistId));
  for (const w of event.currentWishlist || [])
    if (
      !ids.has(w.id) &&
      !result.some((o: any) => o.name === w.name && o.link === w.link)
    )
      result.push({ ...w, votable: false });
  return result;
}
