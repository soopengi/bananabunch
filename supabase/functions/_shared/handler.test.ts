import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { handle, uploadPhoto, type Context, type Store } from "./handler.ts";

// Pin the clock so birthday events open predictably.
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T00:00:00Z") });
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** In-memory stand-in for the Supabase table. */
function memoryStore() {
  const rows = new Map<string, { data: string; version: number }>();
  const store: Store & { rows: typeof rows; beforeUpdate?: () => void } = {
    rows,
    async load(id) {
      const row = rows.get(id);
      return row ? { data: JSON.parse(row.data), version: row.version } : null;
    },
    async createIfMissing(id, data) {
      if (!rows.has(id))
        rows.set(id, { data: JSON.stringify(data), version: 1 });
    },
    async update(id, data, version) {
      store.beforeUpdate?.();
      const row = rows.get(id);
      if (!row || row.version !== version) return false;
      rows.set(id, { data: JSON.stringify(data), version: version + 1 });
      return true;
    },
  };
  return store;
}

/** A fake Supabase project: accounts, sessions, photos and sent emails. */
function fakeProject() {
  const accounts = new Map<
    string,
    { id: string; email: string; password: string; banned?: boolean }
  >();
  const revoked: string[] = [];
  const files = new Map<string, Uint8Array>();
  const emails: any[] = [];
  const store = memoryStore();
  const env = {
    BOOTSTRAP_SECRET: "setup-secret",
    JOB_SECRET: "job-secret",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "x@y.z",
  };
  const auth = {
    async createUser(email: string, password: string) {
      if ([...accounts.values()].some((a) => a.email === email))
        throw Error(
          "A user with this email address has already been registered",
        );
      const id = "id-" + email.split("@")[0];
      accounts.set(id, { id, email, password });
      return id;
    },
    async deleteUser(id: string) {
      accounts.delete(id);
    },
    async setPassword(id: string, password: string) {
      accounts.get(id)!.password = password;
    },
    async verifyPassword(email: string, password: string) {
      return [...accounts.values()].some(
        (a) => a.email === email && a.password === password,
      );
    },
    async revokeSessions(id: string) {
      revoked.push(id);
    },
    async disable(id: string) {
      accounts.get(id)!.banned = true;
    },
    async recoveryLink(email: string, redirectTo: string) {
      return redirectTo + "#recovery-for-" + email;
    },
  };
  const photos = {
    async put(path: string, bytes: Uint8Array) {
      files.set(path, bytes);
    },
    async remove(path: string) {
      files.delete(path);
    },
    async signedUrls(paths: string[]) {
      return Object.fromEntries(paths.map((p) => [p, "https://signed/" + p]));
    },
  };
  const fetchFn = (async (_url: string, init: any) => {
    emails.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  /** Calls the API as `username` (signed in now), or as a visitor. */
  const as = (username: string | null, issuedAt = nowSeconds()): Context => {
    const account = username
      ? [...accounts.values()].find(
          (a) => a.email.startsWith(username + "@") || a.email === username,
        )
      : null;
    return {
      user: account ? { id: account.id, email: account.email, issuedAt } : null,
      store,
      auth,
      photos,
      env,
      fetch: fetchFn,
    };
  };
  return { store, accounts, revoked, files, emails, as };
}

const PASSWORD = "a-long-password-123";

async function setup() {
  const p = fakeProject();
  const admin = await handle(
    {
      action: "setupAdmin",
      secret: "setup-secret",
      username: "ada",
      name: "Ada Admin",
      password: PASSWORD,
    },
    p.as(null),
  );
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  for (const [username, name, birthday] of [
    ["ben", "Ben Banana", "20-11"],
    ["cat", "Cat Banana", "01-02"],
    ["dan", "Dan Banana", "15-03"],
  ]) {
    const r = await handle(
      { action: "createUser", username, name, birthday, password: PASSWORD },
      p.as("ada"),
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  return p;
}

test("visitors must log in, and are told when the bunch needs its first admin", async () => {
  const p = fakeProject();
  const r = await handle({}, p.as(null));
  assert.equal(r.status, 401);
  assert.equal(r.body.needsSetup, true);
  const after = await setup();
  assert.equal((await handle({}, after.as(null))).body.needsSetup, false);
});

test("the mascot is only handed out to signed-in members, as a private link", async () => {
  const p = await setup();
  assert.equal((await handle({}, p.as(null))).body.mascotUrl, undefined);
  const r = await handle({}, p.as("ben"));
  assert.equal(r.body.mascotUrl, "https://signed/app/banana-ninja-v1.png");
});

test("the first admin needs the setup secret, and only once", async () => {
  const p = fakeProject();
  const wrong = await handle(
    {
      action: "setupAdmin",
      secret: "nope",
      username: "ada",
      name: "Ada",
      password: PASSWORD,
    },
    p.as(null),
  );
  assert.equal(wrong.status, 403);
  const ok = await setup();
  const again = await handle(
    {
      action: "setupAdmin",
      secret: "setup-secret",
      username: "eve",
      name: "Eve",
      password: PASSWORD,
    },
    ok.as(null),
  );
  assert.equal(again.status, 403);
  const me = await handle({}, ok.as("ada"));
  assert.equal(me.body.admin, true);
});

test("self sign-up and invitations are switched off", async () => {
  const p = await setup();
  for (const action of ["register", "invite", "join"])
    assert.equal((await handle({ action }, p.as("ada"))).status, 403);
});

test("only admins create users, usernames are unique, and birthdays are DD-MM", async () => {
  const p = await setup();
  const notAdmin = await handle(
    {
      action: "createUser",
      username: "zed",
      name: "Zed",
      birthday: "01-01",
      password: PASSWORD,
    },
    p.as("ben"),
  );
  assert.match(notAdmin.body.error, /Administrator/);
  const taken = await handle(
    {
      action: "createUser",
      username: "BEN",
      name: "Ben Again",
      birthday: "01-01",
      password: PASSWORD,
    },
    p.as("ada"),
  );
  assert.match(taken.body.error, /already taken/);
  const badDate = await handle(
    {
      action: "createUser",
      username: "zed",
      name: "Zed",
      birthday: "31-02",
      password: PASSWORD,
    },
    p.as("ada"),
  );
  assert.match(badDate.body.error, /valid birthday/);
  assert.equal(
    p.accounts.has("id-zed"),
    false,
    "no login is left behind for a failed create",
  );
  const ben = (await handle({}, p.as("ada"))).body.people.find(
    (x: any) => x.name === "Ben Banana",
  );
  assert.equal(ben.birthday, "11-20", "stored internally as MM-DD");
});

test("admins can list users; private sign-in details never leave the server", async () => {
  const p = await setup();
  const list = await handle({ action: "listUsers" }, p.as("ada"));
  assert.deepEqual(list.body.users.map((u: any) => u.username).sort(), [
    "ada",
    "ben",
    "cat",
    "dan",
  ]);
  assert.match(
    (await handle({ action: "listUsers" }, p.as("ben"))).body.error,
    /Administrator/,
  );
  const view = await handle({}, p.as("ben"));
  assert.ok(
    view.body.people.every(
      (x: any) => !("authEmail" in x) && !("sessionsValidAfter" in x),
    ),
  );
  assert.equal(view.body.accountAudit, undefined);
});

test("changing your password signs you out everywhere", async () => {
  const p = await setup();
  const oldToken = nowSeconds();
  const wrong = await handle(
    {
      action: "changePassword",
      currentPassword: "not-my-password",
      newPassword: "a-new-password-456",
      confirmPassword: "a-new-password-456",
    },
    p.as("ben", oldToken),
  );
  assert.match(wrong.body.error, /current password is incorrect/);
  mock.timers.tick(5000);
  const ok = await handle(
    {
      action: "changePassword",
      currentPassword: PASSWORD,
      newPassword: "a-new-password-456",
      confirmPassword: "a-new-password-456",
    },
    p.as("ben", oldToken),
  );
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(p.revoked, ["id-ben"]);
  assert.equal(
    (await handle({}, p.as("ben", oldToken))).status,
    401,
    "old token refused",
  );
  mock.timers.tick(2000);
  assert.equal(
    (await handle({}, p.as("ben"))).status,
    200,
    "a fresh login works",
  );
});

test("admins can reset someone's password; members can't", async () => {
  const p = await setup();
  const denied = await handle(
    {
      action: "adminResetPassword",
      user: "id-cat",
      password: "reset-password-789",
      confirmPassword: "reset-password-789",
    },
    p.as("ben"),
  );
  assert.match(denied.body.error, /Administrator/);
  const ok = await handle(
    {
      action: "adminResetPassword",
      user: "id-cat",
      password: "reset-password-789",
      confirmPassword: "reset-password-789",
    },
    p.as("ada"),
  );
  assert.equal(ok.status, 200);
  assert.equal(p.accounts.get("id-cat")!.password, "reset-password-789");
  assert.deepEqual(p.revoked, ["id-cat"]);
});

test("deleting a Banana blocks their login and keeps history", async () => {
  const p = await setup();
  assert.match(
    (await handle({ action: "deleteUser", user: "id-ada" }, p.as("ada"))).body
      .error,
    /own admin account/,
  );
  const r = await handle({ action: "deleteUser", user: "id-dan" }, p.as("ada"));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(p.accounts.get("id-dan")!.banned, true);
  assert.ok(p.revoked.includes("id-dan"));
  assert.equal((await handle({}, p.as("dan"))).status, 401);
  const users = (await handle({ action: "listUsers" }, p.as("ada"))).body.users;
  assert.ok(!users.some((u: any) => u.id === "id-dan"));
});

test("the birthday person can't see or open their own event", async () => {
  const p = await setup();
  // Ben's birthday (20 Nov) is within a month of the pinned date.
  const cat = await handle({}, p.as("cat"));
  const event = cat.body.events.find((e: any) => e.person === "id-ben");
  assert.ok(event, "the others can see Ben's event");
  const ben = await handle({}, p.as("ben"));
  assert.ok(!ben.body.events.some((e: any) => e.person === "id-ben"));
  assert.equal(
    (
      await handle(
        { action: "vote", event: event.id, option: "x" },
        p.as("ben"),
      )
    ).status,
    404,
  );
});

test("suggesting a gift adds your vote; others can vote too", async () => {
  const p = await setup();
  const event = (await handle({}, p.as("cat"))).body.events.find(
    (e: any) => e.person === "id-ben",
  );
  const r = await handle(
    { action: "suggest", event: event.id, name: "Pottery class", price: "90" },
    p.as("cat"),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const idea = r.body.events
    .find((e: any) => e.id === event.id)
    .options.find((o: any) => o.name === "Pottery class");
  assert.deepEqual(idea.votes, ["id-cat"]);
  const voted = await handle(
    { action: "vote", event: event.id, option: idea.id },
    p.as("dan"),
  );
  assert.equal(
    voted.body.events
      .find((e: any) => e.id === event.id)
      .options.find((o: any) => o.id === idea.id).votes.length,
    2,
  );
});

test("profiles take DD-MM birthdays and keep recovery emails unique", async () => {
  const p = await setup();
  const ok = await handle(
    {
      action: "profile",
      name: "Ben B",
      birthday: "21-11",
      email: "ben@example.com",
      description: "Loves pottery and long walks",
    },
    p.as("ben"),
  );
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const me = ok.body.people.find((x: any) => x.id === "id-ben");
  assert.equal(me.birthday, "11-21");
  assert.equal(me.email, "ben@example.com");
  const clash = await handle(
    {
      action: "profile",
      name: "Cat",
      birthday: "01-02",
      email: "ben@example.com",
    },
    p.as("cat"),
  );
  assert.match(clash.body.error, /already in use/);
  // Other members don't see Ben's email; the admin does.
  assert.equal(
    (await handle({}, p.as("cat"))).body.people.find(
      (x: any) => x.id === "id-ben",
    ).email,
    undefined,
  );
  assert.equal(
    (await handle({}, p.as("ada"))).body.people.find(
      (x: any) => x.id === "id-ben",
    ).email,
    "ben@example.com",
  );
});

test("password reset links go to the recovery email, without revealing who's a member", async () => {
  const p = await setup();
  await handle(
    {
      action: "profile",
      name: "Ben",
      birthday: "20-11",
      email: "ben@example.com",
    },
    p.as("ben"),
  );
  const unknown = await handle(
    {
      action: "resetRequest",
      email: "nobody@example.com",
      redirectTo: "https://site/",
    },
    p.as(null),
  );
  const known = await handle(
    {
      action: "resetRequest",
      email: "ben@example.com",
      redirectTo: "https://site/",
    },
    p.as(null),
  );
  assert.equal(unknown.body.message, known.body.message);
  assert.equal(p.emails.length, 1);
  assert.deepEqual(p.emails[0].to, ["ben@example.com"]);
  assert.match(p.emails[0].text, /recovery-for-ben@bananabunch\.invalid/);
});

// The smallest valid PNG header: signature, IHDR length/type, 1x1 size.
const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0,
]);

test("photos: only images are accepted, and event photos stay hidden from the birthday person", async () => {
  const p = await setup();
  const event = (await handle({}, p.as("cat"))).body.events.find(
    (e: any) => e.person === "id-ben",
  );
  const notImage = await uploadPhoto(
    new TextEncoder().encode("<svg></svg>"),
    event.id,
    p.as("cat"),
  );
  assert.equal(notImage.status, 400);
  const up = await uploadPhoto(png, event.id, p.as("cat"));
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.match(up.body.url, /^https:\/\/signed\//);
  const r = await handle(
    {
      action: "suggest",
      event: event.id,
      name: "Framed print",
      photo: up.body.id,
    },
    p.as("cat"),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.photoUrls[up.body.id], "the uploader gets a viewing link");
  const ben = await handle({}, p.as("ben"));
  assert.equal(
    ben.body.photoUrls[up.body.id],
    undefined,
    "the birthday person doesn't",
  );
  assert.equal((await uploadPhoto(png, event.id, p.as("ben"))).status, 404);
  // A wishlist can't borrow a photo uploaded for an event.
  const borrow = await handle(
    { action: "wishlist", name: "Print", photo: up.body.id },
    p.as("cat"),
  );
  assert.match(borrow.body.error, /not one of your uploads/);
});

test("a save that loses a race is retried instead of overwriting", async () => {
  const p = await setup();
  let raced = false;
  p.store.beforeUpdate = () => {
    if (raced) return;
    raced = true;
    const row = p.store.rows.get("group")!;
    const other = JSON.parse(row.data);
    other.wishlist.push({
      id: "other",
      owner: "id-cat",
      name: "Cat's wish",
      addedAt: new Date().toISOString(),
    });
    p.store.rows.set("group", {
      data: JSON.stringify(other),
      version: row.version + 1,
    });
  };
  const r = await handle(
    { action: "wishlist", name: "Ben's wish" },
    p.as("ben"),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const names = r.body.wishlist.map((w: any) => w.name).sort();
  assert.deepEqual(names, ["Ben's wish", "Cat's wish"]);
});

test("scheduled jobs need the job secret", async () => {
  const p = await setup();
  assert.equal(
    (await handle({ action: "jobs", secret: "wrong" }, p.as(null))).status,
    401,
  );
  assert.equal(
    (await handle({ action: "jobs", secret: "job-secret" }, p.as(null))).status,
    200,
  );
});

test("unknown actions and unexpected errors return clean messages", async () => {
  const p = await setup();
  assert.equal((await handle({ action: "nope" }, p.as("ben"))).status, 400);
  const broken: Store = {
    load: async () => {
      throw new TypeError("database down");
    },
    createIfMissing: async () => {},
    update: async () => true,
  };
  const original = console.error;
  console.error = () => {};
  const r = await handle({}, { ...p.as("ben"), store: broken });
  console.error = original;
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "Something went wrong");
});

test("profile pictures: members set their own, admins can set anyone's", async () => {
  const p = await setup();
  const mine = await uploadPhoto(png, "", p.as("ben"));
  const saved = await handle(
    {
      action: "profile",
      name: "Ben Banana",
      birthday: "20-11",
      profilePhoto: mine.body.id,
      photoZoom: "2",
      photoX: "0",
      photoY: "100",
    },
    p.as("ben"),
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const ben = saved.body.people.find((x: any) => x.id === "id-ben");
  assert.equal(ben.profilePhoto, mine.body.id);
  assert.deepEqual(ben.profilePhotoCrop, { zoom: 2, x: 0, y: 100 });
  // Setting a picture earns 2 Banana Points, once.
  const pictureRewards = () =>
    p.store.rows.get("group")
      ? JSON.parse(p.store.rows.get("group")!.data).ledger.filter(
          (l: any) => l.key === "picture:id-ben",
        )
      : [];
  assert.deepEqual(
    saved.body.rewards.map((r: any) => [r.reason, r.points]),
    [["Profile picture", 2]],
  );
  await handle(
    {
      action: "profile",
      name: "Ben Banana",
      birthday: "20-11",
      profilePhoto: mine.body.id,
    },
    p.as("ben"),
  );
  assert.equal(pictureRewards().length, 1);
  // Everyone in the bunch gets a link to it.
  const cat = await handle({}, p.as("cat"));
  assert.ok(cat.body.photoUrls[mine.body.id]);
  // Members can't upload for someone else, or use someone else's photo.
  assert.equal((await uploadPhoto(png, "", p.as("cat"), "id-ben")).status, 403);
  const borrow = await handle(
    {
      action: "profile",
      name: "Cat Banana",
      birthday: "01-02",
      profilePhoto: mine.body.id,
    },
    p.as("cat"),
  );
  assert.equal(borrow.status, 400);
  // The admin can.
  const forCat = await uploadPhoto(png, "", p.as("ada"), "id-cat");
  assert.equal(forCat.status, 200, JSON.stringify(forCat.body));
  const set = await handle(
    {
      action: "adminProfilePhoto",
      user: "id-cat",
      profilePhoto: forCat.body.id,
    },
    p.as("ada"),
  );
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(
    set.body.people.find((x: any) => x.id === "id-cat").profilePhoto,
    forCat.body.id,
  );
  const notAdmin = await handle(
    { action: "adminProfilePhoto", user: "id-cat", profilePhoto: "" },
    p.as("ben"),
  );
  assert.equal(notAdmin.status, 400);
});

test("the admin can save their profile without a birthday", async () => {
  const p = await setup();
  const r = await handle(
    { action: "profile", name: "Ada Admin", birthday: "" },
    p.as("ada"),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const member = await handle(
    { action: "profile", name: "Ben Banana", birthday: "" },
    p.as("ben"),
  );
  assert.equal(member.status, 400);
});

test("a birthday wishlist stays hidden from the bunch for its first week", async () => {
  const p = await setup();
  await handle({ action: "wishlist", name: "Ben's wish" }, p.as("ben"));
  // Ben's page opened on 20 Oct; it's 25 Oct, so the wishlist is still hidden.
  const cat = await handle({}, p.as("cat"));
  const event = cat.body.events.find((e: any) => e.person === "id-ben");
  assert.equal(event.wishlistHidden, true);
  assert.deepEqual(event.currentWishlist, []);
  assert.equal(
    cat.body.wishlist.some((w: any) => w.owner === "id-ben"),
    false,
  );
  // Ben still sees his own.
  const ben = await handle({}, p.as("ben"));
  assert.equal(
    ben.body.wishlist.some((w: any) => w.owner === "id-ben"),
    true,
  );
});

test("only the admin can redraw every upcoming organiser", async () => {
  const p = await setup();
  const member = await handle({ action: "reassignAllOrganisers" }, p.as("ben"));
  assert.equal(member.status, 400);
  const r = await handle({ action: "reassignAllOrganisers" }, p.as("ada"));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(
    r.body.message,
    /Reassigned organisers for 1 upcoming birthday\./,
  );
});

test("an admin can edit someone's calendar event and keep its photo", async () => {
  const p = await setup();
  const photo = await uploadPhoto(png, "", p.as("ben"));
  const added = await handle(
    {
      action: "addCalendarEvent",
      title: "Picnic",
      date: "2027-01-10",
      photo: photo.body.id,
    },
    p.as("ben"),
  );
  assert.equal(added.status, 200, JSON.stringify(added.body));
  const item = added.body.calendarEvents[0];
  assert.ok(added.body.photoUrls[photo.body.id]);
  const byOther = await handle(
    {
      action: "updateCalendarEvent",
      id: item.id,
      title: "Mine now",
      date: "2027-01-10",
    },
    p.as("cat"),
  );
  assert.equal(byOther.status, 400);
  const byAdmin = await handle(
    {
      action: "updateCalendarEvent",
      id: item.id,
      title: "Picnic in the park",
      date: "2027-01-10",
      photo: photo.body.id,
    },
    p.as("ada"),
  );
  assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
  assert.equal(byAdmin.body.calendarEvents[0].title, "Picnic in the park");
  const gone = await handle(
    { action: "deleteCalendarEvent", id: item.id },
    p.as("ben"),
  );
  assert.equal(gone.body.calendarEvents.length, 0);
});

test("the admin can edit a Banana's details, but members can't", async () => {
  const p = await setup();
  await handle(
    {
      action: "profile",
      name: "Cat Banana",
      birthday: "01-02",
      email: "cat@example.com",
    },
    p.as("cat"),
  );
  const notAdmin = await handle(
    {
      action: "adminUpdateUser",
      user: "id-cat",
      name: "Hacked",
      birthday: "01-01",
    },
    p.as("ben"),
  );
  assert.equal(notAdmin.status, 400);
  const taken = await handle(
    {
      action: "adminUpdateUser",
      user: "id-ben",
      name: "Ben Banana",
      birthday: "20-11",
      email: "cat@example.com",
    },
    p.as("ada"),
  );
  assert.match(taken.body.error, /already in use/);
  const noBirthday = await handle(
    {
      action: "adminUpdateUser",
      user: "id-ben",
      name: "Ben Banana",
      birthday: "",
    },
    p.as("ada"),
  );
  assert.equal(noBirthday.status, 400);
  const r = await handle(
    {
      action: "adminUpdateUser",
      user: "id-ben",
      name: "Benjamin Banana",
      birthday: "21-12",
      email: "ben@example.com",
      description: "Loves puzzles",
    },
    p.as("ada"),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.message, /Benjamin Banana/);
  const ben = r.body.people.find((x: any) => x.id === "id-ben");
  assert.equal(ben.name, "Benjamin Banana");
  assert.equal(ben.birthday, "12-21");
  assert.equal(ben.description, "Loves puzzles");
  assert.equal(ben.username, "ben");
  const list = await handle({ action: "listUsers" }, p.as("ada"));
  assert.equal(
    list.body.users.find((u: any) => u.id === "id-ben").email,
    "ben@example.com",
  );
});
