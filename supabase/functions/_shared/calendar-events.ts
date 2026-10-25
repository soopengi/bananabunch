export function addCalendarEvent(
  data: any,
  user: string,
  input: any,
  now = new Date(),
) {
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
  const item = {
    id: crypto.randomUUID(),
    title,
    description,
    location,
    date,
    time,
    createdBy: user,
    createdAt: now.toISOString(),
    birthdayEvent: input.birthdayEvent || undefined,
    hiddenFrom: input.hiddenFrom || undefined,
  };
  data.calendarEvents = data.calendarEvents || [];
  data.calendarEvents.push(item);
  return item;
}
