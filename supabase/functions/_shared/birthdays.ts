export function parseBirthday(value: any) {
  const input = String(value || "").trim();
  if (!input) throw Error("Birthday is required. Enter it as DD-MM.");
  if (!/^[0-9]{2}-[0-9]{2}$/.test(input))
    throw Error("Enter a valid birthday as DD-MM.");
  const [day, month] = input.split("-").map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(2000, month, 0)).getUTCDate()
  )
    throw Error("Enter a valid birthday as DD-MM.");
  return input.slice(3) + "-" + input.slice(0, 2);
}
export function displayBirthday(stored?: string | null) {
  return stored ? stored.slice(3) + "-" + stored.slice(0, 2) : "";
}
