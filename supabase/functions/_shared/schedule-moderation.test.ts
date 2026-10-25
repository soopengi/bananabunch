import { test } from "node:test";
import assert from "node:assert/strict";
import { runJobs, closesOn, localMidnight } from "./rules.ts";
import { postMessage, deleteMessage } from "./discussions.ts";
function fixture() {
  return {
    people: [
      { id: "birthday", name: "Birthday", birthday: "11-20" },
      { id: "admin", admin: true },
      { id: "member" },
      { id: "inactive", admin: true, disabled: true },
    ],
    events: [],
    ledger: [],
    history: [],
    notifications: [],
    wishlist: [],
    settings: { timezone: "Australia/Sydney", weights: { selected: 10 } },
  } as any;
}
test("voting opens one calendar month before and closes exactly fourteen days before at local midnight", () => {
  const d = fixture();
  runJobs(d, new Date("2026-10-19T12:59:59Z"));
  assert.equal(d.events.length, 0);
  runJobs(d, new Date("2026-10-19T13:00:00Z"));
  const e = d.events[0];
  assert(e);
  assert.equal(e.status, "Voting open");
  assert.equal(e.votingOpensAt, "2026-10-19T13:00:00.000Z");
  assert.equal(e.deadline, "2026-11-05T13:00:00.000Z");
  runJobs(d, new Date("2026-11-05T12:59:59Z"));
  assert.equal(e.status, "Voting open");
  runJobs(d, new Date("2026-11-05T13:00:00Z"));
  assert.equal(e.status, "Decision needed");
  assert.equal(closesOn("2027-01-03"), "2026-12-20");
  assert.equal(closesOn("2028-03-01"), "2028-02-16");
});
test("late first visits and existing open events use birthday-relative deadlines", () => {
  const d = fixture();
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  const e = d.events[0];
  assert.equal(e.deadline, localMidnight("2026-11-06", "Australia/Sydney"));
  e.deadline = "2026-12-30T00:00:00Z";
  runJobs(d, new Date("2026-11-07T00:00:00Z"));
  assert.equal(e.status, "Decision needed");
  assert.equal(e.deadline, null);
  assert.equal(
    e.scheduledDeadline,
    localMidnight("2026-11-06", "Australia/Sydney"),
  );
  assert.equal(e.votingExtended, true);
  const late = fixture();
  runJobs(late, new Date("2026-11-10T00:00:00Z"));
  assert.equal(late.events[0].status, "Decision needed");
});
test("deadline reconciliation never reopens gifts already selected early", () => {
  const d = fixture();
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  const e = d.events[0];
  e.status = "Gift selected";
  e.final = "saved";
  runJobs(d, new Date("2026-11-07T00:00:00Z"));
  assert.equal(e.status, "Gift selected");
  assert.equal(e.final, "saved");
});
test("admin deletion removes content and preserves replies and audit, once", () => {
  const d = fixture();
  runJobs(d, new Date("2026-10-25T00:00:00Z"));
  const e = d.events[0];
  const root = postMessage(d, e, "member", {
    text: "Remove me",
    clientId: "message-0001",
  });
  const reply = postMessage(d, e, "admin", {
    text: "Keep this reply",
    replyTo: root.id,
    clientId: "message-0002",
  });
  for (const u of ["member", "inactive", "birthday"])
    assert.throws(() => deleteMessage(d, e, u, root.id));
  deleteMessage(d, e, "admin", root.id);
  deleteMessage(d, e, "admin", root.id);
  assert.equal(root.text, "");
  assert(root.deletedAt);
  assert.equal(root.deletedBy, "admin");
  assert.equal(reply.text, "Keep this reply");
  assert.equal(reply.parentId, root.id);
  assert.equal(e.audit.length, 1);
});
