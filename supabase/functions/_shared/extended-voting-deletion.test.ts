import { test } from "node:test";
import assert from "node:assert/strict";
import { runJobs } from "./rules.ts";
import { votingOpen } from "./voting.ts";
import { addSuggestion, editSuggestion } from "./ideas.ts";
import { selectGift } from "./event-actions.ts";
import { deleteUser } from "./user-deletion.ts";
function fixture() {
  return {
    people: [
      { id: "birthday", name: "Birthday" },
      { id: "admin", admin: true },
      { id: "gift", name: "Gift" },
      { id: "cake", name: "Cake" },
    ],
    events: [
      {
        id: "e",
        person: "birthday",
        gift: "gift",
        cake: "cake",
        date: "2026-11-08",
        created: "2026-10-08T00:00:00Z",
        deadline: "2026-10-24T13:00:00Z",
        status: "Voting open",
        options: [],
        tasks: {},
        audit: [],
      },
    ],
    history: [],
    notifications: [],
    ledger: [],
    wishlist: [],
    settings: { timezone: "Australia/Sydney", weights: { selected: 10 } },
  } as any;
}
test("empty voting extends indefinitely, accepts ideas and edits, and only organiser chooses", () => {
  const d = fixture(),
    e = d.events[0];
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  assert.equal(e.status, "Decision needed");
  assert.equal(e.deadline, null);
  assert.equal(e.votingExtended, true);
  assert(votingOpen(e, new Date("2030-01-01T00:00:00Z")));
  addSuggestion(
    e,
    { id: "new", name: "New gift", link: "", votes: [] },
    "cake",
  );
  editSuggestion(
    e,
    "new",
    {
      name: "A better gift",
      description: "",
      link: "",
      photo: "",
      price: 25,
      currency: "AUD",
    },
    "gift",
  );
  runJobs(d, new Date("2027-01-01T00:00:00Z"));
  assert.equal(e.final, undefined);
  assert.throws(() => selectGift(d, e, "cake", "new"));
  selectGift(d, e, "gift", "new");
  assert.equal(e.final, "new");
  assert.equal(e.votingExtended, false);
  assert(!votingOpen(e));
  assert.throws(() => addSuggestion(e, { name: "Too late" }, "cake"));
});
test("ties extend, existing decisions reopen, and new wishes join extended votes", () => {
  const d = fixture(),
    e = d.events[0];
  e.options = [
    { id: "a", kind: "wishlist", votes: ["gift"] },
    { id: "b", kind: "wishlist", votes: ["cake"] },
  ];
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  assert(votingOpen(e));
  d.wishlist.push({
    id: "wish",
    owner: "birthday",
    name: "Late wish",
    addedAt: "2026-10-25T00:00:00Z",
  });
  runJobs(d, new Date("2026-10-26T00:00:00Z"));
  const wish = e.options.find((o: any) => o.sourceWishlistId === "wish");
  assert(wish);
  selectGift(d, e, "gift", wish.id);
  assert.equal(e.final, wish.id);
  const old = fixture();
  old.events[0].status = "Decision needed";
  runJobs(old, new Date("2026-10-25T00:00:00Z"));
  assert(old.events[0].votingExtended);
});
test("a clear winner at the scheduled close stays selected and does not extend", () => {
  const d = fixture(),
    e = d.events[0];
  e.options = [
    {
      id: "winner",
      kind: "suggestion",
      name: "Gift",
      by: "gift",
      votes: ["cake"],
    },
  ];
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  assert.equal(e.final, "winner");
  assert.equal(e.votingExtended, false);
  runJobs(d, new Date("2030-01-01T00:00:00Z"));
  assert.equal(e.final, "winner");
  assert(!votingOpen(e));
});
test("deletion requires an admin, prevents self deletion and preserves historic references", () => {
  const d = fixture();
  assert.throws(() => deleteUser(d, "cake", "gift"));
  assert.throws(() => deleteUser(d, "admin", "admin"));
  d.events.push({
    id: "old",
    date: "2025-11-01",
    person: "birthday",
    gift: "gift",
    cake: "cake",
    status: "Completed",
    messages: [{ user: "gift", text: "An old comment" }],
  });
  deleteUser(d, "admin", "gift", new Date("2026-10-25T00:00:00Z"));
  const p = d.people.find((p: any) => p.id === "gift");
  assert(p.disabled && p.deletedAt);
  assert.equal(d.events[0].gift, null);
  assert.equal(d.events[1].gift, "gift");
  assert.equal(d.events[1].messages[0].text, "An old comment");
  deleteUser(d, "admin", "gift");
  assert.equal(d.accountAudit.length, 1);
});
test("deleting a birthday member cancels their upcoming plan without erasing it", () => {
  const d = fixture();
  deleteUser(d, "admin", "birthday", new Date("2026-10-25T00:00:00Z"));
  runJobs(d, new Date("2026-10-26T00:00:00Z"));
  assert.equal(d.events[0].status, "Cancelled");
  assert(d.events[0].cancelled);
  assert(!votingOpen(d.events[0]));
  assert.equal(d.events.length, 1);
});
