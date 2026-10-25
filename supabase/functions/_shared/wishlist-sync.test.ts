import { test } from "node:test";
import assert from "node:assert/strict";
import { syncWishlistOptions } from "./wishlist-sync.ts";
function fixture() {
  return {
    people: [
      { id: "birthday" },
      { id: "alice" },
      { id: "bob" },
      { id: "disabled", disabled: true },
    ],
    events: [
      {
        id: "event",
        person: "birthday",
        status: "Voting open",
        deadline: "2099-12-01T00:00:00Z",
        options: [{ id: "idea", kind: "suggestion", votes: [] }],
      },
    ],
    wishlist: [],
    ledger: [],
    history: [],
    notifications: [],
  } as any;
}
test("new wishlist items appear in existing votes and sync idempotently", () => {
  const d = fixture(),
    e = d.events[0];
  d.wishlist.push({
    id: "wish",
    owner: "birthday",
    name: "Book",
    link: "https://example.test/book",
    photo: "photo",
  });
  syncWishlistOptions(d);
  const w = e.options.find((o: any) => o.sourceWishlistId === "wish");
  assert(w);
  w.votes.push("alice");
  d.wishlist.push({ id: "wish2", owner: "birthday", name: "Cake stand" });
  syncWishlistOptions(d);
  syncWishlistOptions(d);
  assert.equal(e.options.length, 3);
  assert.deepEqual(w.votes, ["alice"]);
  assert.equal(w.photo, "photo");
});
test("legacy wishlist snapshots retain votes and closed votes remain unchanged", () => {
  const d = fixture(),
    e = d.events[0];
  e.options.push({
    id: "old",
    kind: "wishlist",
    name: "Book",
    link: "",
    votes: ["alice"],
  });
  d.wishlist.push({ id: "wish", owner: "birthday", name: "Book", link: "" });
  syncWishlistOptions(d);
  assert.equal(e.options.length, 2);
  assert.equal(e.options[1].sourceWishlistId, "wish");
  d.wishlist[0].name = "Edited book";
  syncWishlistOptions(d);
  assert.equal(e.options.length, 2);
  assert.equal(e.options[1].name, "Book");
  assert.deepEqual(e.options[1].votes, ["alice"]);
  e.status = "Gift selected";
  d.wishlist.push({ id: "later", owner: "birthday", name: "Later" });
  syncWishlistOptions(d);
  assert.equal(e.options.length, 2);
});
