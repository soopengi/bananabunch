import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarEvent } from "./calendar-events.ts";
import { visible } from "./rules.ts";

test("signed-in users can add a detailed shared calendar event", () => {
  const data: any = {};
  const item = addCalendarEvent(
    data,
    "banana",
    {
      title: "Picnic in the park",
      date: "2027-02-14",
      time: "11:30",
      location: "Centennial Park",
      description: "Bring a picnic rug.",
    },
    new Date("2026-10-25T00:00:00Z"),
  );
  assert.equal(data.calendarEvents.length, 1);
  assert.equal(item.createdBy, "banana");
  assert.equal(item.location, "Centennial Park");
  assert.equal(item.date, "2027-02-14");
});
test("calendar events reject impossible dates and invalid times", () => {
  assert.throws(() =>
    addCalendarEvent({}, "banana", { title: "Bad date", date: "2027-02-31" }),
  );
  assert.throws(() =>
    addCalendarEvent({}, "banana", {
      title: "Bad time",
      date: "2027-02-14",
      time: "25:00",
    }),
  );
});
test("birthday-linked events stay hidden from the birthday person", () => {
  const data: any = {
    people: [],
    events: [],
    history: [],
    notifications: [],
    ledger: [],
  };
  const item = addCalendarEvent(data, "organiser", {
    title: "Secret dinner",
    date: "2027-02-14",
    birthdayEvent: "birthday-2027",
    hiddenFrom: "birthday-person",
  });
  assert.equal(item.birthdayEvent, "birthday-2027");
  assert.equal(visible(data, "birthday-person").calendarEvents.length, 0);
  assert.equal(visible(data, "organiser").calendarEvents.length, 1);
});
