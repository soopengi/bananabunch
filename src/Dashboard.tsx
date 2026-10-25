import { votingOpen } from "../supabase/functions/_shared/voting.ts";
import {
  groupedPoints,
  birthdayOrder,
  eventWishes,
} from "../supabase/functions/_shared/presentation.ts";
import { displayBirthday } from "../supabase/functions/_shared/birthdays.ts";
import { callCircle, supabase } from "./supabase";
import { useEffect, useState } from "react";
import {
  Gift,
  Cake,
  LayoutDashboard,
  CalendarDays,
  Heart,
  Users,
  Settings,
  Bell,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ChevronLeft,
  X,
  ShieldCheck,
  Sparkles,
  Clock,
  ChevronRight,
  LogOut,
  Camera,
  Pencil,
} from "lucide-react";
const links: any = {
  Dashboard: LayoutDashboard,
  Birthdays: CalendarDays,
  "Past Birthdays": Clock,
  "My Wishlist": Heart,
  "The Banana Bunch": Users,
  Settings,
};
export default function Home({
  initialPage = "Dashboard",
}: { initialPage?: string } = {}) {
  const [d, S] = useState<any>(null),
    [page, P] = useState(initialPage),
    [eid, E] = useState(""),
    [modal, M] = useState(""),
    [error, ERR] = useState(""),
    [notice, N] = useState(""),
    [busy, B] = useState(false),
    [budgetRole, BR] = useState("gift"),
    [editing, EDIT] = useState<any>(null),
    [photo, PHOTO] = useState(""),
    [uploading, UP] = useState(false),
    [wishOwner, WISHOWNER] = useState(""),
    [hiddenRewards, HIDE] = useState<string[]>([]),
    [birthdayView, BIRTHDAYVIEW] = useState<"upcoming" | "calendar">(
      "upcoming",
    ),
    [calendarMonth, CALMONTH] = useState(() => new Date().getMonth()),
    [calendarYear, CALYEAR] = useState(() => new Date().getFullYear());
  async function api(body?: any) {
    try {
      const { status, json: j } = await callCircle(body || {});
      if (status === 401) {
        await supabase.auth.signOut();
        return null;
      }
      if (status >= 400) throw Error(j.error);
      if (j.people) S(j);
      ERR("");
      return j;
    } catch (e: any) {
      ERR(e.message);
      return null;
    }
  }
  useEffect(() => {
    api();
    const refresh = () => {
      if (document.visibilityState === "visible") api();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (page === "Event" && d) {
      const e = d.events.find((e: any) => e.id === eid);
      if (e && !(e.revealedTo || []).includes(d.user) && !modal)
        M("Organiser raffle");
    }
  }, [page, eid, d?.user]);
  const reward = d?.rewards?.find(
    (r: any) => !hiddenRewards.includes(r.notificationId),
  );
  useEffect(() => {
    if (!reward) return;
    const timer = setTimeout(() => {
      HIDE((keys) => [...keys, reward.notificationId]);
      api({ action: "ackReward", key: reward.key });
    }, 5000);
    return () => clearTimeout(timer);
  }, [reward?.notificationId]);
  if (!d)
    return (
      <div className="loading">
        <Gift size={40} />
        <h2>Gathering your Banana bunch…</h2>
        {error && (
          <p>
            {error}
            <button onClick={() => api()}>Try again</button>
          </p>
        )}
      </div>
    );
  const person = (id: string) =>
    d.people.find((p: any) => p.id === id) || {
      name: "Unassigned Banana",
      color: "#dbd3c9",
    };
  const av = (id: string, small = false) => (
    <span
      className={"avatar " + (small ? "small" : "")}
      style={{ background: person(id).color }}
    >
      {person(id)
        .name.split(" ")
        .map((s: string) => s[0])
        .join("")}
    </span>
  );
  const open = (id: string) => {
    E(id);
    P("Event");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const days = (date: string) =>
    Math.max(0, Math.ceil((Date.parse(date) - Date.now()) / 86400000));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: d.settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const upcoming = d.events
    .filter((e: any) => e.date >= today && !e.cancelled)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
  const upcomingItems = [
    ...upcoming.map((item: any) => ({
      kind: "birthday",
      date: item.date,
      item,
    })),
    ...(d.calendarEvents || [])
      .filter((item: any) => item.date >= today)
      .map((item: any) => ({ kind: "event", date: item.date, item })),
  ].sort(
    (a: any, b: any) =>
      a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );
  const past = d.events
    .filter((e: any) => e.date < today)
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
  const organiserTodos = upcoming.flatMap((e: any) =>
    ["gift", "cake"]
      .filter((role) => e[role] === d.user && !e.tasks?.[role + " complete"])
      .map((role) => ({ event: e, role })),
  );
  const calendarStart =
      (new Date(Date.UTC(calendarYear, calendarMonth, 1)).getUTCDay() + 6) % 7,
    calendarDays = new Date(
      Date.UTC(calendarYear, calendarMonth + 1, 0),
    ).getUTCDate();
  const birthdayPeople = d.people.filter(
    (p: any) => !p.admin && !p.disabled && p.birthday,
  );
  const event = d.events.find((e: any) => e.id === eid);
  const selectedGifts = event
    ? event.options.filter((o: any) =>
        (event.finals?.length ? event.finals : [event.final])
          .filter(Boolean)
          .includes(o.id),
      )
    : [];
  const budget = (role: string) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: event?.budgets?.[role]?.currency || "AUD",
      currencyDisplay: "code",
    }).format(event?.budgets?.[role]?.amount ?? (role === "gift" ? 200 : 75));
  function ideaModal(label: string, item: any = null) {
    EDIT(item);
    PHOTO(item?.photo || "");
    M(label);
  }
  async function logout() {
    await supabase.auth.signOut();
  }
  async function submit(e: any) {
    e.preventDefault();
    if (uploading) return;
    const formData = new FormData(e.currentTarget);
    const values: any = Object.fromEntries(formData);
    if (modal === "Choose gift now")
      values.options = formData.getAll("options");
    const action =
      modal === "Add event"
        ? "addCalendarEvent"
        : modal === "Choose cake"
          ? "cakeChoice"
          : modal === "Photo drive link"
            ? "album"
            : modal === "Edit gift idea"
              ? "editSuggestion"
              : modal === "Edit wishlist item"
                ? "editWishlist"
                : modal === "Change password"
                  ? "changePassword"
                  : modal === "Edit budget"
                    ? "budget"
                    : modal === "Choose gift now"
                      ? "choose"
                      : modal === "Reassign organiser"
                        ? "reassign"
                        : modal === "Change gift"
                          ? "replace"
                          : modal === "Bunch settings"
                            ? "settings"
                            : modal === "Reset password"
                              ? "resetRequest"
                              : modal === "Set new password"
                                ? "resetPassword"
                                : modal === "Add a gift idea"
                                  ? "suggest"
                                  : modal === "Add to wishlist"
                                    ? "wishlist"
                                    : modal === "Edit profile"
                                      ? "profile"
                                      : "login";
    B(true);
    const result = await api({
      action,
      event: [
        "cakeChoice",
        "album",
        "suggest",
        "editSuggestion",
        "task",
        "vote",
        "reassign",
        "replace",
        "budget",
        "choose",
      ].includes(action)
        ? eid
        : undefined,
      ...values,
      ...(["suggest", "wishlist", "editSuggestion", "editWishlist"].includes(
        action,
      )
        ? { id: editing?.id, photo }
        : {}),
    });
    B(false);
    if (result) {
      M("");
      EDIT(null);
      PHOTO("");
      if (action === "changePassword") {
        await supabase.auth.signOut();
        return;
      }
      if (result.message) N(result.message);
      if (action === "profile") N("Your profile has been updated.");
      if (action === "addCalendarEvent") {
        const [year, month] = String(values.date).split("-").map(Number);
        CALYEAR(year);
        CALMONTH(month - 1);
        BIRTHDAYVIEW("calendar");
        N("Event added to the bunch calendar.");
      }
    }
  }
  function Card({ e }: any) {
    return (
      <button className="event-card" onClick={() => open(e.id)}>
        {av(e.person)}
        <div className="event-info">
          <h3>{person(e.person).name.split(" ")[0]}’s Birthday</h3>
          <p>
            {new Date(e.date).toLocaleDateString("en-AU", {
              month: "long",
              day: "numeric",
            })}{" "}
            · {days(e.date)} days away
          </p>
          <div className="card-bottom">
            <span
              className={
                "status " +
                (e.status === "Voting open"
                  ? "green voting-open"
                  : e.status === "Decision needed"
                    ? "decision-needed"
                    : e.status === "Gift selected"
                      ? "pink"
                      : "beige")
              }
            >
              ● &nbsp; {e.status}
            </span>
            <small>{e.options.length} gift ideas</small>
          </div>
        </div>
        <div className="card-tail">
          <span>
            {av(e.gift, true)}
            {av(e.cake, true)}
          </span>
          <ArrowUpRight size={18} />
        </div>
      </button>
    );
  }
  function CalendarEventCard({ item }: any) {
    return (
      <button
        className="event-card calendar-event-card"
        onClick={() => {
          EDIT(item);
          M("Event details");
        }}
      >
        <span className="calendar-event-icon">
          <CalendarDays size={22} />
        </span>
        <div className="event-info">
          <h3>{item.title}</h3>
          <p>
            {new Date(item.date + "T00:00:00Z").toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {item.time ? " · " + item.time : ""}
            {item.location ? " · " + item.location : ""}
          </p>
          <div className="card-bottom">
            <span className="status calendar-event-status">
              ● &nbsp; {item.birthdayEvent ? "Birthday plan" : "Bunch event"}
            </span>
            {item.description && <small>{item.description}</small>}
          </div>
        </div>
        <ArrowUpRight size={18} />
      </button>
    );
  }
  function Option({ o }: any) {
    return (
      <article className="option idea-card">
        <div className="option-art">
          {o.photo ? (
            <img src={d.photoUrls?.[o.photo]} alt={o.name} loading="lazy" />
          ) : (
            o.art || "🎁"
          )}
        </div>
        <div className="option-content">
          <small>
            {o.kind === "wishlist"
              ? "FROM THEIR WISHLIST"
              : "SUGGESTED BY " + person(o.by).name.toUpperCase()}
          </small>
          <h3>{o.name}</h3>
          {o.kind === "wishlist" && <WishAge w={o} />}
          <p>{o.description}</p>
          {o.link && (
            <a
              className="product-link"
              href={o.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              View product <ArrowUpRight size={15} />
            </a>
          )}
          <div className="option-bottom">
            <b>
              {o.currency || "AUD"} {o.price}
            </b>
            <button
              disabled={!votingOpen(event)}
              className={o.votes.includes(d.user) ? "vote voted" : "vote"}
              onClick={() => api({ action: "vote", event: eid, option: o.id })}
            >
              <Heart size={15} />
              {o.votes.length} ·{" "}
              {o.votes.includes(d.user) ? "Loved" : "Love this"}
            </button>
          </div>
          {o.kind === "suggestion" && votingOpen(event) && (
            <button
              className="edit-idea text-btn"
              onClick={() => ideaModal("Edit gift idea", o)}
            >
              <Pencil size={14} /> Edit gift idea
            </button>
          )}
          {o.editedBy && (
            <small className="edit-credit">
              Last edited by {person(o.editedBy).name}
            </small>
          )}
        </div>
      </article>
    );
  }

  function WishPreview({ w }: any) {
    return (
      <article className="option idea-card">
        <div className="option-art">
          {w.photo ? (
            <img src={d.photoUrls?.[w.photo]} alt={w.name} loading="lazy" />
          ) : (
            "🎁"
          )}
        </div>
        <div className="option-content">
          <h3>{w.name}</h3>
          <WishAge w={w} />
          <p>{w.description}</p>
          {w.link && (
            <a
              className="product-link"
              href={w.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              View product <ArrowUpRight size={15} />
            </a>
          )}
          {w.price > 0 && (
            <p>
              {w.currency || "AUD"} {w.price}
            </p>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => P("Dashboard")}>
          <img
            className="brand-mascot"
            src={import.meta.env.BASE_URL + "banana-ninja-v1.png"}
            alt=""
            width="46"
            height="52"
          />
          <span>
            banana<span>circle</span>
          </span>
          <i>✳</i>
        </button>
        <div className="group">
          <span aria-hidden="true">🍌</span>
          <div>
            The Good Bananas<small>Your private birthday bunch</small>
          </div>
        </div>
        <p className="nav-label">YOUR PATCH OF THE BUNCH</p>
        <nav>
          {Object.entries({
            ...links,
            ...(d.admin ? { Users: Users } : {}),
          }).map(([name, Icon]: any) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => P(name)}
            >
              <Icon size={19} />
              <span>{name === "Users" ? "The Bananas" : name}</span>
              {name === "Birthdays" && <b>{upcoming.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>✧</span>
          <h3>
            Good gifts grow
            <br />
            in good bunches.
          </h3>
          <p>
            A little peeling.
            <br />A whole bunch of joy.
          </p>
          <i>🍌</i>
        </div>
        <button className="account" onClick={() => P("My profile")}>
          {av(d.user, true)}
          <span>
            {person(d.user).name}
            <small>Your place in the bunch</small>
          </span>
          <Settings size={15} />
        </button>
      </aside>
      <div className="workspace">
        <header>
          <div>
            The Banana Bunch <ChevronRight size={13} />{" "}
            <b>
              {page === "Event"
                ? "Birthday details"
                : page === "Users"
                  ? "The Bananas"
                  : page}
            </b>
          </div>
          <div>
            <span className="private">
              <ShieldCheck size={14} /> Just between Bananas
            </span>
            <button className="logout-button" onClick={logout}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
            <button
              aria-label="Notifications"
              onClick={() => M("Notifications")}
              className="bell"
            >
              <Bell size={20} />
              <i />
            </button>
            <button aria-label="Your profile" onClick={() => M("Edit profile")}>
              {av(d.user, true)}
            </button>
          </div>
        </header>
        <main>
          {page === "Dashboard" && (
            <>
              <div className="eyebrow">YOUR PRIVATE BANANA BUNCH</div>
              <h1>A whole bunch of good things.</h1>
              <p className="subtitle">
                Big birthdays for your bunch. Your own surprise stays under its
                peel.
              </p>
              <section className="dashboard-todos">
                <div className="section-title">
                  <div>
                    <span className="mini-label">YOUR RESPONSIBILITIES</span>
                    <h2>
                      What you’re organising{" "}
                      <span>{organiserTodos.length}</span>
                    </h2>
                  </div>
                </div>
                {organiserTodos.length ? (
                  <div className="dashboard-todo-list">
                    {organiserTodos.map(({ event: e, role }: any) => (
                      <button key={e.id + role} onClick={() => open(e.id)}>
                        <span className="todo-symbol">
                          {role === "gift" ? (
                            <Gift size={18} />
                          ) : (
                            <Cake size={18} />
                          )}
                        </span>
                        <span>
                          <b>
                            {role === "gift"
                              ? "Choose and purchase the gift"
                              : "Choose and order the cake"}
                          </b>
                          <small>
                            For {person(e.person).name.split(" ")[0]}’s Birthday
                            · {e.date.split("-").reverse().join("-")}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="todo-clear">
                    <Check size={17} /> You’re all peeled and prepared — no
                    organising jobs right now.
                  </p>
                )}
              </section>
              <div className="spaced">
                {upcoming.length ? (
                  upcoming.map((e: any) => <Card key={e.id} e={e} />)
                ) : (
                  <div className="empty">
                    <Gift size={44} />
                    <h2>Good things take time to ripen.</h2>
                    <p>
                      Your bunch’s birthday plans sprout one calendar month
                      before the big day.
                    </p>
                    <button
                      className="outline"
                      onClick={() => P("The Banana Bunch")}
                    >
                      Meet The Banana Bunch
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "Birthdays" && (
            <>
              <h1>Birthdays</h1>
              <p className="subtitle">
                See what’s coming up or browse the whole bunch by month.
              </p>
              <div className="birthday-page-actions">
                <div
                  className="birthday-view-switch"
                  role="tablist"
                  aria-label="Birthday view"
                >
                  <button
                    role="tab"
                    aria-selected={birthdayView === "upcoming"}
                    className={birthdayView === "upcoming" ? "active" : ""}
                    onClick={() => BIRTHDAYVIEW("upcoming")}
                  >
                    <CalendarDays size={16} /> Upcoming events
                  </button>
                  <button
                    role="tab"
                    aria-selected={birthdayView === "calendar"}
                    className={birthdayView === "calendar" ? "active" : ""}
                    onClick={() => BIRTHDAYVIEW("calendar")}
                  >
                    <CalendarDays size={16} /> Calendar view
                  </button>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    EDIT(null);
                    M("Add event");
                  }}
                >
                  <Plus size={16} /> Add event
                </button>
              </div>
              {birthdayView === "upcoming" ? (
                <div className="spaced upcoming-event-list">
                  {upcomingItems.length ? (
                    upcomingItems.map((entry: any) =>
                      entry.kind === "birthday" ? (
                        <Card
                          key={"birthday:" + entry.item.id}
                          e={entry.item}
                        />
                      ) : (
                        <CalendarEventCard
                          key={"event:" + entry.item.id}
                          item={entry.item}
                        />
                      ),
                    )
                  ) : (
                    <div className="empty">
                      <CalendarDays size={36} />
                      <h2>No events are ripening yet.</h2>
                      <p>
                        Upcoming birthdays and bunch events will appear here.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <section className="birthday-calendar">
                  <div className="calendar-toolbar">
                    <button
                      className="outline"
                      aria-label="Previous month"
                      onClick={() => {
                        if (calendarMonth === 0) {
                          CALMONTH(11);
                          CALYEAR((y) => y - 1);
                        } else CALMONTH((m) => m - 1);
                      }}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <h2>
                      {new Date(
                        Date.UTC(calendarYear, calendarMonth, 1),
                      ).toLocaleDateString("en-AU", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    <button
                      className="outline"
                      aria-label="Next month"
                      onClick={() => {
                        if (calendarMonth === 11) {
                          CALMONTH(0);
                          CALYEAR((y) => y + 1);
                        } else CALMONTH((m) => m + 1);
                      }}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                  <div className="calendar-grid">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <b className="calendar-weekday" key={day}>
                          {day}
                        </b>
                      ),
                    )}
                    {Array.from(
                      { length: calendarStart + calendarDays },
                      (_, i) => {
                        if (i < calendarStart)
                          return (
                            <span
                              className="calendar-blank"
                              key={"blank" + i}
                            />
                          );
                        const day = i - calendarStart + 1;
                        const birthdays = birthdayPeople.filter(
                            (p: any) =>
                              Number(p.birthday.split("-")[0]) ===
                                calendarMonth + 1 &&
                              Number(p.birthday.split("-")[1]) === day,
                          ),
                          groupEvents = (d.calendarEvents || []).filter(
                            (item: any) =>
                              item.date ===
                              `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                          );
                        return (
                          <article
                            className={
                              "calendar-day " +
                              (birthdays.length || groupEvents.length
                                ? "has-birthday"
                                : "")
                            }
                            key={day}
                          >
                            <span>{day}</span>
                            {birthdays.map((p: any) => {
                              const eventForPerson = d.events
                                .filter((e: any) => e.person === p.id)
                                .sort((a: any, b: any) =>
                                  a.date.localeCompare(b.date),
                                )[0];
                              return eventForPerson ? (
                                <button
                                  key={p.id}
                                  onClick={() => open(eventForPerson.id)}
                                >
                                  🍌 {p.name.split(" ")[0]}
                                </button>
                              ) : (
                                <small key={p.id}>
                                  🍌 {p.name.split(" ")[0]}
                                </small>
                              );
                            })}
                            {groupEvents.map((item: any) => (
                              <button
                                type="button"
                                className="calendar-group-event"
                                key={item.id}
                                title={[item.description, item.location]
                                  .filter(Boolean)
                                  .join(" · ")}
                                onClick={() => {
                                  EDIT(item);
                                  M("Event details");
                                }}
                              >
                                ● {item.time ? item.time + " " : ""}
                                {item.title}
                              </button>
                            ))}
                          </article>
                        );
                      },
                    )}
                  </div>
                  <p className="calendar-note">
                    Birthday dates repeat every year. Select a Banana with an
                    active event to open their birthday page.
                  </p>
                </section>
              )}
            </>
          )}
          {page === "Past Birthdays" && (
            <>
              <h1>Past Birthdays</h1>
              <p className="subtitle">
                Good Bananas. Ripe reasons to celebrate together.
              </p>
              {!past.length && (
                <div className="empty">
                  <CalendarDays size={36} />
                  <h2>The bunch’s memories will grow here.</h2>
                  <p>
                    Birthdays appear here after their date, with their saved
                    plans and photo drive links.
                  </p>
                </div>
              )}
              <div className="spaced">
                {past.map((e: any) => (
                  <Card key={e.id} e={e} />
                ))}
              </div>
            </>
          )}
          {page === "Responsibilities" && (
            <>
              <h1>Your bunch of to-dos</h1>
              <p className="subtitle">
                Good Bananas. Ripe reasons to celebrate together.
              </p>
              <div className="spaced">
                {upcoming
                  .filter((e: any) => [e.gift, e.cake].includes(d.user))
                  .map((e: any) => (
                    <Card key={e.id} e={e} />
                  ))}
              </div>
            </>
          )}
          {page === "Event" && event && (
            <>
              <button className="text-btn" onClick={() => P("Dashboard")}>
                <ChevronLeft size={16} /> Back to your bunch
              </button>
              <div className="event-heading">
                {av(event.person)}
                <div>
                  <div className="eyebrow">
                    LET’S GO BANANAS FOR THEIR BIG DAY
                  </div>
                  <h1>{person(event.person).name.split(" ")[0]}’s Birthday</h1>
                  <p>
                    {event.date.split("-").reverse().join("-")} ·{" "}
                    {days(event.date)} days to go
                  </p>
                </div>
                <span
                  className={"pill " + (votingOpen(event) ? "voting-open" : "")}
                >
                  {event.status}
                </span>
              </div>
              <div className="event-actions">
                <button
                  className="outline"
                  onClick={() => M("Organiser raffle")}
                >
                  <Sparkles size={16} /> Reveal the organisers
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    EDIT({ birthdayEvent: eid, date: event.date });
                    M("Add event");
                  }}
                >
                  <Plus size={16} /> Add event
                </button>
              </div>
              <div className="organisers">
                {[
                  [Gift, "GIFT ORGANISER", person(event.gift).name],
                  [Cake, "CAKE ORGANISER", person(event.cake).name],
                  [
                    Clock,
                    "VOTING CLOSES",
                    event.votingExtended
                      ? "Until the organiser chooses"
                      : new Date(event.deadline).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "long",
                        }),
                  ],
                ].map(([Icon, label, value]: any) => (
                  <div key={label}>
                    <Icon size={23} />
                    <span>
                      {label}
                      <b>{value}</b>
                    </span>
                  </div>
                ))}
              </div>
              <div className="selected-plans">
                <article>
                  <Gift size={20} />
                  <div>
                    <small>SELECTED GIFT · {budget("gift")} BUDGET</small>
                    {selectedGifts.length ? (
                      <div className="selected-gift-list">
                        {selectedGifts.map((gift: any) => (
                          <div key={gift.id}>
                            <h2>{gift.name}</h2>
                            {gift.link && (
                              <a
                                className="product-link"
                                href={gift.link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View gift <ArrowUpRight size={13} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <h2>The bunch is still choosing</h2>
                    )}
                  </div>
                </article>
                <article>
                  <Cake size={20} />
                  <div>
                    <small>SELECTED CAKE · {budget("cake")} BUDGET</small>
                    <h2>
                      {event.cakeChoice?.name || "Cake still to be chosen"}
                    </h2>
                    {event.cakeChoice?.link && (
                      <a
                        className="product-link"
                        href={event.cakeChoice.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View cake <ArrowUpRight size={13} />
                      </a>
                    )}
                    {(d.admin || event.cake === d.user) && (
                      <button
                        className="text-btn"
                        onClick={() => M("Choose cake")}
                      >
                        {event.cakeChoice ? "Edit cake" : "Choose cake"}
                      </button>
                    )}
                  </div>
                </article>
              </div>
              {event.date < today && (
                <section className="album-panel">
                  <h2>Birthday photo memories 🍌</h2>
                  {event.albumLink && (
                    <a
                      className="product-link"
                      href={event.albumLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open shared photo drive <ArrowUpRight size={14} />
                    </a>
                  )}
                  <button
                    className="outline"
                    onClick={() => M("Photo drive link")}
                  >
                    {event.albumLink
                      ? "Edit shared drive link"
                      : "Add shared drive link"}
                  </button>
                </section>
              )}
              <div className="section-title">
                <h2>Fresh picks from the bunch</h2>
                {votingOpen(event) && (
                  <button
                    className="primary"
                    onClick={() => ideaModal("Add a gift idea")}
                  >
                    <Plus size={16} /> Suggest a gift
                  </button>
                )}
              </div>
              <p className="subtitle">
                Help your bunch pick a winner. One vote per idea, with room to
                change your mind. Any participant can edit a gift idea while
                voting is open.
              </p>
              <div className="gift-grid">
                {event.options
                  .filter((o: any) => o.kind === "suggestion")
                  .map((o: any) => (
                    <Option key={o.id} o={o} />
                  ))}
              </div>
              <h2 className="spaced">Their Wishlist ♡</h2>
              {!eventWishes(event, today).length && (
                <p className="subtitle">No wishes in this bunch yet.</p>
              )}
              <div className="gift-grid">
                {eventWishes(event, today).map((w: any) =>
                  w.votable ? (
                    <Option key={w.id} o={w} />
                  ) : (
                    <WishPreview key={w.id} w={w} />
                  ),
                )}
              </div>
              <div className="spaced privacy-banner">
                <ShieldCheck size={16} /> Keep this banana under its peel. Share
                details privately with participants, never the birthday Banana.
              </div>
              {["Voting open", "Decision needed"].includes(event.status) &&
                event.gift === d.user && (
                  <div className="settings-panel choice-panel">
                    <h2>The gift Banana’s final pick</h2>
                    <p className="subtitle">
                      {event.votingExtended
                        ? "Voting stays open without a deadline. Add a gift idea if needed, then choose any item to close voting."
                        : votingOpen(event)
                          ? "Found the top banana? Choose the gift now and close voting early."
                          : "Make the bunch’s final pick: a tied leader, or any gift if there were no votes."}
                    </p>
                    {event.options.length ? (
                      <button
                        className="primary spaced"
                        onClick={() => M("Choose gift now")}
                      >
                        Choose gift or gifts <ArrowRight size={16} />
                      </button>
                    ) : (
                      <p className="subtitle">
                        Plant a gift idea for the bunch first, then pick it
                        here.
                      </p>
                    )}
                  </div>
                )}
              <h2 className="spaced">Budget &amp; responsibilities</h2>
              <div className="responsibility-grid">
                {["gift", "cake"].map((role) => (
                  <article key={role} className="responsibility-card">
                    <div className="responsibility-title">
                      {role === "gift" ? (
                        <Gift size={23} />
                      ) : (
                        <Cake size={23} />
                      )}
                      <h3>{role === "gift" ? "The gift" : "The cake"}</h3>
                    </div>
                    <p>
                      Organised by <b>{person(event[role]).name}</b>
                    </p>
                    <div className="budget-value">
                      <small>BUDGET</small>
                      <strong>{budget(role)}</strong>
                      {event[role] === d.user && (
                        <button
                          className="text-btn"
                          onClick={() => {
                            BR(role);
                            M("Edit budget");
                          }}
                        >
                          <Pencil size={12} /> Edit budget
                        </button>
                      )}
                    </div>
                    {event.tasks?.[role + " complete"] ? (
                      <button
                        type="button"
                        className="complete-control done"
                        disabled={!d.admin && event[role] !== d.user}
                        aria-label={
                          role === "gift"
                            ? "Uncheck gift purchased"
                            : "Uncheck cake purchased"
                        }
                        onClick={() =>
                          api({ action: "undoComplete", event: eid, role })
                        }
                      >
                        <span className="checkbox checked">
                          <Check size={14} />
                        </span>
                        {role === "gift" ? "Gift purchased" : "Cake purchased"}
                      </button>
                    ) : (
                      <button
                        className="complete-control"
                        disabled={!d.admin && event[role] !== d.user}
                        onClick={() =>
                          api({ action: "complete", event: eid, role })
                        }
                      >
                        <span className="checkbox" />
                        {role === "gift"
                          ? "Mark gift as purchased"
                          : "Mark cake as purchased"}
                      </button>
                    )}
                    {!d.admin &&
                      event[role] !== d.user &&
                      !event.tasks?.[role + " complete"] && (
                        <small className="role-hint">
                          Only the assigned {role} organiser can mark this as{" "}
                          {role === "gift" ? "purchased" : "purchased"}.
                        </small>
                      )}
                  </article>
                ))}
              </div>
              {d.admin && (
                <button
                  className="outline spaced"
                  onClick={() => M("Reassign organiser")}
                >
                  Reassign an organiser
                </button>
              )}
              {event.final && event.gift === d.user && (
                <button
                  className="outline spaced"
                  onClick={() => M("Change gift")}
                >
                  Change gift
                </button>
              )}
              <h2 className="spaced">Organiser history</h2>
              <div className="checklist">
                {d.history
                  .filter((h: any) => h.event === eid)
                  .map((h: any, i: number) => (
                    <p key={i} className="subtitle">
                      {person(h.user).name} · {h.role} · {person(h.person).name}{" "}
                      · {h.date?.split("-").reverse().join("-")}
                    </p>
                  ))}
                <p className="subtitle">
                  {event.fallback ||
                    "Every Banana gets a turn. Organisers share a one-event cooldown."}
                </p>
              </div>
            </>
          )}
          {page === "My Wishlist" && (
            <>
              <div className="heading-row">
                <div>
                  <div className="eyebrow">YOUR TOP BANANA PICKS</div>
                  <h1>My Wishlist</h1>
                  <p>Give your bunch a hint about what makes you go bananas.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => ideaModal("Add to wishlist")}
                >
                  <Plus size={16} /> Add a wish
                </button>
              </div>
              {!d.wishlist.some((w: any) => w.owner === d.user) ? (
                <div className="empty">
                  <Heart size={45} />
                  <h2>Plant a few wishes for your bunch.</h2>
                  <p>
                    Books, adventures, or your next top banana. Give the bunch a
                    few ideas.
                  </p>
                  <button
                    className="outline"
                    onClick={() => ideaModal("Add to wishlist")}
                  >
                    Plant your first wish
                  </button>
                </div>
              ) : (
                <div className="gift-grid spaced">
                  {d.wishlist
                    .filter((w: any) => w.owner === d.user)
                    .map((w: any) => (
                      <article className="option idea-card" key={w.id}>
                        <div className="option-art">
                          {w.photo ? (
                            <img
                              src={d.photoUrls?.[w.photo]}
                              alt={w.name}
                              loading="lazy"
                            />
                          ) : (
                            "🎁"
                          )}
                        </div>
                        <div className="option-content">
                          <h3>{w.name}</h3>
                          <p>{w.description}</p>
                          {w.link && (
                            <a
                              className="product-link"
                              href={w.link}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View product <ArrowUpRight size={15} />
                            </a>
                          )}
                          <b>
                            {w.currency || "AUD"} {w.price}
                          </b>
                          <div className="wishlist-actions">
                            <button
                              className="text-btn"
                              onClick={() => ideaModal("Edit wishlist item", w)}
                            >
                              <Pencil size={14} /> Edit wish
                            </button>
                            <button
                              className="text-btn"
                              onClick={() =>
                                api({ action: "removeWishlist", id: w.id })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </>
          )}
          {page === "The Banana Bunch" && (
            <>
              <h1>Good Bananas, great birthdays.</h1>
              <p className="subtitle">
                The Bananas who make every birthday a little sweeter.
              </p>
              {!d.people.some((p: any) => !p.admin && !p.disabled) && (
                <div className="empty">
                  <span className="empty-banana">🍌</span>
                  <h2>Your bunch is still growing.</h2>
                  <p>
                    Member Bananas will appear here once their accounts are
                    added.
                  </p>
                </div>
              )}
              <div className="people-grid">
                {d.people
                  .filter((p: any) => !p.admin && !p.disabled)
                  .sort(birthdayOrder)
                  .map((p: any) => (
                    <article className="person-card" key={p.id}>
                      {av(p.id)}
                      <h2>{p.name}</h2>
                      <p>{p.description}</p>
                      <small>
                        Birthday · {displayBirthday(p.birthday) || "Not set"}
                      </small>
                      <div className="rating">
                        <Sparkles size={15} /> Banana Points ·{" "}
                        {d.ledger
                          .filter((l: any) => l.user === p.id)
                          .reduce((sum: number, l: any) => sum + l.points, 0)}
                      </div>
                      <details className="subtitle">
                        <summary>How this Banana earned it</summary>
                        {groupedPoints(d.ledger, p.id).map((l: any) => (
                          <div className="point-reason" key={l.reason}>
                            <span>{l.reason}</span>
                            <b>
                              {l.points > 0 ? "+" : ""}
                              {l.points}
                            </b>
                          </div>
                        ))}
                      </details>
                      <button
                        className="outline member-wishlist-button"
                        onClick={() => {
                          WISHOWNER(p.id);
                          P("Member Wishlist");
                        }}
                      >
                        <Heart size={14} /> View Wishlist
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}

          {page === "Member Wishlist" && (
            <>
              <button
                className="text-btn"
                onClick={() => P("The Banana Bunch")}
              >
                <ChevronLeft size={16} /> Back to The Banana Bunch
              </button>
              <h1 className="spaced">{person(wishOwner).name}’s Wishlist</h1>
              <p className="subtitle">
                Fresh inspiration from this Banana, shared with the bunch.
              </p>
              {d.wishlist.some((w: any) => w.owner === wishOwner) ? (
                <div className="gift-grid">
                  {d.wishlist
                    .filter((w: any) => w.owner === wishOwner)
                    .map((w: any) => (
                      <WishPreview key={w.id} w={w} />
                    ))}
                </div>
              ) : (
                <div className="empty">
                  <Heart size={42} />
                  <h2>No wishes have ripened yet.</h2>
                  <p>This Banana hasn’t added anything to their wishlist.</p>
                </div>
              )}
            </>
          )}
          {page === "My profile" && (
            <>
              <div className="eyebrow">YOUR PATCH OF THE BUNCH</div>
              <div className="heading-row">
                <h1>My profile</h1>
                <button className="outline" onClick={() => M("Edit profile")}>
                  Edit profile
                </button>
              </div>
              <section className="profile-panel">
                {av(d.user)}
                <h2>{person(d.user).name}</h2>
                <span className="username">
                  @{person(d.user).username || ""}
                </span>
                <p>
                  {person(d.user).description ||
                    "Tell your bunch what makes you a one-of-a-kind Banana."}
                </p>
                <div className="profile-facts">
                  <div>
                    <small>BIRTHDAY</small>
                    <b>
                      {displayBirthday(person(d.user).birthday) || "Not set"}
                    </b>
                  </div>
                  <div>
                    <small>EMAIL</small>
                    <b className="profile-email">
                      {person(d.user).email || "Not added"}
                    </b>
                  </div>
                  <div>
                    <small>BANANA POINTS</small>
                    <b>
                      {d.ledger
                        .filter((l: any) => l.user === d.user)
                        .reduce((s: number, l: any) => s + l.points, 0)}
                    </b>
                  </div>
                </div>
                <button className="primary" onClick={() => P("My Wishlist")}>
                  <Heart size={16} /> View My Wishlist
                </button>
                <h3 className="spaced">Your good Banana deeds</h3>
                {d.ledger.filter((l: any) => l.user === d.user).length ? (
                  groupedPoints(d.ledger, d.user).map((l: any) => (
                    <p className="ledger-line" key={l.reason}>
                      {l.reason}
                      <b>+{l.points}</b>
                    </p>
                  ))
                ) : (
                  <p className="subtitle">
                    Your good deeds for the bunch will ripen into points here.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "Settings" && (
            <>
              <h1>Your bunch, your way.</h1>
              <div className="settings-panel">
                <h2>Bunch settings</h2>
                <label>
                  Group timezone
                  <input readOnly value={d.settings.timezone} />
                </label>
                {d.admin && (
                  <div className="account-actions">
                    <button className="outline" onClick={() => P("Users")}>
                      Manage Bananas
                    </button>
                    <button
                      className="outline"
                      onClick={() => M("Bunch settings")}
                    >
                      Edit bunch settings
                    </button>
                  </div>
                )}
              </div>
              <section className="settings-panel account-panel">
                <h2>Account</h2>
                <p className="subtitle">
                  {"Signed in as @" +
                    (person(d.user).username || person(d.user).name) +
                    "."}
                </p>
                <div className="account-actions">
                  {
                    <>
                      <button
                        className="primary"
                        onClick={() => M("Edit profile")}
                      >
                        <Pencil size={15} /> Edit profile
                      </button>
                      <button
                        className="outline"
                        onClick={() => P("My profile")}
                      >
                        Your place in the bunch
                      </button>
                      <button className="outline" onClick={logout}>
                        Log out
                      </button>
                    </>
                  }
                </div>
                {
                  <div className="account-actions">
                    <button
                      className="primary"
                      onClick={() => M("Change password")}
                    >
                      Change my password
                    </button>
                  </div>
                }
              </section>
            </>
          )}
          {page === "Users" && d.admin && (
            <UsersPanel api={api} currentUser={d.user} />
          )}
          <footer>
            <span>
              Made for the Bananas who make your day. <Heart size={11} />
            </span>
            <span>bananacircle · Private Banana bunch</span>
          </footer>
        </main>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => ERR("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {reward && (
        <aside
          className="reward-popup"
          key={reward.key}
          role="status"
          aria-live="polite"
        >
          <button
            className="reward-close"
            aria-label="Dismiss Banana Points reward"
            onClick={() => {
              HIDE((keys) => [...keys, reward.key]);
              api({ action: "ackReward", key: reward.key });
            }}
          >
            <X size={17} />
          </button>
          <div className="banana-confetti" aria-hidden="true">
            {["🍌", "✦", "🍌", "✧", "🍌"].map((p, i) => (
              <span key={i} style={{ "--i": i } as any}>
                {p}
              </span>
            ))}
          </div>
          <div className="reward-banana" aria-hidden="true">
            🍌
          </div>
          <div>
            <small>YOU EARNED BANANA POINTS!</small>
            <h2>
              You earned {reward.points} Banana Point
              {reward.points === 1 ? "" : "s"}!
            </h2>
            <p>{reward.reason}</p>
            <button
              className="text-btn"
              onClick={() => {
                HIDE((keys) => [...keys, reward.key]);
                api({ action: "ackReward", key: reward.key });
              }}
            >
              Peel good! <Check size={14} />
            </button>
          </div>
        </aside>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => N("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => M("")}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => M("")}
            >
              <X size={20} />
            </button>
            <div className="modal-icon">
              <Gift />
            </div>
            <h2>{modal}</h2>
            {modal === "Event details" ? (
              <EventDetails item={editing} person={person} />
            ) : modal === "Organiser raffle" ? (
              <OrganiserReveal
                key={eid}
                event={event}
                people={d.people}
                history={d.history}
                onDone={async () => {
                  const r = await api({ action: "revealSeen", event: eid });
                  if (r) M("");
                }}
              />
            ) : modal === "Notifications" ? (
              <>
                <p>Fresh nudges from your Banana bunch.</p>
                {d.notifications.map((n: any) => (
                  <button
                    className="notification"
                    key={n.id}
                    onClick={() => {
                      M("");
                      open(n.event);
                    }}
                  >
                    {n.text}
                    <ArrowRight size={17} />
                  </button>
                ))}
                {!d.notifications.length && <p>Your bunch is all caught up.</p>}
                <button
                  className="outline"
                  onClick={() => api({ action: "read" })}
                >
                  Mark all as read
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                {modal === "Add event" ? (
                  <>
                    <p>
                      {editing?.birthdayEvent
                        ? "Add a private plan for this birthday. The birthday Banana will not see it."
                        : "Add a shared date for the whole Banana Bunch."}
                    </p>
                    {editing?.birthdayEvent && (
                      <input
                        type="hidden"
                        name="birthdayEvent"
                        value={editing.birthdayEvent}
                      />
                    )}
                    <label>
                      Title
                      <input
                        name="title"
                        required
                        minLength={3}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Date
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={editing?.date || ""}
                      />
                    </label>
                    <label>
                      Time (optional)
                      <input name="time" type="time" />
                    </label>
                    <label>
                      Location (optional)
                      <input
                        name="location"
                        maxLength={180}
                        placeholder="Address or place"
                      />
                    </label>
                    <label>
                      Description (optional)
                      <textarea
                        name="description"
                        maxLength={1000}
                        placeholder="What should the bunch know?"
                      />
                    </label>
                  </>
                ) : modal === "Choose cake" ? (
                  <>
                    <label>
                      Cake name
                      <input
                        name="name"
                        required
                        maxLength={120}
                        defaultValue={event.cakeChoice?.name || ""}
                      />
                    </label>
                    <label>
                      Cake link (optional)
                      <input
                        name="link"
                        type="url"
                        defaultValue={event.cakeChoice?.link || ""}
                        placeholder="https://…"
                      />
                    </label>
                  </>
                ) : modal === "Photo drive link" ? (
                  <>
                    <p>
                      Share the link to your Google Drive, OneDrive, Dropbox or
                      other photo folder. Make sure the bunch has access.
                    </p>
                    <label>
                      Shared photo folder link
                      <input
                        name="link"
                        type="url"
                        required
                        defaultValue={event.albumLink || ""}
                        placeholder="https://…"
                      />
                    </label>
                  </>
                ) : modal === "Change password" ? (
                  <>
                    <p>
                      Keep your Banana account safe. Enter your current password
                      and choose a new one, then log in again.
                    </p>
                    <label>
                      Current password
                      <input
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <label>
                      New password
                      <input
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={256}
                        required
                      />
                    </label>
                    <label>
                      Confirm new password
                      <input
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={256}
                        required
                      />
                    </label>
                  </>
                ) : modal === "Edit budget" ? (
                  <>
                    <p>
                      Set the {budgetRole} budget for this birthday. Your Banana
                      bunch can see the amount.
                    </p>
                    <input type="hidden" name="role" value={budgetRole} />
                    <label>
                      Budget
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        max="1000000"
                        step="0.01"
                        required
                        defaultValue={event.budgets?.[budgetRole]?.amount ?? ""}
                      />
                    </label>
                    <label>
                      Currency
                      <select
                        name="currency"
                        defaultValue={
                          event.budgets?.[budgetRole]?.currency || "AUD"
                        }
                      >
                        {["AUD", "USD", "GBP", "EUR", "NZD", "CAD"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : modal === "Choose gift now" ? (
                  <>
                    <p>
                      Tick one or more gifts, then confirm the bunch’s final
                      selection. Confirming closes voting for everyone.
                    </p>
                    <fieldset className="gift-checkboxes">
                      <legend>Final gift selection</legend>
                      {event.options
                        .filter(
                          (o: any) =>
                            votingOpen(event) ||
                            !event.leaders?.length ||
                            event.leaders.includes(o.id),
                        )
                        .map((o: any) => (
                          <label key={o.id}>
                            <input
                              type="checkbox"
                              name="options"
                              value={o.id}
                            />
                            <span>
                              <b>{o.name}</b>
                              {o.price > 0 && (
                                <small>
                                  {o.currency || "AUD"} {o.price}
                                </small>
                              )}
                            </span>
                          </label>
                        ))}
                    </fieldset>
                  </>
                ) : [
                    "Reassign organiser",
                    "Change gift",
                    "Bunch settings",
                  ].includes(modal) ? (
                  <>
                    {modal === "Reassign organiser" && (
                      <>
                        <label>
                          Responsibility
                          <select name="role">
                            <option value="gift">Gift</option>
                            <option value="cake">Cake</option>
                          </select>
                        </label>
                        <label>
                          New organiser
                          <select name="user">
                            {d.people
                              .filter((p: any) => p.id !== event.person)
                              .map((p: any) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    )}
                    {modal === "Change gift" && (
                      <label>
                        Replacement gift
                        <select name="option">
                          {event.options.map((o: any) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {modal !== "Bunch settings" ? (
                      <label>
                        Reason
                        <textarea name="reason" required minLength={8} />
                      </label>
                    ) : (
                      <label>
                        Group timezone
                        <input
                          name="timezone"
                          defaultValue={d.settings.timezone}
                          required
                        />
                      </label>
                    )}
                  </>
                ) : ["Sign in", "Reset password", "Set new password"].includes(
                    modal,
                  ) ? (
                  <>
                    <p>A little help getting back to your Banana bunch.</p>
                    {modal === "Reset password" && (
                      <label>
                        Email
                        <input name="email" type="email" required />
                      </label>
                    )}
                    {modal === "Sign in" && (
                      <label>
                        Username
                        <input
                          name="username"
                          autoComplete="username"
                          required
                        />
                      </label>
                    )}
                    {modal !== "Reset password" && (
                      <label>
                        Password
                        <input
                          name="password"
                          type="password"
                          minLength={12}
                          required
                        />
                      </label>
                    )}
                    {modal === "Set new password" && (
                      <label>
                        Reset token
                        <input name="token" required />
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <p>
                      {modal === "Edit profile"
                        ? "A little about the Banana behind those thoughtful gifts."
                        : "Every great bunch starts with a fresh idea."}
                    </p>
                    <label>
                      {modal === "Edit profile" ? "Your name" : "Name"}
                      <input
                        name="name"
                        required
                        defaultValue={
                          modal === "Edit profile"
                            ? person(d.user).name
                            : editing?.name || ""
                        }
                      />
                    </label>
                    {modal === "Edit profile" && (
                      <>
                        <label>
                          Birthday (DD-MM)
                          <input
                            name="birthday"
                            defaultValue={displayBirthday(
                              person(d.user).birthday,
                            )}
                            placeholder="08-11"
                            pattern="[0-9]{2}-[0-9]{2}"
                            maxLength={5}
                            inputMode="numeric"
                            required
                          />
                        </label>
                        <label>
                          Email address
                          <input
                            name="email"
                            type="email"
                            maxLength={254}
                            defaultValue={person(d.user).email || ""}
                            placeholder="you@example.com"
                          />
                        </label>
                        <label>
                          Email reminders
                          <select
                            name="emailNotifications"
                            defaultValue={
                              person(d.user).preferences?.email ? "on" : "off"
                            }
                          >
                            <option value="off">Off</option>
                            <option value="on">
                              On (requires configured email provider)
                            </option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Description
                      <textarea
                        name="description"
                        defaultValue={
                          modal === "Edit profile"
                            ? person(d.user).description
                            : editing?.description || ""
                        }
                      />
                    </label>
                    {modal !== "Edit profile" && (
                      <>
                        <PhotoUpload
                          value={photo}
                          onChange={PHOTO}
                          urlFor={(id) => d.photoUrls?.[id]}
                          event={
                            ["Add a gift idea", "Edit gift idea"].includes(
                              modal,
                            )
                              ? eid
                              : undefined
                          }
                          onBusy={UP}
                          onError={ERR}
                        />
                        <label>
                          Product link
                          <input
                            name="link"
                            type="url"
                            placeholder="https://…"
                            defaultValue={editing?.link || ""}
                          />
                        </label>
                        <label>
                          Estimated price (AUD)
                          <input
                            name="price"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Optional"
                            defaultValue={editing?.price ?? ""}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || uploading}
                >
                  {uploading
                    ? "Uploading photo…"
                    : busy
                      ? "Saving…"
                      : modal === "Choose gift now"
                        ? "Confirm selected gifts"
                        : modal === "Edit budget"
                          ? "Save budget"
                          : modal === "Reset password"
                            ? "Send reset email"
                            : modal === "Set new password"
                              ? "Set new password"
                              : "Save changes"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function EventDetails({
  item,
  person,
}: {
  item: any;
  person: (id: string) => any;
}) {
  if (!item) return null;
  return (
    <section className="calendar-event-details">
      <p className="event-detail-date">
        {new Date(item.date + "T00:00:00Z").toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {item.time ? " · " + item.time : ""}
      </p>
      {item.location && (
        <p>
          <b>Location</b>
          <br />
          {item.location}
        </p>
      )}
      {item.description && (
        <p>
          <b>Details</b>
          <br />
          {item.description}
        </p>
      )}
      <small>Added by {person(item.createdBy).name}</small>
    </section>
  );
}

function UsersPanel({
  api,
  currentUser,
}: {
  api: (body: any) => Promise<any>;
  currentUser: string;
}) {
  const [users, U] = useState<any[]>([]),
    [error, E] = useState(""),
    [message, M] = useState(""),
    [busy, B] = useState(false),
    [resetUser, RESET] = useState<any>(null),
    [deleteTarget, DELETE] = useState<any>(null);
  async function remove() {
    B(true);
    M("");
    const r = await api({ action: "deleteUser", user: deleteTarget.id });
    B(false);
    if (r) {
      DELETE(null);
      RESET(null);
      M(
        "Banana deleted. Their access has been removed and birthday history has been kept.",
      );
      await refresh();
    }
  }
  async function reset(e: any) {
    e.preventDefault();
    B(true);
    E("");
    M("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const r = await api({
      action: "adminResetPassword",
      user: resetUser.id,
      ...values,
    });
    B(false);
    if (r) {
      RESET(null);
      M(r.message);
    }
  }
  async function refresh() {
    const r = await api({ action: "listUsers" });
    if (r) U(r.users);
  }
  useEffect(() => {
    refresh();
  }, []);
  async function create(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    B(true);
    E("");
    M("");
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword) {
      E("The passwords do not match.");
      B(false);
      return;
    }
    const r = await api({ action: "createUser", ...values });
    B(false);
    if (r) {
      form.reset();
      M(
        "A new Banana has joined the bunch. Share their username and temporary password privately.",
      );
      await refresh();
    }
  }
  return (
    <>
      <div className="eyebrow">ADMINISTRATION</div>
      <h1>The Bananas</h1>
      <p className="subtitle">
        Add fresh Bananas to your bunch. Each Banana can change their own
        password in Settings.
      </p>
      <div className="user-admin-grid">
        <section className="settings-panel">
          <h2>Add a Banana</h2>
          <form onSubmit={create}>
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <label>
              Username
              <input
                name="username"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]{3,30}"
                autoComplete="off"
              />
            </label>
            <label>
              Temporary password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
              />
            </label>
            <label>
              Confirm temporary password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
              />
            </label>
            <label>
              Birthday (DD-MM)
              <input
                name="birthday"
                placeholder="08-11"
                pattern="[0-9]{2}-[0-9]{2}"
                maxLength={5}
                inputMode="numeric"
                required
              />
            </label>
            <label>
              Email (optional, for recovery)
              <input name="email" type="email" />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="form-success" role="status">
                {message}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create Banana"} <Plus size={16} />
            </button>
          </form>
        </section>
        <section className="settings-panel user-list">
          <div className="section-title">
            <h2>
              Banana list <span>{users.length}</span>
            </h2>
            <button className="text-btn" onClick={refresh}>
              Refresh
            </button>
          </div>
          <div className="user-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name / username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <span>@{u.username}</span>
                      {u.email && <small>{u.email}</small>}
                    </td>
                    <td>{u.admin ? "Admin" : "Member"}</td>
                    <td>
                      <span className="status green">
                        {u.disabled ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-btn"
                        disabled={u.disabled}
                        onClick={() => {
                          RESET(u);
                          M("");
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        className="text-btn delete-user"
                        disabled={u.id === currentUser || busy}
                        onClick={() => {
                          DELETE(u);
                          RESET(null);
                          M("");
                        }}
                      >
                        Delete user
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {deleteTarget && (
            <section className="delete-user-confirm" role="alert">
              <h3>Delete @{deleteTarget.username}?</h3>
              <p>
                This removes their access and takes them out of the user list.
                Saved birthday history stays. Any unfinished responsibilities
                will need a new organiser.
              </p>
              <div className="account-actions">
                <button className="primary" disabled={busy} onClick={remove}>
                  {busy ? "Deleting…" : "Delete this Banana"}
                </button>
                <button
                  className="outline"
                  onClick={() => DELETE(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          {resetUser && (
            <form className="admin-reset" onSubmit={reset}>
              <h3>Reset password for @{resetUser.username}</h3>
              <p className="subtitle">
                Set a new password and share it privately. Their existing
                sessions will be signed out.
              </p>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                />
              </label>
              <div className="account-actions">
                <button className="primary" disabled={busy} type="submit">
                  {busy ? "Resetting…" : "Reset password"}
                </button>
                <button
                  type="button"
                  className="outline"
                  onClick={() => RESET(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <p className="subtitle">
            Every Banana’s password is stored securely and never shown in this
            list.
          </p>
        </section>
      </div>
    </>
  );
}

function PhotoUpload({
  value,
  onChange,
  urlFor,
  event,
  onBusy,
  onError,
}: {
  value: string;
  onChange: (v: string) => void;
  urlFor: (id: string) => string | undefined;
  event?: string;
  onBusy: (v: boolean) => void;
  onError: (v: string) => void;
}) {
  const [busy, B] = useState(false),
    [preview, PREVIEW] = useState("");
  async function upload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onError("Choose a photo smaller than 4 MB.");
      e.target.value = "";
      return;
    }
    B(true);
    onBusy(true);
    onError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      if (event) form.append("event", event);
      const { status, json: data } = await callCircle(form);
      if (status >= 400) throw Error(data.error);
      PREVIEW(data.url);
      onChange(data.id);
    } catch (e: any) {
      onError(e.message || "The photo could not be uploaded.");
    } finally {
      B(false);
      onBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div className="photo-upload">
      <label>
        <span className="photo-label">
          <Camera size={16} /> Photo (optional)
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      <small>
        {busy ? "Your Banana is uploading…" : "JPEG, PNG or WebP · up to 4 MB"}
      </small>
      {value && (
        <div className="photo-preview">
          <img src={preview || urlFor(value)} alt="Selected gift photo" />
          <button
            type="button"
            className="outline"
            onClick={() => onChange("")}
            disabled={busy}
          >
            Remove photo
          </button>
        </div>
      )}
    </div>
  );
}

function OrganiserReveal({
  event,
  people,
  history,
  onDone,
}: {
  event: any;
  people: any[];
  history: any[];
  onDone: () => Promise<void>;
}) {
  const [phase, PHASE] = useState(0),
    [landed, LANDED] = useState(false),
    [saving, SAVING] = useState(false);
  const role = phase === 0 ? "gift" : "cake";
  const selected = event[role];
  const year = String(event.date).slice(0, 4),
    priorChosen = new Set(
      history
        .filter(
          (h) =>
            h.event !== event.id && String(h.date || "").slice(0, 4) === year,
        )
        .map((h) => h.user),
    );
  const members = people.filter(
    (p) =>
      p.id !== event.person &&
      !p.admin &&
      (!p.disabled || p.id === selected) &&
      (!priorChosen.has(p.id) || p.id === selected) &&
      (role !== "cake" || p.id !== event.gift || p.id === selected),
  );
  const alreadyChosen = [
    ...new Set(
      history
        .filter((h) => String(h.date || "").slice(0, 4) === year)
        .map((h) => h.user),
    ),
  ]
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean);
  const index = members.findIndex((p) => p.id === selected),
    count = Math.max(members.length, 1),
    step = 360 / count;
  const rotation = 1800 - (Math.max(index, 0) + 0.5) * step;
  const colours = ["#edd382", "#fc9e4f", "#f2f3ae", "#ffb574"];
  const gradient = members.length
    ? "conic-gradient(" +
      members
        .map(
          (p, i) =>
            colours[i % colours.length] +
            " " +
            i * step +
            "deg " +
            (i + 1) * step +
            "deg",
        )
        .join(",") +
      ")"
    : "#edd382";
  useEffect(() => {
    LANDED(false);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const t = setTimeout(() => LANDED(true), reduced ? 50 : 3300);
    return () => clearTimeout(t);
  }, [phase]);
  const name = (id: string) =>
    people.find((p) => p.id === id)?.name || "Still to be assigned";
  return (
    <div className="organiser-reveal">
      <p className="subtitle">
        The bunch’s saved organiser draw. Anyone already chosen in {year} is
        removed from later birthday wheels.
      </p>
      <div className="wheel-stage" aria-hidden="true">
        <span className="wheel-pointer">▼</span>
        <div
          key={role}
          className="banana-wheel"
          style={
            { background: gradient, "--wheel-turn": rotation + "deg" } as any
          }
        >
          {members.map((p, i) => (
            <span
              key={p.id}
              className="wheel-name"
              style={{
                transform:
                  "translate(-50%,-50%) rotate(" +
                  (i + 0.5) * step +
                  "deg) translateY(-101px) rotate(90deg)",
              }}
            >
              {p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name}
            </span>
          ))}
        </div>
        <span className="wheel-hub">🍌</span>
      </div>
      <div className="wheel-result" aria-live="polite">
        <small>
          {phase === 0 ? "1 OF 2 · GIFT ORGANISER" : "2 OF 2 · CAKE ORGANISER"}
        </small>
        <h3>{landed ? name(selected) : "Spinning the bunch…"}</h3>
      </div>
      {phase === 1 && (
        <p className="wheel-gift-result">
          🎁 Gift organiser · <b>{name(event.gift)}</b>
        </p>
      )}
      <p className="subtitle wheel-note">
        The organisers are already saved. Watching the wheel again keeps the
        same choices.
      </p>
      <button
        className="primary"
        disabled={!landed || saving}
        onClick={async () => {
          if (phase === 0) {
            PHASE(1);
            LANDED(false);
          } else {
            SAVING(true);
            await onDone();
            SAVING(false);
          }
        }}
      >
        {!landed
          ? "Peeling back the surprise…"
          : phase === 0
            ? "Reveal cake organiser"
            : saving
              ? "Saving…"
              : "Meet your planning Bananas"}
        <ArrowRight size={15} />
      </button>
      <section className="chosen-this-year">
        <small>ALREADY CHOSEN IN {year}</small>
        {alreadyChosen.length ? (
          <div>
            {alreadyChosen.map((p: any) => (
              <span key={p.id}>🍌 {p.name}</span>
            ))}
          </div>
        ) : (
          <p>No Bananas have been chosen yet.</p>
        )}
      </section>
    </div>
  );
}

function WishAge({ w }: { w: any }) {
  if (!w.addedAt) return null;
  const added = new Date(w.addedAt);
  const expires = w.expiresAt
    ? Date.parse(w.expiresAt)
    : new Date(
        Date.UTC(
          added.getUTCFullYear() + 2,
          added.getUTCMonth(),
          added.getUTCDate(),
        ),
      ).getTime();
  const days = Math.max(0, Math.ceil((expires - Date.now()) / 86400000));
  return (
    <div className="wish-age">
      <span>
        {w.addedDateEstimated ? "Date tracking started" : "Added"}{" "}
        {added.toLocaleDateString("en-AU")}
      </span>
      <span>
        {days
          ? "Auto-removes in " + days + " days"
          : "Expired · saved event record"}
      </span>
      <small>This wish may already have been purchased.</small>
    </div>
  );
}
