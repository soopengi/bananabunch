export function postMessage(
  data: any,
  event: any,
  user: string,
  input: any,
  now = new Date(),
) {
  if (
    !event ||
    event.person === user ||
    !data.people.some((p: any) => p.id === user && !p.disabled)
  )
    throw Error("Event not found");
  const text = String(input.text || "").trim();
  if (!text || text.length > 2000)
    throw Error("Write a message between 1 and 2,000 characters.");
  const clientId = String(input.clientId || "");
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(clientId))
    throw Error("Please retry your message.");
  const optionId = input.option ? String(input.option) : null;
  if (optionId && !event.options.some((o: any) => o.id === optionId))
    throw Error("Gift idea not found");
  event.messages = event.messages || [];
  const duplicate = event.messages.find(
    (m: any) => m.user === user && m.clientId === clientId,
  );
  if (duplicate) return duplicate;
  const parentId = input.replyTo ? String(input.replyTo) : null;
  if (
    parentId &&
    !event.messages.some(
      (m: any) => m.id === parentId && m.optionId === optionId,
    )
  )
    throw Error("Reply to a message in this conversation.");
  if (
    event.messages.filter(
      (m: any) =>
        m.user === user && Date.parse(m.createdAt) > now.getTime() - 60000,
    ).length >= 12
  )
    throw Error("Give the bunch a moment before sending more messages.");
  const message = {
    id: crypto.randomUUID(),
    user,
    text,
    optionId,
    parentId,
    clientId,
    createdAt: now.toISOString(),
  };
  event.messages.push(message);
  return message;
}

export function deleteMessage(data: any, event: any, user: string, id: string) {
  if (!data.people.some((p: any) => p.id === user && p.admin && !p.disabled))
    throw Error("Administrator access required.");
  if (!event || event.person === user) throw Error("Event not found");
  const message = (event.messages || []).find((m: any) => m.id === id);
  if (!message) throw Error("Message not found.");
  if (message.deletedAt) return;
  message.text = "";
  message.deletedAt = new Date().toISOString();
  message.deletedBy = user;
  event.audit = event.audit || [];
  event.audit.push({
    action: "message deleted",
    message: id,
    by: user,
    at: message.deletedAt,
  });
}
