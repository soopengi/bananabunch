// The bananabunch API, independent of Supabase so it can be tested with fakes.
// supabase/functions/circle/index.ts plugs in the real database, sign-in and
// photo storage.
//
// Every request is { action, ...fields }. No action just loads the circle.
// The response is the part of the circle the caller may see (see visible()).
// The whole circle lives in one document, "group".
import {
  loginEmail,
  photoCrop,
  validatePassword,
  validateUser,
} from "./accounts.ts";
import { parseBirthday } from "./birthdays.ts";
import {
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./calendar-events.ts";
import { newCircle, weights } from "./circle-data.ts";
import {
  completeRole,
  selectGift,
  setBudget,
  undoCompleteRole,
} from "./event-actions.ts";
import { addSuggestion, editSuggestion } from "./ideas.ts";
import { canViewPhoto, MAX_PHOTO_BYTES, photoType } from "./photos.ts";
import {
  acknowledgeReward,
  initializeRewards,
  pendingRewards,
} from "./rewards.ts";
import {
  award,
  notify,
  reassignUpcomingOrganisers,
  runJobs,
  visible,
  wishlistIsAvailable,
} from "./rules.ts";
import { deleteUser } from "./user-deletion.ts";
import { votingOpen } from "./voting.ts";
import { maintainWishlist } from "./wishlist-lifecycle.ts";
import { currentEventWishlist, syncWishlistOptions } from "./wishlist-sync.ts";

const DAY_MS = 86400000;
const GROUP = "group";
/** The banana ninja mascot, uploaded once to the private photos bucket. */
const MASCOT_PATH = "app/banana-ninja-v1.png";

/** Where circle documents are kept. Updates only apply if `version` still matches. */
export interface Store {
  load(id: string): Promise<{ data: any; version: number } | null>;
  createIfMissing(id: string, data: any): Promise<void>;
  update(id: string, data: any, version: number): Promise<boolean>;
}

/** Supabase Auth, as seen by the handler. */
export interface Auth {
  createUser(email: string, password: string): Promise<string>;
  deleteUser(id: string): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** Signs the user out everywhere (their refresh tokens stop working). */
  revokeSessions(id: string): Promise<void>;
  /** Permanently blocks sign-in (used when a Banana is deleted). */
  disable(id: string): Promise<void>;
  /** A one-time password-reset link for the account with this sign-in email. */
  recoveryLink(email: string, redirectTo: string): Promise<string>;
}

/** Private photo storage. */
export interface Photos {
  put(path: string, bytes: Uint8Array, type: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Short-lived links for viewing photos, keyed by path. */
  signedUrls(paths: string[]): Promise<Record<string, string>>;
}

/** The signed-in Supabase user, or null. `issuedAt` is the token's `iat` (seconds). */
export type User = { id: string; email?: string; issuedAt?: number } | null;

export interface Env {
  BOOTSTRAP_SECRET?: string;
  JOB_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface Context {
  user: User;
  store: Store;
  auth: Auth;
  photos: Photos;
  env: Env;
  fetch?: typeof fetch;
}

export type Reply = { status: number; body: any };

/** Thrown for problems the user can fix; the message is shown to them. */
class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function safeLink(link: any) {
  if (!link) return "";
  let url: URL;
  try {
    url = new URL(String(link));
  } catch {
    throw new UserError("Please enter a valid HTTPS link.");
  }
  if (url.protocol !== "https:")
    throw new UserError("Please use an HTTPS product link.");
  return url.href.slice(0, 2000);
}

const isActive = (p: any) => p && !p.disabled && !p.deletedAt;

async function loadGroup(store: Store) {
  if (!(await store.load(GROUP)))
    await store.createIfMissing(GROUP, newCircle());
  return (await store.load(GROUP))!.data;
}

/**
 * Applies `change` to the circle and saves it. If someone else saved in the
 * meantime, re-reads and tries again, so no update is ever lost.
 */
async function mutate<T>(
  store: Store,
  change: (circle: any) => T,
): Promise<{ circle: any; result: T }> {
  await loadGroup(store);
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = (await store.load(GROUP))!;
    const circle = row.data;
    const result = change(circle);
    if (await store.update(GROUP, circle, row.version))
      return { circle, result };
  }
  throw new UserError("Your bunch is busy. Please try again.");
}

/** Sign-out-everywhere marker: tokens issued before this are refused. */
function sessionsValidAfter(now = Date.now()) {
  return new Date(Math.floor(now / 1000) * 1000).toISOString();
}

/** The email the person signs in with (a hidden one for username accounts). */
function signInEmail(person: any) {
  return (
    person.authEmail ||
    (person.username ? loginEmail(person.username) : person.email)
  );
}

export async function handle(body: any, ctx: Context): Promise<Reply> {
  try {
    return await route(body || {}, ctx);
  } catch (error: any) {
    if (error instanceof UserError)
      return { status: error.status, body: { error: error.message } };
    // The shared rule modules throw plain Errors with messages meant for the
    // user. Anything else (a TypeError, a database failure) is a bug.
    if (error?.constructor === Error)
      return {
        status: error.message === "Event not found" ? 404 : 400,
        body: { error: error.message },
      };
    console.error(error);
    return { status: 500, body: { error: "Something went wrong" } };
  }
}

async function route(body: any, ctx: Context): Promise<Reply> {
  const { store, auth, env } = ctx;
  let action = body.action;

  if (["register", "invite", "join"].includes(action))
    return {
      status: 403,
      body: {
        error:
          "Accounts are created by your administrator. Please ask them for your login.",
      },
    };

  // Daily scheduled run (see README): opens events, closes votes, sends emails.
  if (action === "jobs") {
    if (!env.JOB_SECRET || body.secret !== env.JOB_SECRET)
      return { status: 401, body: { error: "Unauthorised" } };
    const { circle } = await mutate(store, (d) => {
      initializeRewards(d);
      runJobs(d);
      maintainWishlist(d);
      syncWishlistOptions(d);
    });
    await deliver(ctx);
    return { status: 200, body: { ok: true, events: circle.events.length } };
  }

  if (action === "setupAdmin") return setupAdmin(body, ctx);
  if (action === "resetRequest") return resetRequest(body, ctx);

  // Everything else needs a signed-in, active member.
  const group = await loadGroup(store);
  const me = ctx.user && group.people.find((p: any) => p.id === ctx.user!.id);
  const tokenTooOld =
    me?.sessionsValidAfter &&
    (ctx.user!.issuedAt || 0) * 1000 < Date.parse(me.sessionsValidAfter);
  if (!isActive(me) || tokenTooOld)
    return {
      status: 401,
      body: {
        error: "Please log in first.",
        needsSetup: !group.people.some((p: any) => p.admin && isActive(p)),
      },
    };
  const uid = me.id as string;
  const requireAdmin = (person: any) => {
    if (!person?.admin) throw new UserError("Administrator access required.");
  };

  if (action === "logout") return { status: 200, body: { ok: true } };

  if (action === "changePassword") {
    if (body.newPassword !== body.confirmPassword)
      throw new UserError("The new passwords do not match.");
    validatePassword(body.newPassword);
    if (
      typeof body.currentPassword !== "string" ||
      !(await auth.verifyPassword(
        ctx.user!.email || signInEmail(me),
        body.currentPassword,
      ))
    )
      throw new UserError("Your current password is incorrect.");
    if (body.currentPassword === body.newPassword)
      throw new UserError("Choose a different new password.");
    await auth.setPassword(uid, body.newPassword);
    await signOutEverywhere(ctx, uid, "password changed", uid);
    return {
      status: 200,
      body: {
        ok: true,
        message: "Password changed. Please log in with your new password.",
      },
    };
  }

  if (action === "adminResetPassword") {
    requireAdmin(me);
    if (body.password !== body.confirmPassword)
      throw new UserError("The passwords do not match.");
    validatePassword(body.password);
    const target = group.people.find(
      (p: any) => p.id === String(body.user) && isActive(p),
    );
    if (!target) throw new UserError("Choose an active Banana.");
    await auth.setPassword(target.id, body.password);
    await signOutEverywhere(ctx, target.id, "password reset by admin", uid);
    return {
      status: 200,
      body: {
        ok: true,
        message:
          "Password reset. Share the new password privately. Previous sessions have been signed out.",
      },
    };
  }

  if (action === "createUser") {
    requireAdmin(me);
    const fields = validateUser(body);
    validatePassword(body.password);
    if (
      group.people.some(
        (p: any) => (p.username || "").toLowerCase() === fields.username,
      )
    )
      throw new UserError("That username is already taken.");
    if (
      fields.email &&
      group.people.some(
        (p: any) => (p.email || "").toLowerCase() === fields.email,
      )
    )
      throw new UserError("That email is already in use.");
    const authEmail = loginEmail(fields.username);
    let id: string;
    try {
      id = await auth.createUser(authEmail, body.password);
    } catch (error: any) {
      if (/already|registered|exists/i.test(error?.message || ""))
        throw new UserError("That username is already taken.");
      throw error;
    }
    try {
      await mutate(store, (d) => {
        if (
          d.people.some(
            (p: any) => (p.username || "").toLowerCase() === fields.username,
          )
        )
          throw new UserError("That username is already taken.");
        const createdAt = new Date().toISOString();
        d.people.push({
          ...fields,
          id,
          authEmail,
          description: "",
          color: "#dbd3c9",
          admin: false,
          preferences: { email: false, discord: false },
          createdAt,
        });
        d.accountAudit = d.accountAudit || [];
        d.accountAudit.push({
          action: "user created",
          user: id,
          by: uid,
          at: createdAt,
        });
      });
    } catch (error) {
      await auth.deleteUser(id); // don't leave a login with no profile
      throw error;
    }
    return {
      status: 200,
      body: {
        ok: true,
        message:
          "User created. Share their username and temporary password privately.",
      },
    };
  }

  if (action === "listUsers") {
    requireAdmin(me);
    return {
      status: 200,
      body: {
        users: group.people
          .filter((p: any) => !p.deletedAt)
          .map((p: any) => ({
            id: p.id,
            username: p.username || "",
            name: p.name,
            email: p.email || "",
            birthday: p.birthday,
            description: p.description || "",
            admin: !!p.admin,
            disabled: !!p.disabled,
            profilePhoto: p.profilePhoto || "",
            profilePhotoCrop: p.profilePhotoCrop || null,
            createdAt: p.createdAt || null,
          })),
      },
    };
  }

  const eventId = body.event;

  // A photo attached to something must have been uploaded for that same
  // place. `keep` is the photo already there, which may stay as it is.
  const requireOwnPhoto = (id: any, owner: string, keep?: string) => {
    if (!id || id === keep) return;
    const photo = group.photos?.[String(id)];
    if (!photo) throw new UserError("Please upload the photo again.");
    if (photo.event || photo.owner !== owner)
      throw new UserError("This photo is not one of your uploads.");
  };
  if (body.photo && (action === "suggest" || action === "editSuggestion")) {
    const photo = group.photos?.[String(body.photo)];
    if (!photo) throw new UserError("Please upload the photo again.");
    if (!eventId || photo.event !== eventId)
      throw new UserError("This photo belongs to a different event.");
  }
  if (["wishlist", "editWishlist", "addCalendarEvent"].includes(action))
    requireOwnPhoto(body.photo, uid);
  if (action === "updateCalendarEvent")
    requireOwnPhoto(
      body.photo,
      uid,
      (group.calendarEvents || []).find((c: any) => c.id === String(body.id))
        ?.photo,
    );
  if (action === "profile")
    requireOwnPhoto(body.profilePhoto, uid, me.profilePhoto);
  if (action === "adminProfilePhoto") {
    requireAdmin(me);
    const target = group.people.find((p: any) => p.id === String(body.user));
    requireOwnPhoto(body.profilePhoto, String(body.user), target?.profilePhoto);
  }

  // The profile form is saved as part of the normal update below.
  const profile =
    action === "profile" ? validateProfile(body, !!me.admin) : null;
  if (profile) action = "";

  const { circle, result } = await mutate(store, (d) => {
    const me = d.people.find((p: any) => p.id === uid);
    if (!isActive(me)) throw new UserError("Your account is not active.", 401);
    if (!me.authEmail && ctx.user?.email) me.authEmail = ctx.user.email;
    initializeRewards(d);
    runJobs(d);

    if (profile) {
      if (
        profile.email &&
        d.people.some(
          (p: any) =>
            p.id !== uid && (p.email || "").toLowerCase() === profile.email,
        )
      )
        throw new UserError("That email is already in use.");
      Object.assign(me, {
        name: profile.name,
        email: profile.email,
        birthday: profile.birthday,
        description: profile.description,
      });
      if (body.profilePhoto !== undefined) {
        me.profilePhoto = String(body.profilePhoto || "");
        me.profilePhotoCrop = photoCrop(body);
      }
      if (profile.emailNotifications !== undefined)
        me.preferences = {
          ...me.preferences,
          email: profile.emailNotifications === "on",
        };
      if (me.description.trim().length >= 20)
        award(
          d,
          "description:" + uid,
          uid,
          d.settings.weights.description,
          "Profile description",
        );
      if (me.profilePhoto)
        award(
          d,
          "picture:" + uid,
          uid,
          d.settings.weights.picture ?? weights.picture,
          "Profile picture",
        );
    }

    // The birthday person can never open their own event.
    const e = eventId
      ? d.events.find((e: any) => e.id === eventId && e.person !== uid)
      : null;
    if (eventId && !e) throw new UserError("Event not found", 404);

    const requireOrganiser = () => {
      if (!e || (![e.gift, e.cake].includes(uid) && !me.admin))
        throw new UserError("An assigned organiser is required.");
    };
    const requireVotingOpen = () => {
      if (!votingOpen(e)) throw new UserError("Voting is closed.");
    };
    // Builds a gift idea / wishlist item from the submitted form fields.
    const itemFromForm = (kind: string) => {
      const name = String(body.name || "").trim();
      if (name.length < 3)
        throw new UserError("Please add a name of at least 3 characters.");
      const price = Number(body.price) || 0;
      if (price < 0 || price > 1000000)
        throw new UserError("Please check the estimated price.");
      return {
        id: crypto.randomUUID(),
        name: name.slice(0, 120),
        description: String(body.description || "").slice(0, 500),
        link: safeLink(body.link),
        price,
        currency: String(body.currency || "AUD").slice(0, 3),
        kind,
        by: uid,
        votes: [] as string[],
        photo: String(body.photo || ""),
        art: "🎁",
      };
    };

    const out = applyAction();
    maintainWishlist(d);
    syncWishlistOptions(d);
    return out;

    function applyAction(): any {
      switch (action) {
        case undefined:
        case "":
          return undefined; // just load (or a saved profile)

        case "deleteUser":
          deleteUser(d, uid, String(body.user));
          return { deleted: String(body.user) };

        case "vote": {
          requireVotingOpen();
          const option = e.options.find((o: any) => o.id === body.option);
          if (!option) throw new UserError("Option not found");
          option.votes = option.votes.includes(uid)
            ? option.votes.filter((v: string) => v !== uid)
            : [...new Set([...option.votes, uid])];
          return undefined;
        }

        // Ideas stay open after voting closes, until the gift is chosen.
        case "suggest": {
          addSuggestion(e, itemFromForm("suggestion"), uid);
          const daysOpen = (Date.now() - Date.parse(e.created)) / DAY_MS;
          award(
            d,
            "early:" + e.id + ":" + uid,
            uid,
            daysOpen < 3 ? 3 : daysOpen < 7 ? 2 : 1,
            "Early gift idea",
            e.id,
          );
          return undefined;
        }

        case "editSuggestion":
          editSuggestion(e, String(body.id), itemFromForm("suggestion"), uid);
          return undefined;

        // The organiser wheel has been watched (so it doesn't auto-play again).
        case "revealSeen":
          if (!e) throw new UserError("Event not found", 404);
          e.revealedTo = [...new Set([...(e.revealedTo || []), uid])];
          return undefined;

        case "ackReward":
          acknowledgeReward(d, uid, String(body.key));
          return undefined;

        case "wishlist": {
          const wish = {
            ...itemFromForm("wishlist"),
            owner: uid,
            addedAt: new Date().toISOString(),
          };
          d.wishlist.push(wish);
          const earned = d.ledger
            .filter((l: any) => l.user === uid && l.reason === "Wishlist item")
            .reduce((sum: number, l: any) => sum + l.points, 0);
          if (earned < 6)
            award(
              d,
              "wishlist:" +
                uid +
                ":" +
                wish.name.toLowerCase() +
                ":" +
                wish.link,
              uid,
              Math.min(d.settings.weights.wishlist, 6 - earned),
              "Wishlist item",
            );
          return undefined;
        }

        case "editWishlist": {
          const wish = d.wishlist.find(
            (w: any) => w.id === body.id && w.owner === uid,
          );
          if (!wish) throw new UserError("Wish not found.");
          Object.assign(wish, itemFromForm("wishlist"), {
            id: wish.id,
            owner: uid,
            by: wish.by,
            addedAt: wish.addedAt,
            expiresAt: wish.expiresAt,
            addedDateEstimated: wish.addedDateEstimated,
          });
          return undefined;
        }

        case "removeWishlist":
          d.wishlist = d.wishlist.filter(
            (w: any) => w.id !== body.id || w.owner !== uid,
          );
          return undefined;

        case "budget":
          setBudget(e, uid, body.role, body.amount, body.currency);
          return undefined;

        case "undoComplete":
          undoCompleteRole(d, e, uid, body.role);
          return undefined;

        case "cakeChoice": {
          if (!e || (!me.admin && e.cake !== uid))
            throw new UserError(
              "Only the cake organiser or admin can choose the cake.",
            );
          const name = String(body.name || "").trim();
          if (!name || name.length > 120)
            throw new UserError("Enter a cake name up to 120 characters.");
          e.cakeChoice = {
            name,
            link: safeLink(body.link),
            by: uid,
            at: new Date().toISOString(),
          };
          return undefined;
        }

        // A shared photo-folder link for a (usually past) birthday.
        case "album":
          if (!e) throw new UserError("Event not found", 404);
          e.albumLink = safeLink(body.link);
          e.albumUpdatedBy = uid;
          return undefined;

        case "addCalendarEvent": {
          const birthdayEvent = body.birthdayEvent
            ? d.events.find(
                (item: any) =>
                  item.id === body.birthdayEvent && item.person !== uid,
              )
            : null;
          if (body.birthdayEvent && !birthdayEvent)
            throw new UserError("Birthday event not found.");
          addCalendarEvent(d, uid, {
            ...body,
            birthdayEvent: birthdayEvent?.id,
            hiddenFrom: birthdayEvent?.person,
          });
          return undefined;
        }

        case "updateCalendarEvent":
          updateCalendarEvent(d, uid, body, !!me.admin);
          return undefined;

        case "deleteCalendarEvent":
          deleteCalendarEvent(d, uid, String(body.id), !!me.admin);
          return undefined;

        case "adminProfilePhoto": {
          requireAdmin(me);
          const member = d.people.find(
            (p: any) => p.id === String(body.user) && isActive(p),
          );
          if (!member) throw new UserError("Choose an active Banana.");
          member.profilePhoto = String(body.profilePhoto || "");
          member.profilePhotoCrop = photoCrop(body);
          return undefined;
        }

        // Admin edits another Banana's details. The username (their login)
        // and their reminder settings stay as they are.
        case "adminUpdateUser": {
          requireAdmin(me);
          const member = d.people.find(
            (p: any) => p.id === String(body.user) && isActive(p),
          );
          if (!member) throw new UserError("Choose an active Banana.");
          const fields = validateProfile(body, !!member.admin);
          if (
            fields.email &&
            d.people.some(
              (p: any) =>
                p.id !== member.id &&
                (p.email || "").toLowerCase() === fields.email,
            )
          )
            throw new UserError("That email is already in use.");
          const before = {
            name: member.name,
            email: member.email || "",
            birthday: member.birthday,
            description: member.description || "",
          };
          Object.assign(member, {
            name: fields.name,
            email: fields.email,
            birthday: fields.birthday,
            description: fields.description,
          });
          d.accountAudit = d.accountAudit || [];
          d.accountAudit.push({
            action: "details edited by admin",
            user: member.id,
            by: uid,
            before,
            at: new Date().toISOString(),
          });
          return { message: "Saved " + member.name + "’s details." };
        }

        case "reassignAllOrganisers": {
          requireAdmin(me);
          const count = reassignUpcomingOrganisers(d);
          return {
            message: `Reassigned organisers for ${count} upcoming birthday${count === 1 ? "" : "s"}.`,
          };
        }

        case "complete":
        case "confirm":
          completeRole(d, e, uid, body.role);
          return undefined;

        case "task": {
          const role =
            body.task === "Gift purchased"
              ? "gift"
              : body.task === "Cake arranged"
                ? "cake"
                : null;
          if (!role)
            throw new UserError("Choose the gift or cake responsibility.");
          completeRole(d, e, uid, role);
          return undefined;
        }

        case "choose":
          selectGift(
            d,
            e,
            uid,
            Array.isArray(body.options) ? body.options : body.option,
          );
          return undefined;

        case "replace": {
          requireOrganiser();
          if (!e.final || String(body.reason || "").trim().length < 8)
            throw new UserError(
              "Give a reason for replacing the selected gift.",
            );
          const replacement = e.options.find((o: any) => o.id === body.option);
          if (!replacement) throw new UserError("Select an available option.");
          e.audit.push({
            action: "replacement",
            previous: e.finals?.length ? e.finals : [e.final],
            next: body.option,
            reason: body.reason,
            by: uid,
            at: new Date().toISOString(),
          });
          e.final = body.option;
          e.finals = [body.option];
          notify(
            d,
            "replacement:" + e.id + ":" + e.audit.length,
            e,
            "The selected gift was replaced. Review the event for details.",
          );
          return undefined;
        }

        case "reassign":
          requireAdmin(me);
          if (
            !e ||
            !["gift", "cake"].includes(body.role) ||
            !d.people.some((p: any) => p.id === body.user && isActive(p)) ||
            body.user === e.person
          )
            throw new UserError("Choose a different eligible member.");
          if (String(body.reason || "").trim().length < 8)
            throw new UserError("A reassignment reason is required.");
          e.audit.push({
            action: "reassignment",
            previous: e[body.role],
            role: body.role,
            by: uid,
            reason: body.reason,
            at: new Date().toISOString(),
          });
          e[body.role] = body.user;
          e.tasks = e.tasks || {};
          delete e.tasks[body.role + " complete"];
          delete e.tasks[
            body.role === "gift" ? "Gift purchased" : "Cake arranged"
          ];
          d.history.push({
            event: e.id,
            user: body.user,
            role: body.role,
            person: e.person,
            date: e.date,
            reason: body.reason,
          });
          notify(
            d,
            "reassign:" + e.id + ":" + e.audit.length,
            e,
            "An organiser assignment has changed.",
          );
          return undefined;

        case "settings":
          requireAdmin(me);
          try {
            new Intl.DateTimeFormat("en-AU", { timeZone: body.timezone });
          } catch {
            throw new UserError("Unknown timezone.");
          }
          d.settings.timezone = body.timezone;
          if (body.weights) {
            for (const key of Object.keys(weights)) {
              const n = Number(body.weights[key]);
              if (!Number.isFinite(n) || n < 0 || n > 100)
                throw new UserError("Weights must be between 0 and 100.");
              d.settings.weights[key] = n;
            }
          }
          return undefined;

        case "read":
          d.notifications.forEach((n: any) => {
            if (n.user === uid) n.read = true;
          });
          return undefined;

        default:
          throw new UserError("Unknown action.");
      }
    }
  });

  // A deleted Banana can't sign in any more.
  if (result?.deleted) {
    await auth.disable(result.deleted);
    await auth.revokeSessions(result.deleted);
  }
  if (env.RESEND_API_KEY) await deliver(ctx);
  return { status: 200, body: await viewFor(circle, uid, ctx, result) };
}

function validateProfile(body: any, isAdmin = false) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const description = String(body.description || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new UserError("Enter a name between 2 and 80 characters.");
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email))
    throw new UserError("Enter a valid email or leave it blank.");
  if (description.length > 500)
    throw new UserError("Keep your description under 500 characters.");
  let birthday: string | null;
  try {
    // The admin isn't part of the organiser draw, so their birthday is optional.
    birthday =
      isAdmin && !String(body.birthday || "").trim()
        ? null
        : parseBirthday(String(body.birthday || ""));
  } catch (error: any) {
    throw new UserError(error.message);
  }
  return {
    name,
    email,
    description,
    birthday,
    emailNotifications: body.emailNotifications,
  };
}

/** What `uid` may see, plus viewing links for the photos in it. */
async function viewFor(circle: any, uid: string, ctx: Context, result: any) {
  const isAdmin = !!circle.people.find((p: any) => p.id === uid)?.admin;
  const out: any = visible(circle, uid);
  out.events = out.events.map((e: any) => {
    const { messages: _messages, ...event } = e;
    return {
      ...event,
      currentWishlist: wishlistIsAvailable(e)
        ? currentEventWishlist(circle, e)
        : [],
    };
  });
  // While someone's birthday wishlist is still hidden, hide it everywhere.
  const lockedOwners = new Set(
    out.events.filter((e: any) => e.wishlistHidden).map((e: any) => e.person),
  );
  out.wishlist = (out.wishlist || []).filter(
    (w: any) => !lockedOwners.has(w.owner),
  );
  // Only admins see other members' email addresses.
  out.people = out.people.map((p: any) => {
    const { authEmail: _authEmail, sessionsValidAfter: _valid, ...person } = p;
    return { ...person, email: p.id === uid || isAdmin ? p.email : undefined };
  });
  delete out.photos;
  delete out.accountAudit;
  delete out.invites;

  const ids = new Set<string>();
  for (const e of out.events) {
    for (const o of e.options || []) if (o.photo) ids.add(o.photo);
    for (const w of e.currentWishlist || []) if (w.photo) ids.add(w.photo);
  }
  for (const w of out.wishlist || []) if (w.photo) ids.add(w.photo);
  for (const p of out.people) if (p.profilePhoto) ids.add(p.profilePhoto);
  for (const c of out.calendarEvents || []) if (c.photo) ids.add(c.photo);
  const allowed = [...ids]
    .map((id) => circle.photos?.[id])
    .filter((photo) => photo && canViewPhoto(circle, uid, photo));
  // The mascot lives in the private bucket too, so only members can load it.
  const urls = await ctx.photos.signedUrls([
    ...allowed.map((p: any) => p.path),
    MASCOT_PATH,
  ]);
  const photoUrls: Record<string, string> = {};
  for (const photo of allowed)
    if (urls[photo.path]) photoUrls[photo.id] = urls[photo.path];

  return {
    ...out,
    photoUrls,
    mascotUrl: urls[MASCOT_PATH] || "",
    result,
    message: result?.message,
    rewards: pendingRewards(circle, uid),
    admin: isAdmin,
  };
}

async function signOutEverywhere(
  ctx: Context,
  target: string,
  reason: string,
  by: string,
) {
  await ctx.auth.revokeSessions(target);
  await mutate(ctx.store, (d) => {
    const person = d.people.find((p: any) => p.id === target);
    if (person) person.sessionsValidAfter = sessionsValidAfter();
    d.accountAudit = d.accountAudit || [];
    d.accountAudit.push({
      action: reason,
      user: target,
      by,
      at: new Date().toISOString(),
    });
  });
}

/**
 * Creates the first admin. Only works while the circle has no active admin,
 * and needs BOOTSTRAP_SECRET.
 */
async function setupAdmin(body: any, ctx: Context): Promise<Reply> {
  const { env, auth, store } = ctx;
  if (!env.BOOTSTRAP_SECRET || body.secret !== env.BOOTSTRAP_SECRET)
    throw new UserError("That setup secret is incorrect.", 403);
  const group = await loadGroup(store);
  if (group.people.some((p: any) => p.admin && isActive(p)))
    throw new UserError("This bunch already has an admin.", 403);
  const fields = validateUser(body, true);
  validatePassword(body.password);
  const authEmail = loginEmail(fields.username);
  const id = await auth.createUser(authEmail, body.password);
  try {
    await mutate(store, (d) => {
      if (d.people.some((p: any) => p.admin && isActive(p)))
        throw new UserError("This bunch already has an admin.", 403);
      const createdAt = new Date().toISOString();
      d.people.push({
        ...fields,
        id,
        authEmail,
        description: "",
        color: "#dbd3c9",
        admin: true,
        preferences: { email: false, discord: false },
        createdAt,
      });
      d.accountAudit = d.accountAudit || [];
      d.accountAudit.push({
        action: "user created",
        user: id,
        by: "initial setup",
        at: createdAt,
      });
    });
  } catch (error) {
    await auth.deleteUser(id);
    throw error;
  }
  return {
    status: 200,
    body: { ok: true, message: "Admin created. You can now log in." },
  };
}

/**
 * Emails a password-reset link to a member's recovery email (needs Resend).
 * Always gives the same answer, so it can't be used to find out who's a member.
 */
async function resetRequest(body: any, ctx: Context): Promise<Reply> {
  const reply: Reply = {
    status: 200,
    body: {
      ok: true,
      message:
        "If that email belongs to a Banana and email is set up, a reset link is on its way.",
    },
  };
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const redirectTo = String(body.redirectTo || "");
  if (!email || !ctx.env.RESEND_API_KEY || !/^https?:\/\//.test(redirectTo))
    return reply;
  const group = await loadGroup(ctx.store);
  const person = group.people.find(
    (p: any) => isActive(p) && (p.email || "").toLowerCase() === email,
  );
  if (!person) return reply;
  try {
    const link = await ctx.auth.recoveryLink(signInEmail(person), redirectTo);
    await (ctx.fetch || fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + ctx.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ctx.env.EMAIL_FROM,
        to: [email],
        subject: "Reset your bananabunch password",
        text:
          "Hi " +
          person.name +
          ",\n\nUse this link to choose a new password (it works once):\n" +
          link,
      }),
    });
  } catch (error) {
    console.error(error);
  }
  return reply;
}

/**
 * Stores an uploaded photo. `event` ties it to a birthday (for gift ideas).
 * `target` lets an admin upload a profile picture for another Banana.
 */
export async function uploadPhoto(
  bytes: Uint8Array,
  eventId: string,
  ctx: Context,
  target = "",
): Promise<Reply> {
  try {
    const group = await loadGroup(ctx.store);
    const me = ctx.user && group.people.find((p: any) => p.id === ctx.user!.id);
    const tokenTooOld =
      me?.sessionsValidAfter &&
      (ctx.user!.issuedAt || 0) * 1000 < Date.parse(me.sessionsValidAfter);
    if (!isActive(me) || tokenTooOld)
      return { status: 401, body: { error: "Please log in first." } };
    if (bytes.length > MAX_PHOTO_BYTES)
      return {
        status: 413,
        body: { error: "Choose a photo smaller than 4 MB." },
      };
    if (
      eventId &&
      !group.events.some((e: any) => e.id === eventId && e.person !== me.id)
    )
      return { status: 404, body: { error: "Event not found" } };
    const owner = target || me.id;
    if (owner !== me.id && !me.admin)
      return { status: 403, body: { error: "Administrator access required." } };
    if (!isActive(group.people.find((p: any) => p.id === owner)))
      return { status: 400, body: { error: "Choose an active Banana." } };
    let type: string;
    try {
      type = photoType(bytes);
    } catch (error: any) {
      return { status: 400, body: { error: error.message } };
    }
    const id = crypto.randomUUID();
    const path = id;
    await ctx.photos.put(path, bytes, type);
    try {
      await mutate(ctx.store, (d) => {
        d.photos = d.photos || {};
        d.photos[id] = {
          id,
          path,
          owner,
          event: eventId || null,
          type,
          size: bytes.length,
          createdAt: new Date().toISOString(),
        };
      });
    } catch (error) {
      await ctx.photos.remove(path);
      throw error;
    }
    const urls = await ctx.photos.signedUrls([path]);
    return { status: 200, body: { id, url: urls[path] || "" } };
  } catch (error: any) {
    if (error instanceof UserError)
      return { status: error.status, body: { error: error.message } };
    console.error(error);
    return { status: 500, body: { error: "Photo upload failed." } };
  }
}

/** Emails pending notifications to members who opted in (needs Resend). */
async function deliver(ctx: Context) {
  const { env, store } = ctx;
  if (!env.RESEND_API_KEY) return;
  const circle = (await store.load(GROUP))?.data;
  if (!circle) return;
  for (const n of circle.notifications) {
    const event = circle.events.find((e: any) => e.id === n.event);
    const person = circle.people.find((p: any) => p.id === n.user);
    if (!event || !isActive(person) || person.id === event.person) continue;
    if (
      !person.email ||
      !person.preferences?.email ||
      n.delivery?.email === "delivered"
    )
      continue;
    let ok = false;
    let message = "";
    try {
      const response = await (ctx.fetch || fetch)(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": n.id,
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [person.email],
            subject: "A little nudge from bananabunch",
            text: n.text,
          }),
        },
      );
      ok = response.ok;
      if (!ok) message = "Email provider returned " + response.status;
    } catch (err: any) {
      message = err.message;
    }
    await mutate(store, (d) => {
      const item = d.notifications.find((x: any) => x.id === n.id);
      if (!item) return;
      item.delivery = item.delivery || {};
      item.delivery.email = ok ? "delivered" : "failed";
      item.lastError = ok ? null : message;
      item.attempts = (item.attempts || 0) + 1;
    });
  }
}
