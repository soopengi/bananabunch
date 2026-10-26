import { extendVoting } from "./voting.ts";
import { maintainWishlist } from "./wishlist-lifecycle.ts";
import { syncWishlistOptions } from "./wishlist-sync.ts";
export function localMidnight(date: string, timezone: string) {
  const target = Date.parse(date + "T00:00:00Z");
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const local = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    utc += target - local;
  }
  return new Date(utc).toISOString();
}

export function birthdayDate(birthday: string, year: number) {
  const [m, d] = birthday.split("-").map(Number);
  return new Date(
    Date.UTC(
      year,
      m - 1,
      Math.min(d, new Date(Date.UTC(year, m, 0)).getUTCDate()),
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export function opensOn(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(
    Date.UTC(
      y,
      m - 2,
      Math.min(d, new Date(Date.UTC(y, m - 1, 0)).getUTCDate()),
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export function closesOn(date: string) {
  return new Date(Date.parse(date + "T00:00:00Z") - 14 * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function today(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function draw(
  people: any[],
  person: string,
  history: any[],
  random = Math.random,
  eventDate?: string,
) {
  const year = (eventDate || new Date().toISOString()).slice(0, 4);
  const chosenThisYear = new Set(
    history
      .filter((h) =>
        h.date ? String(h.date).slice(0, 4) === year : !eventDate,
      )
      .map((h) => h.user),
  );
  const eligible = people
    .filter(
      (p) =>
        p.id !== person && !p.disabled && !p.admin && !chosenThisYear.has(p.id),
    )
    .map((p) => p.id);
  const count = (id: string) => history.filter((h) => h.user === id).length;
  let pool = eligible;
  const fallback = pool.length < 2;
  const choose = () => {
    if (!pool.length) return null;
    const min = Math.min(...pool.map(count));
    const choices = pool.filter((id) => count(id) === min);
    const id = choices[Math.floor(random() * choices.length)];
    pool = pool.filter((p) => p !== id);
    return id;
  };
  return {
    gift: choose(),
    cake: choose(),
    fallback: fallback
      ? "Fewer than two Bananas remain in this year’s organiser pool."
      : null,
  };
}
/**
 * Admin tool: redraws the gift and cake organisers for every upcoming birthday,
 * earliest first. Birthdays that are already done (gift chosen, or anything
 * marked purchased) keep their organisers. Returns how many changed.
 */
export function reassignUpcomingOrganisers(
  data: any,
  day = today(data.settings.timezone),
  random = Math.random,
) {
  const done = (e: any) =>
    e.final ||
    e.status === "Completed" ||
    ["gift", "cake"].some((role) => e.tasks?.[role + " complete"]);
  const events = data.events
    .filter((e: any) => !e.cancelled && e.date >= day && !done(e))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
  const ids = new Set(events.map((e: any) => e.id));
  data.history = data.history.filter((h: any) => !ids.has(h.event));
  const at = new Date().toISOString();
  for (const event of events) {
    const previous = { gift: event.gift, cake: event.cake };
    const roles = draw(
      data.people,
      event.person,
      data.history,
      random,
      event.date,
    );
    event.gift = roles.gift;
    event.cake = roles.cake;
    event.fallback = roles.fallback;
    event.tasks = event.tasks || {};
    for (const role of ["gift", "cake"]) {
      delete event.tasks[role + " complete"];
      delete event.tasks[role === "gift" ? "Gift purchased" : "Cake arranged"];
      const user = (roles as any)[role];
      if (user)
        data.history.push({
          event: event.id,
          user,
          role,
          person: event.person,
          date: event.date,
          at,
          reason: "All upcoming organisers redrawn by admin",
        });
    }
    event.audit = event.audit || [];
    event.audit.push({
      action: "all organisers reassigned",
      previous,
      next: { gift: event.gift, cake: event.cake },
      at,
    });
  }
  return events.length;
}
export function award(
  data: any,
  key: string,
  user: string,
  points: number,
  reason: string,
  event?: string,
) {
  if (data.ledger.some((l: any) => l.key === key)) return;
  data.ledger.push({
    key,
    user,
    points,
    reason,
    event,
    at: new Date().toISOString(),
  });
}
export function notify(data: any, key: string, event: any, text: string) {
  for (const p of data.people.filter(
    (p: any) => p.id !== event.person && !p.disabled,
  )) {
    const id = key + ":" + p.id;
    if (!data.notifications.some((n: any) => n.id === id))
      data.notifications.push({
        id,
        user: p.id,
        text,
        event: event.id,
        read: false,
        delivery: { inapp: "delivered", email: "pending" },
      });
  }
}
export function chooseGift(data: any, e: any, id: string) {
  return chooseGifts(data, e, [id]);
}
export function chooseGifts(data: any, e: any, ids: string[]) {
  const selected = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!selected.length) throw Error("Select at least one gift.");
  const gifts = selected.map((id) => e.options.find((o: any) => o.id === id));
  if (gifts.some((o: any) => !o)) throw Error("Select available gifts only.");
  e.finals = selected;
  e.final = selected[0];
  e.status = "Gift selected";
  e.votingExtended = false;
  e.votingClosedAt = new Date().toISOString();
  for (const o of gifts)
    if (o.kind === "suggestion")
      award(
        data,
        "selected:" + e.id + ":" + o.id,
        o.by,
        data.settings.weights.selected,
        "Gift suggestion selected",
        e.id,
      );
  notify(
    data,
    "final:" + e.id,
    e,
    (selected.length > 1 ? selected.length + " gifts" : "The final gift") +
      " for " +
      data.people.find((p: any) => p.id === e.person)?.name +
      " " +
      (selected.length > 1 ? "have" : "has") +
      " been chosen.",
  );
}
export function runJobs(data: any, now = new Date()) {
  maintainWishlist(data, now);
  const day = today(data.settings.timezone, now);
  const year = Number(day.slice(0, 4));
  for (const p of data.people.filter((p: any) => p.birthday && !p.disabled)) {
    for (const y of [year, year + 1]) {
      const date = birthdayDate(p.birthday, y);
      if (
        day < opensOn(date) ||
        day > date ||
        data.events.some((e: any) => e.id === p.id + "-" + y)
      )
        continue;
      const roles = draw(data.people, p.id, data.history, Math.random, date);
      const deadline = localMidnight(closesOn(date), data.settings.timezone);
      const e = {
        id: p.id + "-" + y,
        person: p.id,
        date,
        created: now.toISOString(),
        deadline,
        status: "Voting open",
        ...roles,
        tasks: {},
        options: data.wishlist
          .filter((w: any) => w.owner === p.id)
          .map((w: any) => ({
            ...w,
            id: crypto.randomUUID(),
            sourceWishlistId: w.id,
            kind: "wishlist",
            by: p.id,
            votes: [],
          })),
        audit: [],
      };
      data.events.push(e);
      for (const role of ["gift", "cake"])
        if ((roles as any)[role])
          data.history.push({
            event: e.id,
            user: (roles as any)[role],
            role,
            person: p.id,
            date,
            at: now.toISOString(),
          });
      notify(
        data,
        "created:" + e.id,
        e,
        "A new birthday bunch is open. Your ideas are welcome!",
      );
    }
  }
  for (const e of data.events) {
    if (e.date >= day && e.status !== "Completed") {
      for (const role of ["gift", "cake"]) {
        if (
          !e.tasks?.[role + " complete"] &&
          data.people.some((p: any) => p.id === e[role] && p.admin)
        ) {
          const other = e[role === "gift" ? "cake" : "gift"];
          const replacement = draw(
            data.people.filter((p: any) => p.id !== other),
            e.person,
            data.history,
            Math.random,
            e.date,
          ).gift;
          e.audit = e.audit || [];
          e.audit.push({
            action: "admin removed from organiser draw",
            role,
            previous: e[role],
            next: replacement,
            at: now.toISOString(),
          });
          e[role] = replacement;
          if (replacement)
            data.history.push({
              event: e.id,
              user: replacement,
              role,
              person: e.person,
              date: e.date,
              at: now.toISOString(),
            });
        }
      }
    }
    e.budgets = {
      gift: e.budgets?.gift || { amount: 200, currency: "AUD" },
      cake: e.budgets?.cake || { amount: 75, currency: "AUD" },
    };
    e.votingOpensAt = localMidnight(opensOn(e.date), data.settings.timezone);
    e.scheduledDeadline = localMidnight(
      closesOn(e.date),
      data.settings.timezone,
    );
    e.deadline = e.votingExtended ? null : e.scheduledDeadline;
  }
  syncWishlistOptions(data, now);
  for (const e of data.events) {
    if (e.cancelled) continue;
    if (e.status === "Decision needed" && !e.final) extendVoting(e, now);
    if (
      e.status === "Voting open" &&
      !e.votingExtended &&
      Date.parse(e.deadline) <= now.getTime()
    ) {
      const max = Math.max(0, ...e.options.map((o: any) => o.votes.length));
      const leaders = e.options.filter(
        (o: any) => o.votes.length === max && max > 0,
      );
      e.status = "Decision needed";
      e.leaders = leaders.map((o: any) => o.id);
      if (leaders.length === 1) chooseGift(data, e, leaders[0].id);
      else {
        extendVoting(e, now);
        notify(
          data,
          "decision:" + e.id,
          e,
          "Voting is extended without a deadline. Add ideas and vote until the gift organiser makes the final choice.",
        );
      }
    }
    if (
      e.status === "Voting open" &&
      !e.votingExtended &&
      Date.parse(e.deadline) - now.getTime() < 3 * 86400000
    )
      notify(
        data,
        "reminder:" + e.id,
        e,
        "Voting closes soon. Add your voice to the bunch.",
      );
    if (
      e.status !== "Completed" &&
      Date.parse(e.date) - now.getTime() < 7 * 86400000
    )
      notify(
        data,
        "tasks:" + e.id,
        e,
        "A birthday is close. Please review outstanding organising tasks.",
      );
  }
  syncWishlistOptions(data, now);
  return data;
}
/** A birthday's wishlist stays hidden for 7 days after its page opens, so the bunch suggests their own ideas first. */
export function wishlistAvailableAt(event: any) {
  const startsAt =
    event.votingOpensAt ||
    event.created ||
    new Date(
      Date.parse(event.date + "T00:00:00Z") - 30 * 86400000,
    ).toISOString();
  return new Date(Date.parse(startsAt) + 7 * 86400000).toISOString();
}
export function wishlistIsAvailable(event: any, now = new Date()) {
  return (
    !event.created || Date.parse(wishlistAvailableAt(event)) <= now.getTime()
  );
}
export function visible(data: any, user: string, now = new Date()) {
  const events = data.events
    .filter((e: any) => e.person !== user)
    .map((e: any) =>
      wishlistIsAvailable(e, now)
        ? e
        : {
            ...e,
            options: (e.options || []).filter(
              (o: any) => o.kind !== "wishlist",
            ),
            wishlistAvailableAt: wishlistAvailableAt(e),
            wishlistHidden: true,
          },
    );
  const allowed = new Set(events.map((e: any) => e.id));
  return {
    ...data,
    events,
    calendarEvents: (data.calendarEvents || []).filter(
      (item: any) => item.hiddenFrom !== user,
    ),
    history: data.history.filter((h: any) => allowed.has(h.event)),
    notifications: data.notifications.filter(
      (n: any) => n.user === user && allowed.has(n.event) && !n.read,
    ),
    ledger: data.ledger.filter(
      (l: any) =>
        !l.event ||
        allowed.has(l.event) ||
        data.events.find((e: any) => e.id === l.event)?.status === "Completed",
    ),
    invites: undefined,
    user,
  };
}
