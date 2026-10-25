import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeRewards,
  pendingRewards,
  acknowledgeReward,
} from "./rewards.ts";
import { award } from "./rules.ts";
function data() {
  return {
    people: [],
    events: [],
    ledger: [],
    history: [],
    notifications: [],
    settings: {},
  } as any;
}
test("new positive awards produce an acknowledged-once Banana Points reward", () => {
  const d = data();
  award(d, "old", "alice", 2, "Old");
  initializeRewards(d);
  assert.equal(pendingRewards(d, "alice").length, 0);
  award(d, "fresh", "alice", 1, "Wishlist item");
  assert.equal(pendingRewards(d, "alice")[0].points, 1);
  assert.equal(pendingRewards(d, "bob").length, 0);
  assert.throws(() => acknowledgeReward(d, "bob", "fresh"));
  acknowledgeReward(d, "alice", "fresh");
  assert.equal(pendingRewards(d, "alice").length, 0);
  award(d, "fresh", "alice", 1, "Wishlist item");
  assert.equal(pendingRewards(d, "alice").length, 0);
});
test("surprise-related point popups are concealed until the birthday event completes", () => {
  const d = data();
  initializeRewards(d);
  d.events.push({ id: "event", person: "birthday", status: "Gift selected" });
  award(d, "private", "birthday", 10, "A private award", "event");
  assert.equal(pendingRewards(d, "birthday").length, 0);
  assert.throws(() => acknowledgeReward(d, "birthday", "private"));
  d.events[0].status = "Completed";
  assert.equal(pendingRewards(d, "birthday").length, 1);
});
