import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBirthday, displayBirthday } from "./birthdays.ts";
test("DD-MM input and existing MM-DD storage round-trip without swapping birthdays", () => {
  assert.equal(parseBirthday("08-11"), "11-08");
  assert.equal(displayBirthday("11-08"), "08-11");
  assert.equal(parseBirthday("31-12"), "12-31");
  assert.equal(displayBirthday("02-29"), "29-02");
  assert.equal(displayBirthday(null), "");
});
test("birthdays require real DD-MM calendar dates", () => {
  for (const value of [
    "",
    null,
    "11-31",
    "31-04",
    "30-02",
    "00-01",
    "01-00",
    "1-1",
    "2026-11-08",
  ]) {
    assert.throws(() => parseBirthday(value));
  }
  assert.equal(parseBirthday("29-02"), "02-29");
});
