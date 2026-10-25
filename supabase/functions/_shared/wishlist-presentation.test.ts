import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maintainWishlist,
  expiresAfterTwoYears,
} from "./wishlist-lifecycle.ts";
import { groupedPoints, birthdayOrder, eventWishes } from "./presentation.ts";
import { draw } from "./rules.ts";
test("wishlist expiry uses two calendar years and retains historical event choices", () => {
  const d: any = {
    wishlist: [
      {
        id: "old",
        owner: "a",
        name: "Book",
        link: "",
        addedAt: "2024-02-29T10:00:00Z",
      },
      { id: "new", owner: "a", name: "New", addedAt: "2026-10-25T00:00:00Z" },
    ],
    ledger: [],
    events: [
      {
        person: "a",
        options: [
          {
            id: "saved",
            kind: "wishlist",
            sourceWishlistId: "old",
            votes: ["b"],
          },
        ],
      },
    ],
  };
  maintainWishlist(d, new Date("2026-02-28T10:00:00Z"));
  assert.equal(
    expiresAfterTwoYears("2024-02-29T10:00:00Z"),
    "2026-02-28T10:00:00.000Z",
  );
  assert.deepEqual(
    d.wishlist.map((w: any) => w.id),
    ["new"],
  );
  assert.equal(d.events[0].options[0].id, "saved");
  assert.deepEqual(d.events[0].options[0].votes, ["b"]);
  assert(d.events[0].options[0].expiresAt);
});
test("legacy wishlist timestamps use award history, then an explicit tracking start", () => {
  const d: any = {
    wishlist: [
      { id: "a", name: "Book", owner: "member", link: "" },
      { id: "b", name: "Unknown", owner: "member" },
    ],
    ledger: [
      {
        user: "member",
        key: "wishlist:member:book:",
        at: "2025-01-02T00:00:00Z",
      },
    ],
    events: [],
  };
  maintainWishlist(d, new Date("2026-10-25T00:00:00Z"));
  assert.equal(d.wishlist[0].addedAt, "2025-01-02T00:00:00Z");
  assert.equal(d.wishlist[0].addedDateEstimated, false);
  assert.equal(d.wishlist[1].addedDateEstimated, true);
  const added = d.wishlist[1].addedAt;
  maintainWishlist(d, new Date("2026-10-26T00:00:00Z"));
  assert.equal(d.wishlist[1].addedAt, added);
});
test("one wishlist view merges current items with snapshots without duplicating wishes", () => {
  const e = {
    date: "2099-01-01",
    options: [
      {
        id: "saved",
        kind: "wishlist",
        sourceWishlistId: "one",
        name: "Book",
        link: "",
        votes: ["b"],
      },
    ],
    currentWishlist: [
      { id: "one", name: "Book", link: "" },
      { id: "two", name: "Another", link: "" },
    ],
  };
  const wishes = eventWishes(e);
  assert.equal(wishes.length, 2);
  assert.equal(wishes[0].votable, true);
  assert.equal(wishes[1].votable, false);
  assert.deepEqual(wishes[0].votes, ["b"]);
});
test("point reasons aggregate and members sort by birthday", () => {
  assert.deepEqual(
    groupedPoints(
      [
        { user: "a", reason: "Wishlist item", points: 1 },
        { user: "a", reason: "Wishlist item", points: 1 },
        { user: "a", reason: "Wishlist item", points: 1 },
        { user: "b", reason: "Wishlist item", points: 9 },
      ],
      "a",
    ),
    [{ reason: "Wishlist item", points: 3 }],
  );
  assert.deepEqual(
    [
      { name: "C", birthday: "12-01" },
      { name: "A", birthday: "01-31" },
      { name: "B", birthday: "02-01" },
    ]
      .sort(birthdayOrder)
      .map((p) => p.name),
    ["A", "B", "C"],
  );
});
test("organiser draws always exclude administrators", () => {
  for (let i = 0; i < 10; i++) {
    const r = draw(
      [
        { id: "birthday" },
        { id: "admin", admin: true },
        { id: "b" },
        { id: "c" },
      ],
      "birthday",
      [],
    );
    assert.deepEqual(new Set([r.gift, r.cake]), new Set(["b", "c"]));
  }
});
