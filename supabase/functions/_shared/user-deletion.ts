export function deleteUser(
  data: any,
  actor: string,
  target: string,
  now = new Date(),
) {
  const admin = data.people.find(
    (p: any) => p.id === actor && p.admin && !p.disabled && !p.deletedAt,
  );
  if (!admin) throw Error("Administrator access required.");
  if (actor === target)
    throw Error("You cannot delete your own admin account.");
  const member = data.people.find((p: any) => p.id === target);
  if (!member) throw Error("Banana not found.");
  if (member.deletedAt) return;
  if (
    member.admin &&
    data.people.filter((p: any) => p.admin && !p.disabled && !p.deletedAt)
      .length <= 1
  )
    throw Error("Keep at least one active admin.");
  member.disabled = true;
  member.deletedAt = now.toISOString();
  member.deletedBy = actor;
  member.preferences = { email: false, discord: false };
  data.accountAudit = data.accountAudit || [];
  data.accountAudit.push({
    action: "user deleted",
    user: target,
    by: actor,
    at: member.deletedAt,
  });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.settings?.timezone || "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  for (const e of data.events || []) {
    if (e.date < day || e.status === "Completed") continue;
    if (e.person === target) {
      e.cancelled = true;
      e.cancelledAt = member.deletedAt;
      e.status = "Cancelled";
    }
    for (const role of ["gift", "cake"]) {
      if (e[role] === target && !e.tasks?.[role + " complete"]) {
        e[role] = null;
        e.audit = e.audit || [];
        e.audit.push({
          action: "organiser removed after user deletion",
          role,
          previous: target,
          by: actor,
          at: member.deletedAt,
        });
      }
    }
  }
  // Keep identity references in past conversations and birthday records.
  data.notifications = data.notifications.filter((n: any) => n.user !== target);
}
