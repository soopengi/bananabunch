import { test } from "node:test";
import assert from "node:assert/strict";
import { addSuggestion, editSuggestion } from "./ideas.ts";
function event() {
  return {
    id: "e",
    person: "birthday",
    status: "Voting open",
    deadline: "2099-12-01T00:00:00Z",
    options: [],
    audit: [],
  } as any;
}
test("a new idea receives exactly one automatic vote from its suggester", () => {
  const e = event();
  addSuggestion(
    e,
    { id: "idea", name: "Pottery", link: "", votes: [] },
    "alice",
  );
  assert.deepEqual(e.options[0].votes, ["alice"]);
  assert.equal(e.options[0].by, "alice");
  assert.throws(() =>
    addSuggestion(e, { id: "another", name: "Pottery", link: "" }, "alice"),
  );
  assert.equal(e.options.length, 1);
});
test("another participant may edit content, photo and link without replacing votes or attribution", () => {
  const e = event();
  addSuggestion(
    e,
    {
      id: "idea",
      name: "Pottery",
      description: "Old",
      photo: "old",
      price: 10,
      currency: "AUD",
      link: "",
    },
    "alice",
  );
  e.options[0].votes.push("charlie");
  const result = editSuggestion(
    e,
    "idea",
    {
      id: "bad",
      by: "mallory",
      votes: [],
      name: "A workshop",
      description: "Updated",
      link: "https://example.test/item",
      photo: "new",
      price: 90,
      currency: "AUD",
    },
    "bob",
  );
  assert.equal(result.id, "idea");
  assert.equal(result.by, "alice");
  assert.deepEqual(result.votes, ["alice", "charlie"]);
  assert.equal(result.photo, "new");
  assert.equal(result.link, "https://example.test/item");
  assert.equal(e.audit[0].by, "bob");
});
test("birthday owner and chosen gifts cannot edit gift ideas", () => {
  const e = event();
  addSuggestion(e, { id: "idea", name: "Pottery", link: "" }, "alice");
  assert.throws(() => editSuggestion(e, "idea", { name: "No" }, "birthday"));
  e.status = "Gift selected";
  e.final = "idea";
  assert.throws(() => editSuggestion(e, "idea", { name: "No" }, "bob"));
});
test("ideas can still be added after scheduled voting closes until a gift is chosen", () => {
  const e = event();
  e.status = "Decision needed";
  e.deadline = "2020-01-01T00:00:00Z";
  addSuggestion(
    e,
    { id: "late", name: "Late but useful", link: "", votes: [] },
    "alice",
  );
  assert.equal(e.options[0].id, "late");
});
