/** Gift ideas can be added or edited until the gift is chosen, even after voting closes. */
export function ideasOpen(event: any) {
  return !!event && !event.final && !event.cancelled;
}

export function addSuggestion(event: any, idea: any, user: string) {
  if (!event || event.person === user) throw Error("Event not found");
  if (!ideasOpen(event))
    throw Error("Gift ideas can be added until the gift is chosen.");
  if (
    event.options.some(
      (o: any) =>
        (idea.link && o.link === idea.link) ||
        o.name.toLowerCase() === idea.name.toLowerCase(),
    )
  )
    throw Error("That idea is already in the bunch. Give it a vote!");
  idea.by = user;
  idea.kind = "suggestion";
  idea.votes = [user];
  event.options.push(idea);
}
export function editSuggestion(
  event: any,
  id: string,
  changes: any,
  user: string,
) {
  if (!event || event.person === user) throw Error("Event not found");
  if (!ideasOpen(event))
    throw Error("Gift ideas can be edited until the gift is chosen.");
  const idea = event.options.find(
    (o: any) => o.id === id && o.kind === "suggestion",
  );
  if (!idea) throw Error("Gift idea not found");
  if (
    event.options.some(
      (o: any) =>
        o.id !== id &&
        ((changes.link && o.link === changes.link) ||
          o.name.toLowerCase() === changes.name.toLowerCase()),
    )
  )
    throw Error("That product is already in the bunch.");
  const before = {
    name: idea.name,
    description: idea.description,
    link: idea.link,
    photo: idea.photo,
    price: idea.price,
    currency: idea.currency,
  };
  Object.assign(idea, {
    name: changes.name,
    description: changes.description,
    link: changes.link,
    photo: changes.photo,
    price: changes.price,
    currency: changes.currency,
    editedBy: user,
    editedAt: new Date().toISOString(),
  });
  event.audit = event.audit || [];
  event.audit.push({
    action: "idea edited",
    option: id,
    by: user,
    before,
    at: idea.editedAt,
  });
  return idea;
}
