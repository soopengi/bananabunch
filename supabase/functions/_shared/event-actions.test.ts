import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeRole,
  undoCompleteRole,
  setBudget,
  selectGift,
} from "./event-actions.ts";
import { runJobs } from "./rules.ts";
function fixture() {
  const e: any = {
    id: "birthday",
    person: "birthday-person",
    gift: "gift-person",
    cake: "cake-person",
    status: "Voting open",
    created: "2026-10-24T00:00:00Z",
    deadline: "2026-11-07T00:00:00Z",
    date: "2026-11-09",
    tasks: {},
    audit: [],
    options: [
      {
        id: "first",
        name: "Pottery",
        kind: "suggestion",
        by: "friend",
        votes: [],
      },
      {
        id: "second",
        name: "Plant",
        kind: "wishlist",
        by: "birthday-person",
        votes: ["friend"],
      },
    ],
  };
  return {
    e,
    d: {
      events: [e],
      people: [
        { id: "birthday-person", name: "Emma" },
        { id: "gift-person" },
        { id: "cake-person" },
        { id: "friend" },
        { id: "admin", admin: true },
      ],
      ledger: [],
      notifications: [],
      history: [],
      wishlist: [],
      settings: {
        timezone: "Australia/Sydney",
        weights: { gift: 15, cake: 10, selected: 10 },
      },
    } as any,
  };
}
test("members can complete only their assigned responsibility", () => {
  for (const role of ["gift", "cake"]) {
    const { d, e } = fixture();
    for (const user of [
      "friend",
      "birthday-person",
      role === "gift" ? "cake-person" : "gift-person",
    ])
      assert.throws(() => completeRole(d, e, user, role));
    completeRole(d, e, role + "-person", role);
    assert.equal(e.tasks[role + " complete"], true);
    assert.equal(d.ledger.length, 1);
  }
});
test("one organiser can complete both assigned roles, once each", () => {
  const { d, e } = fixture();
  e.cake = e.gift;
  completeRole(d, e, e.gift, "gift");
  completeRole(d, e, e.gift, "cake");
  completeRole(d, e, e.gift, "cake");
  assert.equal(e.status, "Completed");
  assert.deepEqual(
    d.ledger.map((l: any) => l.points),
    [15, 10],
  );
});
test("organisers can change their own budgets and refresh keeps saved amounts", () => {
  const { d, e } = fixture();
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  assert.deepEqual(e.budgets, {
    gift: { amount: 200, currency: "AUD" },
    cake: { amount: 75, currency: "AUD" },
  });
  assert.throws(() => setBudget(e, "cake-person", "gift", 300, "AUD"));
  assert.throws(() => setBudget(e, "admin", "gift", 300, "AUD"));
  setBudget(e, "gift-person", "gift", 250.25, "AUD");
  setBudget(e, "cake-person", "cake", 0, "NZD");
  runJobs(d, new Date("2026-10-26T00:00:00Z"));
  assert.deepEqual(e.budgets, {
    gift: { amount: 250.25, currency: "AUD" },
    cake: { amount: 0, currency: "NZD" },
  });
  for (const amount of [-1, "", null, Infinity, 1.001])
    assert.throws(() => setBudget(e, "gift-person", "gift", amount, "AUD"));
  assert.throws(() => setBudget(e, "gift-person", "gift", 200, "BAD"));
  assert(
    e.audit.some(
      (a: any) => a.action === "budget changed" && a.by === "gift-person",
    ),
  );
});

test("gift organiser can select before deadline and lock voting permanently", () => {
  const { d, e } = fixture();
  assert.throws(() => selectGift(d, e, "friend", "first"));
  assert.throws(() => selectGift(d, e, "cake-person", "first"));
  selectGift(d, e, "gift-person", "first");
  assert.equal(e.status, "Gift selected");
  assert.equal(e.final, "first");
  assert.equal(e.audit[0].action, "gift selected early");
  assert.throws(() => selectGift(d, e, "gift-person", "second"));
  runJobs(d, new Date("2026-11-08T00:00:00Z"));
  assert.equal(e.final, "first");
  assert.equal(d.ledger.length, 1);
});
test("post-vote tie selection stays restricted to leaders", () => {
  const { d, e } = fixture();
  e.status = "Decision needed";
  e.leaders = ["second"];
  assert.throws(() => selectGift(d, e, "gift-person", "first"));
  selectGift(d, e, "gift-person", "second");
  assert.equal(e.final, "second");
  assert.equal(d.ledger.length, 0);
});
test("gift organiser can confirm several gifts together", () => {
  const { d, e } = fixture();
  selectGift(d, e, "gift-person", ["first", "second"]);
  assert.deepEqual(e.finals, ["first", "second"]);
  assert.equal(e.final, "first");
  assert.equal(e.status, "Gift selected");
  assert.equal(e.audit[0].action, "gifts selected early");
  assert.equal(d.ledger.length, 1);
});

test("admins complete either responsibility for its organiser and retries never duplicate points", () => {
  const { d, e } = fixture();
  completeRole(d, e, "admin", "gift");
  completeRole(d, e, "admin", "cake");
  completeRole(d, e, "admin", "gift");
  assert.equal(e.status, "Completed");
  assert.deepEqual(
    d.ledger.map((l: any) => l.user),
    ["gift-person", "cake-person"],
  );
  assert(e.audit.every((a: any) => a.by === "admin" && a.adminOverride));
});
test("disabled admins and birthday admins cannot complete private event tasks", () => {
  const { d, e } = fixture();
  d.people.find((p: any) => p.id === "admin").disabled = true;
  assert.throws(() => completeRole(d, e, "admin", "gift"));
  d.people[0].admin = true;
  assert.throws(() => completeRole(d, e, e.person, "cake"));
});

test("undo completion restores status, removes points, and preserves the other role", () => {
  const { d, e } = fixture();
  completeRole(d, e, "admin", "gift");
  completeRole(d, e, "admin", "cake");
  assert.equal(e.status, "Completed");
  assert.throws(() => undoCompleteRole(d, e, "friend", "gift"));
  undoCompleteRole(d, e, "gift-person", "gift");
  assert.equal(e.status, "Voting open");
  assert.equal(e.tasks["gift complete"], undefined);
  assert(e.tasks["cake complete"]);
  assert.equal(d.ledger.length, 1);
  undoCompleteRole(d, e, "admin", "gift");
  assert.equal(d.ledger.length, 1);
  completeRole(d, e, "admin", "gift");
  assert.equal(d.ledger.length, 2);
  assert.equal(e.status, "Completed");
});
