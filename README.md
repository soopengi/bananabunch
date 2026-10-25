# bananabunch

A private web app for a group of friends (the "Banana bunch") to organise each other's birthdays: share wishlists, suggest and vote on gifts, chip in on the cake, and take turns being the organiser. The birthday person never sees their own birthday plans, so the surprise stays a surprise.

The website is static, hosted on **GitHub Pages**. Sign-in, data, photos and the app's rules run on **Supabase**.

---

## What it does

### Accounts

- **Login only.** There's no public sign-up and no demo. The admin creates each Banana's account (name, username, temporary password, birthday) under **The Bananas** in the sidebar, and shares the login privately.
- Bananas log in with their **username**. Each username gets a hidden sign-in address behind the scenes (`username@bananabunch.invalid`), which never receives mail. Logging in with an email address also works, for older accounts created that way.
- Everyone can **change their password** in Settings. Admins can **reset** anyone's password and **delete** a Banana. Each of these signs that person out on every device.
- Each Banana can save a **recovery email** in their profile. "Forgot your password?" on the login page emails a reset link to it (needs Resend: see [Emails](docs/SETUP.md#emails-optional)).
- Deleting a Banana blocks their login, cancels their upcoming birthday plans and frees up their organiser jobs. Their past contributions and history stay.

### Birthdays and events

- Birthdays are entered as **DD-MM** (e.g. `08-11` for 8 November).
- **One calendar month before** a birthday, an event opens for it automatically.
- The birthday person **can't see their own event**: not its gift ideas, votes, organisers, photos or reward points.
- **Birthdays** shows upcoming birthdays and group events, as a list or a month calendar. Anyone can add a group event, optionally linked to a birthday (it's then hidden from the birthday person).
- **Past Birthdays** lists earlier birthdays, with a place for a shared photo-folder link.

### Organisers

- Each event gets a **gift organiser** and a **cake organiser**, drawn at random from the other Bananas.
- Admins aren't drawn. Anyone already chosen this year sits out the later draws.
- The first time you open a birthday, an animated **organiser wheel** reveals who was drawn. The result is saved, so replaying it ("Reveal the organisers") never changes it.
- Budgets default to **AUD 200** for the gift and **AUD 75** for the cake. Each organiser can change their own budget and currency.
- An admin can reassign an organiser, with a reason that gets recorded.

### Gift ideas and voting

- Bananas suggest gift ideas (name, description, optional HTTPS link, price, optional photo). Your own suggestion automatically gets your vote. Any participant can edit an idea while voting is open; the edit is recorded.
- The birthday person's **wishlist** items appear in the vote automatically, including ones added after voting opens.
- Everyone can **vote** for as many ideas as they like, and click again to take a vote back.
- Voting closes **14 days before the birthday**, at midnight in the bunch's timezone. If there's a single top idea, it wins. If there's a tie or no votes, voting stays open, with no deadline, until the gift organiser picks.
- The gift organiser can also choose early, and can choose more than one gift. An organiser can swap the chosen gift if it turns out to be unavailable, giving a reason.
- The cake organiser (or an admin) records the chosen cake.

### Wishlists

- Wishes can have a link, price and photo.
- Each wish is removed from your live wishlist **two years** after you add it. Saved birthday records keep it.

### Completing the jobs

- The gift organiser marks the gift as purchased, and the cake organiser marks the cake as ordered. An admin can do either. Both can be undone.
- When both are done, the event is marked **Completed**.

### Banana Points

Bananas earn points for helping out. They show up in **The Banana Bunch**, and a dancing-banana popup appears when you earn some.

| Action                                               | Points                   |
| ---------------------------------------------------- | ------------------------ |
| Completing the gift job                              | 15                       |
| Completing the cake job                              | 10                       |
| Your suggestion is chosen as the gift                | 10                       |
| Suggesting an idea early (within 3 / 7 / later days) | 3 / 2 / 1                |
| Writing a profile description (20+ characters)       | 2                        |
| Adding wishlist items                                | 1 each, up to 6 in total |

Points from a birthday stay hidden from the birthday person until that event is completed.

### Notifications

- In-app notifications (the bell) appear when an event opens, when voting is about to close or is extended, when a gift is chosen, when organisers change, and a week before the birthday.
- **Email** notifications are optional: Bananas opt in from their profile, and the app needs a Resend API key.

---

## Repo structure

```
index.html                         The page shell (title, icon)
src/
  main.tsx                         Starts the React app
  App.tsx                          Shows the login screen or the dashboard
  Login.tsx                        Login, password reset, first-admin setup
  Dashboard.tsx                    Everything after login (all pages and pop-ups)
  styles.css                       All styling
  supabase.ts                      Connects to your Supabase project
supabase/
  migrations/                      SQL that sets up the database and photo storage
  functions/circle/index.ts        The Edge Function: plugs Supabase into the handler
  functions/_shared/handler.ts     The API: every action, and who's allowed to do it
  functions/_shared/rules.ts       Core rules: when events open, the organiser draw,
                                   voting, points, notifications, who can see what
  functions/_shared/*.ts           Smaller rule modules (voting, ideas, wishlists,
                                   budgets and completion, accounts, photos, ...)
  functions/_shared/*.test.ts      Tests
  config.toml                      Supabase settings (used by the deploy command)
.github/workflows/deploy.yml       Publishes the site to GitHub Pages on every push to main
.env.example                       Template for your Supabase connection settings
```

**How it fits together:**

```
Browser (GitHub Pages)  ──log in──▶  Supabase Auth
        │
        └──{ action, ... }──▶  Edge Function "circle"  ──▶  Postgres table "circles"
           (or a photo)        (checks permissions,         (one JSON document: "group")
                                applies the rules)    ──▶  Storage bucket "photos"
```

Every call to the function returns the part of the bunch you're allowed to see, plus short-lived links for the photos you may view. Each save increases a version number, so two people saving at the same moment can't overwrite each other. The browser can't read the database or the photo bucket directly.

**Tech:** React 19 + Vite, [Supabase](https://supabase.com) (Postgres, Auth, Storage, Edge Functions on Deno), icons from [lucide](https://lucide.dev).

---

## Working on it

**Live site:** https://soopengi.github.io/bananabunch/

Setting up Supabase, deploying, and running it locally are covered in **[docs/SETUP.md](docs/SETUP.md)**. Once that's done, the day-to-day commands are:

| Command                   | What it does                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| `npm run dev`             | Start the site at http://localhost:5173, reloading as you edit    |
| `npm test`                | Run the tests (no Supabase needed: they use fakes)                |
| `npm run build`           | Type-check and build the site into `dist/`                        |
| `npm run deploy:function` | Deploy the `circle` Edge Function to your linked Supabase project |
| `npm run lint`            | Check the code for common mistakes                                |
| `npm run format`          | Auto-format the code with Prettier                                |

- Pushing to `main` publishes the website automatically.
- Changes under `supabase/functions/` also need `npm run deploy:function`.

---

## Known limitations

- Dates are shown in Australian format, and the default currency is AUD.
- Lint reports warnings because the bunch's data has no TypeScript types yet (`any` everywhere).
