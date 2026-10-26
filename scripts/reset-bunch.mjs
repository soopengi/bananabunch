// Fresh start: removes every Banana except the admin(s), clears all birthdays,
// wishlists, points and calendar events, then creates the Bananas listed in a
// CSV file. Settings and the admin account are kept.
//
// Usage (see docs/SETUP.md):
//   npm run reset-bunch -- users.csv            # dry run: shows what would happen
//   npm run reset-bunch -- users.csv --confirm  # does it
//
// The CSV needs a header row: name,username,birthday,email,password
// (birthday as DD-MM; email optional). It contains passwords, so keep it out of
// the repo and delete it once everyone has logged in.
//
// Needs in .env.local: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  loginEmail,
  validatePassword,
  validateUser,
} from "../supabase/functions/_shared/accounts.ts";
import { newCircle } from "../supabase/functions/_shared/circle-data.ts";

const GROUP = "group";
const BUCKET = "photos";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const csvPath = args.find((a) => !a.startsWith("--"));
const fail = (message) => {
  console.error("\n" + message);
  process.exit(1);
};

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!csvPath) fail("Give the CSV file: npm run reset-bunch -- users.csv");
if (!url || !serviceKey)
  fail("Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.");

// --- 1. Read and check every new Banana before touching anything ------------
const newPeople = parseCsv(readFileSync(csvPath, "utf8")).map((row, i) => {
  const line = i + 2; // +1 for the header, +1 for counting from 1
  try {
    const fields = validateUser(row);
    validatePassword(row.password);
    return { ...fields, password: row.password };
  } catch (error) {
    fail(`Line ${line} (${row.username || "no username"}): ${error.message}`);
  }
});
if (!newPeople.length) fail("The CSV has no Bananas in it.");
const seen = new Set();
for (const p of newPeople) {
  for (const key of [p.username, p.email].filter(Boolean)) {
    if (seen.has(key)) fail(`"${key}" appears more than once in the CSV.`);
    seen.add(key);
  }
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row, error: loadError } = await db
  .from("circles")
  .select("data, version")
  .eq("id", GROUP)
  .maybeSingle();
if (loadError) fail("Could not load the bunch: " + loadError.message);
if (!row) fail("The bunch hasn't been set up yet (no admin).");
const group = row.data;

const admins = group.people.filter((p) => p.admin && !p.deletedAt);
if (!admins.length) fail("No admin found, so nothing would be left to log in.");
const removed = group.people.filter((p) => !admins.includes(p));
for (const p of newPeople) {
  if (admins.some((a) => a.username === p.username))
    fail(`"${p.username}" is the admin's username.`);
  if (p.email && admins.some((a) => (a.email || "").toLowerCase() === p.email))
    fail(`${p.email} is the admin's email.`);
}

// Photos to keep: the admins' own profile pictures. Everything else goes.
const keepPhotos = new Set(admins.map((a) => a.profilePhoto).filter(Boolean));
const photos = Object.values(group.photos || {});
const photosToDelete = photos.filter((p) => !keepPhotos.has(p.id));

// --- 2. Show the plan -----------------------------------------------------
console.log(`Keeping admin: ${admins.map((a) => "@" + a.username).join(", ")}`);
console.log(
  `Removing ${removed.length} Banana(s): ${removed.map((p) => "@" + (p.username || p.name)).join(", ") || "none"}`,
);
console.log(
  `Clearing ${group.events.length} birthday(s), ${(group.calendarEvents || []).length} calendar event(s), ` +
    `${group.wishlist.length} wish(es), ${group.ledger.length} point entries and ${photosToDelete.length} photo(s).`,
);
console.log(`Creating ${newPeople.length} Banana(s):`);
for (const p of newPeople)
  console.log(
    `  @${p.username}  ${p.name}  birthday ${p.birthday.slice(3)}-${p.birthday.slice(0, 2)}${p.email ? "  " + p.email : ""}`,
  );
if (!confirm) {
  console.log("\nDry run only. Nothing was changed. Add --confirm to do it.");
  process.exit(0);
}

// --- 3. Remove the old Bananas' logins -------------------------------------
console.log("\nRemoving old logins…");
for (const p of removed) {
  const { error } = await db.auth.admin
    .deleteUser(p.id)
    .catch((error) => ({ error }));
  // Already gone is fine (e.g. a re-run after a partial failure).
  if (error && error.status !== 404)
    fail(`Could not remove @${p.username}: ${error.message}`);
}

// --- 4. Create the new logins ---------------------------------------------
console.log("Creating new logins…");
const created = [];
const undo = async () => {
  for (const p of created) await db.auth.admin.deleteUser(p.id).catch(() => {});
};
for (const p of newPeople) {
  const authEmail = loginEmail(p.username);
  const { data, error } = await db.auth.admin.createUser({
    email: authEmail,
    password: p.password,
    email_confirm: true, // there's no real inbox behind username logins
  });
  if (error) {
    await undo();
    fail(
      `Could not create @${p.username}: ${error.message}\n` +
        "Old Bananas were removed but the bunch data wasn't changed. Fix the CSV and run it again.",
    );
  }
  created.push({ ...p, id: data.user.id, authEmail });
}

// --- 5. Save the fresh bunch -----------------------------------------------
const now = new Date().toISOString();
const fresh = {
  ...newCircle(),
  settings: group.settings,
  people: [
    ...admins,
    ...created.map(({ password: _password, ...p }) => ({
      ...p,
      description: "",
      color: "#dbd3c9",
      admin: false,
      preferences: { email: false, discord: false },
      createdAt: now,
    })),
  ],
  photos: Object.fromEntries(
    photos.filter((p) => keepPhotos.has(p.id)).map((p) => [p.id, p]),
  ),
  accountAudit: [
    ...(group.accountAudit || []),
    { action: "bunch reset", by: "reset script", at: now },
    ...created.map((p) => ({
      action: "user created",
      user: p.id,
      by: "reset script",
      at: now,
    })),
  ],
};
const { data: saved, error: saveError } = await db
  .from("circles")
  .update({ data: fresh, version: row.version + 1, updated_at: now })
  .eq("id", GROUP)
  .eq("version", row.version)
  .select("id");
if (saveError || saved?.length !== 1) {
  await undo();
  fail(
    "Could not save the bunch" +
      (saveError
        ? ": " + saveError.message
        : " (someone changed it meanwhile).") +
      " New logins were undone. Run it again.",
  );
}

// --- 6. Tidy up old photo files (not critical if this fails) ---------------
if (photosToDelete.length) {
  const { error } = await db.storage
    .from(BUCKET)
    .remove(photosToDelete.map((p) => p.path));
  if (error)
    console.warn("Some old photo files weren't removed:", error.message);
}

console.log(
  `\nDone. ${created.length} Banana(s) created. Share each username and temporary password privately.`,
);

/** Minimal CSV reader: header row, commas, optional double quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  for (const key of ["name", "username", "birthday", "password"])
    if (!keys.includes(key)) fail(`The CSV header is missing "${key}".`);
  return body.map((r) =>
    Object.fromEntries(
      keys.map((k, i) => [
        k,
        k === "password" ? r[i] || "" : (r[i] || "").trim(),
      ]),
    ),
  );
}
