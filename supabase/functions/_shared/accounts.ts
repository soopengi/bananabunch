// Account rules shared by the site and the Edge Function.
import { parseBirthday } from "./birthdays.ts";

// Supabase Auth needs an email for every account, but Bananas log in with a
// username. Each username gets a hidden address on a reserved domain that can
// never receive mail. A member's real email (optional) is kept separately in
// their profile, for reminders and password resets.
const LOGIN_DOMAIN = "bananabunch.invalid";

export function loginEmail(usernameOrEmail: string) {
  const value = String(usernameOrEmail || "")
    .trim()
    .toLowerCase();
  return value.includes("@") ? value : value + "@" + LOGIN_DOMAIN;
}

export function validateUser(input: any, allowMissingBirthday = false) {
  const username = String(input.username || "")
    .trim()
    .toLowerCase();
  const name = String(input.name || "").trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const birthday = String(input.birthday || "").trim();
  if (!/^[a-z0-9_]{3,30}$/.test(username))
    throw Error("Use a username of 3–30 letters, numbers or underscores.");
  if (name.length < 2 || name.length > 80)
    throw Error("Enter a name between 2 and 80 characters.");
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email))
    throw Error("Enter a valid email or leave it blank.");
  const storedBirthday =
    !birthday && allowMissingBirthday ? null : parseBirthday(birthday);
  return { username, name, email, birthday: storedBirthday };
}

export function validatePassword(value: any) {
  if (typeof value !== "string" || value.length < 8 || value.length > 256)
    throw Error("Use a password between 8 and 256 characters.");
}
