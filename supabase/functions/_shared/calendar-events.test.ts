import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./calendar-events.ts";
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

test("events can be edited with a photo and deleted, by their creator or an admin", () => {
  const data: any = {};
  const item = addCalendarEvent(data, "banana", {
    title: "Picnic",
    date: "2027-02-14",
  });
  updateCalendarEvent(data, "banana", {
    id: item.id,
    title: "Beach picnic",
    date: "2027-02-15",
    photo: "photo-id",
  });
  assert.equal(item.title, "Beach picnic");
  assert.equal(item.photo, "photo-id");
  // Leaving the photo out keeps it; an empty photo removes it.
  updateCalendarEvent(data, "banana", {
    id: item.id,
    title: "Beach picnic",
    date: "2027-02-15",
  });
  assert.equal(item.photo, "photo-id");
  updateCalendarEvent(data, "banana", {
    id: item.id,
    title: "Beach picnic",
    date: "2027-02-15",
    photo: "",
  });
  assert.equal(item.photo, "");
  assert.throws(() => deleteCalendarEvent(data, "someone-else", item.id));
  updateCalendarEvent(
    data,
    "admin",
    { id: item.id, title: "Admin edit", date: "2027-02-15" },
    true,
  );
  assert.equal(item.title, "Admin edit");
  deleteCalendarEvent(data, "banana", item.id);
  assert.equal(data.calendarEvents.length, 0);
});
