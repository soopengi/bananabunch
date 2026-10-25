import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localMidnight,
  birthdayDate,
  opensOn,
  draw,
  runJobs,
  visible,
  award,
} from "./rules.ts";
test("month clamp and leap birthday", () => {
  assert.equal(opensOn("2027-03-31"), "2027-02-28");
  assert.equal(opensOn("2028-03-31"), "2028-02-29");
  assert.equal(birthdayDate("02-29", 2027), "2027-02-28");
});
const people = [
  { id: "a", birthday: "11-08" },
  { id: "b", birthday: "12-05" },
  { id: "c", birthday: "01-02" },
  { id: "d", birthday: "02-03" },
  { id: "e", birthday: "04-04" },
];
test("draw excludes birthday person and respects shared cooldown", () => {
  const h = [
    { event: "previous", user: "b" },
    { event: "previous", user: "c" },
  ];
  const r = draw(people, "a", h, () => 0);
  assert.deepEqual(new Set([r.gift, r.cake]), new Set(["d", "e"]));
  assert.notEqual(r.gift, r.cake);
});
test("small groups leave roles unfilled", () => {
  const r = draw([{ id: "a" }, { id: "b" }], "a", [], () => 0);
  assert.equal(r.gift, "b");
  assert.equal(r.cake, null);
});
test("yearly organiser pool excludes chosen people and resets next year", () => {
  const history = [{ event: "one", user: "b", date: "2026-03-01" }];
  const thisYear = draw(
    [{ id: "a" }, { id: "b" }],
    "a",
    history,
    () => 0,
    "2026-11-01",
  );
  assert.equal(thisYear.gift, null);
  const nextYear = draw(
    [{ id: "a" }, { id: "b" }],
    "a",
    history,
    () => 0,
    "2027-02-01",
  );
  assert.equal(nextYear.gift, "b");
});
function fresh() {
  return {
    people: structuredClone(people),
    events: [],
    history: [],
    wishlist: [],
    notifications: [],
    ledger: [],
    settings: { timezone: "Australia/Sydney", weights: { selected: 10 } },
  } as any;
}
test("creation and notifications are retry safe", () => {
  const d = fresh();
  runJobs(d, new Date("2026-10-24T01:00:00Z"));
  const n = d.notifications.length;
  runJobs(d, new Date("2026-10-24T01:00:00Z"));
  assert.equal(d.events.length, 1);
  assert.equal(d.notifications.length, n);
  assert(d.notifications.every((n: any) => n.user !== "a"));
  assert.equal(d.history.length, 2);
});
test("self event excluded from event, history, notifications and unreleased rating", () => {
  const d = fresh();
  runJobs(d, new Date("2026-10-24T01:00:00Z"));
  award(d, "winning", "b", 10, "selected", d.events[0].id);
  const v = visible(d, "a");
  assert.equal(v.events.length, 0);
  assert.equal(v.history.length, 0);
  assert.equal(v.notifications.length, 0);
  assert.equal(v.ledger.length, 0);
});
test("ledger awards once", () => {
  const d = fresh();
  award(d, "key", "a", 10, "test");
  award(d, "key", "a", 10, "test");
  assert.equal(d.ledger.length, 1);
});
test("tie, no vote, and winner handling", () => {
  for (const type of ["tie", "none", "winner"]) {
    const d = fresh();
    runJobs(d, new Date("2026-10-24T01:00:00Z"));
    d.events[0].deadline = "2026-10-25T00:00:00Z";
    d.events[0].options = [
      {
        id: "one",
        votes: type === "none" ? [] : ["b"],
        kind: "suggestion",
        by: "b",
      },
      {
        id: "two",
        votes: type === "tie" ? ["c"] : [],
        kind: "wishlist",
        by: "a",
      },
    ];
    runJobs(d, new Date("2026-10-26T00:00:00Z"));
    assert.equal(
      d.events[0].status,
      type === "winner" ? "Gift selected" : "Decision needed",
    );
    runJobs(d, new Date("2026-10-26T00:00:00Z"));
    assert.equal(d.ledger.length, type === "winner" ? 1 : 0);
  }
});

test("birthday voting cap uses group timezone", () => {
  assert.equal(
    localMidnight("2026-11-08", "Australia/Sydney"),
    "2026-11-07T13:00:00.000Z",
  );
  assert.equal(
    localMidnight("2026-06-08", "Australia/Sydney"),
    "2026-06-07T14:00:00.000Z",
  );
});
