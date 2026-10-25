import { award, chooseGifts } from "./rules.ts";
export function requireRole(event: any, user: string, role: string) {
  if (
    !event ||
    !["gift", "cake"].includes(role) ||
    event.person === user ||
    event[role] !== user
  )
    throw Error("Only the assigned " + role + " organiser can do this.");
}
export function completeRole(
  data: any,
  event: any,
  user: string,
  role: string,
) {
  const me = data.people.find((p: any) => p.id === user && !p.disabled);
  if (
    !me ||
    !event ||
    event.person === user ||
    !["gift", "cake"].includes(role)
  )
    throw Error("This responsibility is unavailable.");
  if (!me.admin) requireRole(event, user, role);
  event.tasks = event.tasks || {};
  if (event.tasks[role + " complete"]) return;
  if (event.status !== "Completed") event.statusBeforeCompletion = event.status;
  event.tasks[role + " complete"] = true;
  event.tasks[role === "gift" ? "Gift purchased" : "Cake arranged"] = true;
  event.audit = event.audit || [];
  event.audit.push({
    action: "completed",
    role,
    by: user,
    adminOverride: !!me.admin && event[role] !== user,
    at: new Date().toISOString(),
  });
  const organiser = event[role];
  if (organiser)
    award(
      data,
      "complete:" + event.id + ":" + role,
      organiser,
      data.settings.weights[role],
      "Completed " + role + " responsibility",
      event.id,
    );
  if (event.tasks["gift complete"] && event.tasks["cake complete"])
    event.status = "Completed";
}
export function setBudget(
  event: any,
  user: string,
  role: string,
  amount: any,
  currency: any,
) {
  requireRole(event, user, role);
  const value = Number(amount);
  if (
    amount === "" ||
    amount === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000000 ||
    Math.abs(Math.round(value * 100) - value * 100) > 0.000001
  )
    throw Error(
      "Enter a budget from 0 to 1,000,000, with at most two decimal places.",
    );
  if (!["AUD", "USD", "GBP", "EUR", "NZD", "CAD"].includes(currency))
    throw Error("Choose a supported currency.");
  event.budgets = event.budgets || {};
  event.budgets[role] = { amount: value, currency };
  event.audit = event.audit || [];
  event.audit.push({
    action: "budget changed",
    role,
    amount: value,
    currency,
    by: user,
    at: new Date().toISOString(),
  });
}
export function selectGift(
  data: any,
  event: any,
  user: string,
  options: string | string[],
) {
  requireRole(event, user, "gift");
  if (!["Voting open", "Decision needed"].includes(event.status))
    throw Error("The gift has already been selected.");
  const selected = [
    ...new Set(
      (Array.isArray(options) ? options : [options])
        .map(String)
        .filter(Boolean),
    ),
  ];
  if (!selected.length) throw Error("Select at least one gift.");
  if (
    event.status === "Decision needed" &&
    !event.votingExtended &&
    event.leaders?.length &&
    selected.some((option) => !event.leaders.includes(option))
  )
    throw Error("Choose from the tied leaders.");
  const early = event.status === "Voting open";
  chooseGifts(data, event, selected);
  event.votingClosedAt = new Date().toISOString();
  event.audit = event.audit || [];
  event.audit.push({
    action:
      selected.length === 1
        ? early
          ? "gift selected early"
          : "gift selected"
        : early
          ? "gifts selected early"
          : "gifts selected",
    option: selected[0],
    options: selected,
    by: user,
    at: event.votingClosedAt,
  });
}

export function undoCompleteRole(
  data: any,
  event: any,
  user: string,
  role: string,
) {
  const me = data.people.find((p: any) => p.id === user && !p.disabled);
  if (
    !me ||
    !event ||
    event.person === user ||
    !["gift", "cake"].includes(role)
  )
    throw Error("This responsibility is unavailable.");
  if (!me.admin) requireRole(event, user, role);
  event.tasks = event.tasks || {};
  if (!event.tasks[role + " complete"]) return;
  delete event.tasks[role + " complete"];
  delete event.tasks[role === "gift" ? "Gift purchased" : "Cake arranged"];
  data.ledger = data.ledger.filter(
    (l: any) => l.key !== "complete:" + event.id + ":" + role,
  );
  if (event.status === "Completed")
    event.status =
      event.statusBeforeCompletion ||
      (event.final ? "Gift selected" : "Decision needed");
  if (
    event.status === "Voting open" &&
    !event.votingExtended &&
    Date.parse(event.deadline) <= Date.now()
  )
    event.status = event.final ? "Gift selected" : "Decision needed";
  event.audit = event.audit || [];
  event.audit.push({
    action: "completion undone",
    role,
    by: user,
    at: new Date().toISOString(),
  });
}
