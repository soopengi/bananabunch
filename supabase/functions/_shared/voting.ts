export function votingOpen(event: any, now = new Date()) {
  if (!event || event.final || event.cancelled) return false;
  if (
    event.votingExtended &&
    ["Voting open", "Decision needed"].includes(event.status)
  )
    return true;
  return (
    event.status === "Voting open" && Date.parse(event.deadline) > now.getTime()
  );
}
export function extendVoting(event: any, now = new Date()) {
  if (event.final || event.status === "Completed" || event.cancelled) return;
  if (!event.votingExtended) {
    event.extendedAt = now.toISOString();
    event.audit = event.audit || [];
    event.audit.push({
      action: "voting extended until organiser chooses",
      at: event.extendedAt,
    });
  }
  event.votingExtended = true;
  event.deadline = null;
  event.status = "Decision needed";
  event.leaders = [];
}
