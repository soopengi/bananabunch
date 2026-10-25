import { test } from "node:test";
import assert from "node:assert/strict";
import { postMessage } from "./discussions.ts";
import { syncWishlistOptions } from "./wishlist-sync.ts";
import { visible } from "./rules.ts";
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
test("birthday chat supports replies and safe retries", () => {
  const d = fixture(),
    e = d.events[0];
  const root = postMessage(d, e, "alice", {
    text: " Hello bunch ",
    clientId: "request-0001",
  });
  assert.equal(root.text, "Hello bunch");
  const reply = postMessage(d, e, "bob", {
    text: "Hello!",
    replyTo: root.id,
    clientId: "request-0002",
  });
  assert.equal(reply.parentId, root.id);
  assert.equal(
    postMessage(d, e, "alice", {
      text: "Hello bunch",
      clientId: "request-0001",
    }).id,
    root.id,
  );
  assert.equal(e.messages.length, 2);
});
test("gift discussions cannot reply across conversations", () => {
  const d = fixture(),
    e = d.events[0];
  const comment = postMessage(d, e, "alice", {
    text: "Nice idea",
    option: "idea",
    clientId: "request-0001",
  });
  assert.throws(() =>
    postMessage(d, e, "bob", {
      text: "Cross reply",
      replyTo: comment.id,
      clientId: "request-0002",
    }),
  );
  const reply = postMessage(d, e, "bob", {
    text: "Agreed",
    option: "idea",
    replyTo: comment.id,
    clientId: "request-0003",
  });
  assert.equal(reply.optionId, "idea");
  assert.throws(() =>
    postMessage(d, e, "bob", {
      text: "No",
      option: "missing",
      clientId: "request-0004",
    }),
  );
});
test("birthday owners and inactive users cannot read or post event discussions", () => {
  const d = fixture(),
    e = d.events[0];
  for (const user of ["birthday", "disabled", "stranger"])
    assert.throws(() =>
      postMessage(d, e, user, { text: "No", clientId: "request-0001" }),
    );
  postMessage(d, e, "alice", { text: "Surprise", clientId: "request-0001" });
  assert.equal(visible(d, "birthday").events.length, 0);
  assert.equal(visible(d, "bob").events[0].messages[0].text, "Surprise");
});
test("messages validate length and rate limit without losing existing messages", () => {
  const d = fixture(),
    e = d.events[0];
  for (const text of [" ", "x".repeat(2001)])
    assert.throws(() =>
      postMessage(d, e, "alice", { text, clientId: "request-0001" }),
    );
  for (let i = 0; i < 12; i++)
    postMessage(d, e, "alice", { text: "Hello", clientId: "request-000" + i });
  assert.throws(() =>
    postMessage(d, e, "alice", { text: "One more", clientId: "request-0012" }),
  );
  assert.equal(e.messages.length, 12);
});
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
