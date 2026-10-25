# bananacircle

A private web app for a group of friends (the "Banana bunch") to organise each other's birthdays: share wishlists, suggest and vote on gifts, chip in on the cake, and take turns being the organiser. The birthday person never sees their own birthday plans, so the surprise stays a surprise.

The website is static, hosted on **GitHub Pages**. Sign-in, data, photos and the app's rules run on **Supabase**.

---

## What it does

### Accounts

- **Login only.** There's no public sign-up and no demo. The admin creates each Banana's account (name, username, temporary password, birthday) under **The Bananas** in the sidebar, and shares the login privately.
- Bananas log in with their **username**. Each username gets a hidden sign-in address behind the scenes (`username@bananabunch.invalid`), which never receives mail. Logging in with an email address also works, for older accounts created that way.
- Everyone can **change their password** in Settings. Admins can **reset** anyone's password and **delete** a Banana. Each of these signs that person out on every device.
- Each Banana can save a **recovery email** in their profile. "Forgot your password?" on the login page emails a reset link to it (needs Resend: see [Emails](#emails-optional)).
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

### Not finished yet

- **Birthday chat.** The rules for a private chat per birthday and comment threads on gift ideas exist and are tested (`supabase/functions/_shared/discussions.ts`), but no screen or API action uses them yet. The same was true on the original version.

---

## Repo structure

```
index.html                         The page shell (title, icon)
public/                            Images (the banana mascot)
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

## Setting up Supabase

You need a free Supabase account. Setup takes about 15 minutes.

### 1. Create the project

1. Sign up at [supabase.com](https://supabase.com). It asks you to create an organisation first: pick any name and the **Free** plan.
2. Click **New project**. Pick a name, generate a database password (save it somewhere), and choose the region closest to your friends (e.g. _Sydney_).

### 2. Set up the database and photo storage

In the left sidebar, open **SQL Editor**. Paste in and **Run** each file in `supabase/migrations/`, oldest first:

1. `20261025000000_create_circles.sql`: the data table
2. `20261027000000_accounts_and_photos.sql`: the photo bucket, sign-out-everywhere, and removal of the old demo data

### 3. Configure sign-in

Under **Authentication**:

1. **Sign In / Providers → Email**:
   - Turn **off** "Confirm email". Accounts are created by the admin, so there's nothing to confirm.
   - Set **Minimum password length** to **12**.
   - Optionally, turn **off** "Allow new users to sign up". The app never uses public sign-up, and admins create accounts through the server.
2. **URL Configuration**:
   - **Site URL**: your GitHub Pages address, e.g. `https://soopengi.github.io/bananabunch/` (use `http://localhost:5173` until the site is live).
   - **Redirect URLs**: add `http://localhost:5173/**` and `https://soopengi.github.io/bananabunch/**`. Password-reset links only work for addresses listed here.

### 4. Connect this repo to the project

1. Find the **Project URL** under **Project Settings → Data API** (or the **Connect** button), and the **Publishable key** under **Project Settings → API Keys**.
2. Copy `.env.example` to `.env.local` and paste both values in. Git ignores `.env.local`.

### 5. Deploy the Edge Function

In a terminal (PowerShell on Windows) in the project folder:

```bash
npx supabase login                               # opens your browser to approve
npx supabase link --project-ref <project-ref>    # the part before .supabase.co in your Project URL
npm run deploy:function
```

Run `npm run deploy:function` again whenever anything under `supabase/functions/` changes.

### 6. Set the secrets

```bash
npx supabase secrets set BOOTSTRAP_SECRET=<long-random-string> JOB_SECRET=<another-long-random-string>
```

(You can also set them in the dashboard under **Edge Functions → Secrets**.)

### 7. Create the first admin

1. Run the site (`npm install`, then `npm run dev`) and open http://localhost:5173, or open the live site.
2. On the login page, click **First time? Create the admin**. This link only appears while the bunch has no admin.
3. Enter your `BOOTSTRAP_SECRET`, your name, a username and a password. Then log in.
4. Add your friends under **The Bananas** in the sidebar, and send each their username and temporary password privately.

### 8. Daily scheduled jobs (recommended)

Opening events, closing votes and sending reminders run whenever someone uses the app. To make them run even when nobody visits:

1. **Database → Extensions**: enable `pg_cron` and `pg_net`.
2. In the **SQL Editor**, run this (fill in your project ref and `JOB_SECRET`). It runs every day at 20:00 UTC, which is early morning in Sydney:

```sql
select cron.schedule(
  'circle-daily-jobs',
  '0 20 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/circle',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "jobs", "secret": "<JOB_SECRET>"}'::jsonb
  );
  $$
);
```

### Emails (optional)

Password-reset emails and email notifications go out through [Resend](https://resend.com) (the free plan is plenty). Create an API key there, then:

```bash
npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="bananacircle <hi@your-domain.com>"
```

Without these, everything else works: there's just no "forgot password" email, so an admin resets passwords instead.

### Upgrading from the earlier Birthday Circle version

If your Supabase project was set up for the earlier version of this app:

1. Run `20261027000000_accounts_and_photos.sql` in the SQL Editor.
2. Run `npm run deploy:function`.
3. Your existing admin account keeps working: log in with **its email address** in the username box. Invitations from the old version no longer work; create accounts under **The Bananas** instead.

---

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. One-time setup on the GitHub repo:

1. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with the same values as in `.env.local`. These are public values, so _variables_ rather than _secrets_ is fine.
3. Push to `main`, or open the **Actions** tab and re-run the latest "Deploy to GitHub Pages" run.

The site appears at `https://<owner>.github.io/<repo-name>/`. On a free GitHub account, the repo must be **public** for Pages to work.

---

## Running it locally

After the Supabase setup above:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. The local site talks to your real Supabase project, so it uses the same data as the live site.

---

## Secrets

Set these on the Edge Function with `npx supabase secrets set NAME=value`, or in the dashboard under **Edge Functions → Secrets**.

| Name               | What it's for                                          |
| ------------------ | ------------------------------------------------------ |
| `BOOTSTRAP_SECRET` | Lets you create the first admin from the login page    |
| `JOB_SECRET`       | Protects the daily scheduled-jobs call                 |
| `RESEND_API_KEY`   | Optional: sends password-reset and notification emails |
| `EMAIL_FROM`       | The "from" address for those emails                    |

---

## Scripts

| Command                   | What it does                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| `npm run dev`             | Start the site at http://localhost:5173, reloading as you edit    |
| `npm test`                | Run the tests (no Supabase needed: they use fakes)                |
| `npm run build`           | Type-check and build the site into `dist/`                        |
| `npm run deploy:function` | Deploy the `circle` Edge Function to your linked Supabase project |
| `npm run lint`            | Check the code for common mistakes                                |
| `npm run format`          | Auto-format the code with Prettier                                |

---

## Known limitations

- Dates are shown in Australian format, and the default currency is AUD.
- Lint reports warnings because the bunch's data has no TypeScript types yet (`any` everywhere).
