export function expiresAfterTwoYears(added: string) {
  const d = new Date(added);
  const year = d.getUTCFullYear() + 2;
  const day = Math.min(
    d.getUTCDate(),
    new Date(Date.UTC(year, d.getUTCMonth() + 1, 0)).getUTCDate(),
  );
  return new Date(
    Date.UTC(
      year,
      d.getUTCMonth(),
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  ).toISOString();
}
export function maintainWishlist(data: any, now = new Date()) {
  for (const w of data.wishlist) {
    if (!w.addedAt) {
      const award = data.ledger.find(
        (l: any) =>
          l.user === w.owner &&
          l.key ===
            "wishlist:" +
              w.owner +
              ":" +
              String(w.name).toLowerCase() +
              ":" +
              (w.link || ""),
      );
      w.addedAt = w.createdAt || award?.at || now.toISOString();
      w.addedDateEstimated = !w.createdAt && !award?.at;
    }
    w.expiresAt = expiresAfterTwoYears(w.addedAt);
  }
  for (const e of data.events || [])
    for (const o of e.options || []) {
      if (o.kind !== "wishlist") continue;
      const w = data.wishlist.find(
        (w: any) =>
          w.id === o.sourceWishlistId ||
          (!o.sourceWishlistId &&
            w.owner === e.person &&
            w.name === o.name &&
            w.link === o.link),
      );
      if (w) {
        o.sourceWishlistId = w.id;
        o.addedAt = w.addedAt;
        o.expiresAt = w.expiresAt;
        o.addedDateEstimated = w.addedDateEstimated;
      }
    }
  data.wishlist = data.wishlist.filter(
    (w: any) => Date.parse(w.expiresAt) > now.getTime(),
  );
}
