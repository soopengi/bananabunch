export function addCalendarEvent(
  data: any,
  user: string,
  input: any,
  now = new Date(),
) {
  const item = {
    id: crypto.randomUUID(),
    ...eventFields(input),
    photo: String(input.photo || ""),
    createdBy: user,
    createdAt: now.toISOString(),
    birthdayEvent: input.birthdayEvent || undefined,
    hiddenFrom: input.hiddenFrom || undefined,
  };
  data.calendarEvents = data.calendarEvents || [];
  data.calendarEvents.push(item);
  return item;
}

function eventFields(input: any) {
  const title = String(input.title || "").trim(),
    description = String(input.description || "").trim(),
    location = String(input.location || "").trim(),
    date = String(input.date || ""),
    time = String(input.time || "");
  if (title.length < 3 || title.length > 120)
    throw Error("Enter an event title from 3 to 120 characters.");
  if (description.length > 1000 || location.length > 180)
    throw Error("Please shorten the event details.");
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw Error("Choose a valid event date.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error("Choose a valid event time.");
  return { title, description, location, date, time };
}

function editableEvent(data: any, user: string, id: string, admin: boolean) {
  const item = (data.calendarEvents || []).find((e: any) => e.id === id);
  if (!item) throw Error("Event not found.");
  if (item.createdBy !== user && !admin)
    throw Error("Only the event creator or admin can change this event.");
  return item;
}

export function updateCalendarEvent(
  data: any,
  user: string,
  input: any,
  admin = false,
  now = new Date(),
) {
  const item = editableEvent(data, user, String(input.id), admin);
  Object.assign(item, eventFields(input), {
    // An empty photo removes it; leaving it out keeps the current one.
    photo: input.photo === undefined ? item.photo || "" : String(input.photo),
    updatedBy: user,
    updatedAt: now.toISOString(),
  });
  return item;
}

export function deleteCalendarEvent(
  data: any,
  user: string,
  id: string,
  admin = false,
) {
  const item = editableEvent(data, user, id, admin);
  data.calendarEvents = data.calendarEvents.filter((e: any) => e.id !== id);
  return item;
}
