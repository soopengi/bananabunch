import { votingOpen } from "./voting.ts";

function fingerprint(item: any) {
  return (
    String(item.name || "")
      .trim()
      .toLowerCase() +
    "|" +
    String(item.link || "").trim()
  );
}
export function syncWishlistOptions(data: any, now = new Date()) {
  for (const event of data.events) {
    if (!votingOpen(event, now)) continue;
    const wishes = data.wishlist.filter((w: any) => w.owner === event.person);
    const options = event.options.filter((o: any) => o.kind === "wishlist");
    const represented = new Set<string>();
    for (const option of options) {
      if (option.sourceWishlistId) {
        represented.add(option.sourceWishlistId);
        const source = wishes.find(
          (w: any) => w.id === option.sourceWishlistId,
        );
        if (source) {
          option.addedAt = source.addedAt;
          option.expiresAt = source.expiresAt;
          option.addedDateEstimated = source.addedDateEstimated;
        }
        continue;
      }
      const wish = wishes.find(
        (w: any) =>
          !represented.has(w.id) && fingerprint(w) === fingerprint(option),
      );
      if (wish) {
        option.sourceWishlistId = wish.id;
        option.addedAt = wish.addedAt;
        option.expiresAt = wish.expiresAt;
        option.addedDateEstimated = wish.addedDateEstimated;
        represented.add(wish.id);
      }
    }
    for (const wish of wishes) {
      if (represented.has(wish.id)) continue;
      event.options.push({
        ...wish,
        id: crypto.randomUUID(),
        sourceWishlistId: wish.id,
        kind: "wishlist",
        by: event.person,
        votes: [],
      });
      represented.add(wish.id);
    }
  }
}
export function currentEventWishlist(data: any, event: any) {
  return data.wishlist.filter((w: any) => w.owner === event.person);
}
