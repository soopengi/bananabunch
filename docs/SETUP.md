# Setting up bananabunch

How to set up Supabase, deploy the site to GitHub Pages and run it locally. You only need most of this once; see [Updating](#updating) for the steps you'll repeat.

## Updating

- **Website changes** (anything in `src/` or `index.html`) go live automatically when you push to `main`.
- **Server changes** (anything in `supabase/functions/`) need `npm run deploy:function`.
- **Database changes** (a new file in `supabase/migrations/`): paste it into Supabase's **SQL Editor** and run it.

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
   - Set **Minimum password length** to match the app's minimum (`validatePassword` in `supabase/functions/_shared/accounts.ts`).
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
npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="bananabunch <hi@your-domain.com>"
```

Without these, everything else works: there's just no "forgot password" email, so an admin resets passwords instead.

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

## Starting over with a new bunch

`npm run reset-bunch` removes every Banana except the admin, clears all birthdays, wishlists, points, calendar events and photos, then creates new Bananas from a CSV file. The admin account and bunch settings are kept. This can't be undone.

1. Add the service role key to `.env.local` (dashboard: **Project Settings → API keys → `service_role`**). It bypasses all security, so never commit or share it:

   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

2. Make a CSV **outside this folder** (or anywhere; `*.csv` is ignored by git) with a header row. Birthdays are DD-MM, email is optional:

   ```
   name,username,birthday,email,password
   Ben Banana,ben,20-11,ben@example.com,a-temporary-password
   Cat Banana,cat,01-02,,another-temp-password
   ```

3. Dry run (changes nothing, shows what would happen):

   ```bash
   npm run reset-bunch -- path/to/users.csv
   ```

4. If it looks right, run it for real:

   ```bash
   npm run reset-bunch -- path/to/users.csv --confirm
   ```

Share each username and temporary password privately; Bananas can change their password in Settings. Delete the CSV afterwards, and remove the service role key from `.env.local` if you won't need it again.

---

## Secrets

Set these on the Edge Function with `npx supabase secrets set NAME=value`, or in the dashboard under **Edge Functions → Secrets**.

| Name               | What it's for                                          |
| ------------------ | ------------------------------------------------------ |
| `BOOTSTRAP_SECRET` | Lets you create the first admin from the login page    |
| `JOB_SECRET`       | Protects the daily scheduled-jobs call                 |
| `RESEND_API_KEY`   | Optional: sends password-reset and notification emails |
| `EMAIL_FROM`       | The "from" address for those emails                    |
