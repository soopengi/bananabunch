// Supabase Edge Function "circle": the app's API.
// Connects the handler to Supabase's database, sign-in and photo storage, and
// adds CORS so the GitHub Pages site (a different domain) can call it.
//
// Deploy: npm run deploy:function (see README).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  handle,
  uploadPhoto,
  type Auth,
  type Context,
  type Photos,
  type Store,
  type User,
} from "../_shared/handler.ts";
import { MAX_PHOTO_BYTES } from "../_shared/photos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "photos";

// The service role key bypasses row-level security, so only this function
// can read or write the circles table and the photos bucket.
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const store: Store = {
  async load(id) {
    const { data, error } = await db
      .from("circles")
      .select("data, version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async createIfMissing(id, data) {
    const { error } = await db
      .from("circles")
      .upsert({ id, data }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  },
  async update(id, data, version) {
    const { data: rows, error } = await db
      .from("circles")
      .update({
        data,
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("version", version)
      .select("id");
    if (error) throw error;
    return rows.length === 1;
  },
};

const auth: Auth = {
  async createUser(email, password) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // there's no real inbox behind username logins
    });
    if (error) throw error;
    return data.user.id;
  },
  async deleteUser(id) {
    await db.auth.admin.deleteUser(id);
  },
  async setPassword(id, password) {
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw error;
  },
  async verifyPassword(email, password) {
    // A separate client, so checking the password never touches `db`.
    const checker = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await checker.auth.signInWithPassword({
      email,
      password,
    });
    return !error;
  },
  async revokeSessions(id) {
    // Defined in supabase/migrations: deletes the user's sessions so their
    // refresh tokens stop working.
    const { error } = await db.rpc("revoke_user_sessions", { target: id });
    if (error) throw error;
  },
  async disable(id) {
    const { error } = await db.auth.admin.updateUserById(id, {
      ban_duration: "876000h", // about 100 years
    });
    if (error) throw error;
  },
  async recoveryLink(email, redirectTo) {
    const { data, error } = await db.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (error) throw error;
    return data.properties.action_link;
  },
};

const photos: Photos = {
  async put(path, bytes, type) {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw error;
  },
  async remove(path) {
    await db.storage.from(BUCKET).remove([path]);
  },
  async signedUrls(paths) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 60); // links work for an hour
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const item of data)
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    return urls;
  },
};

const env = {
  BOOTSTRAP_SECRET: Deno.env.get("BOOTSTRAP_SECRET"),
  JOB_SECRET: Deno.env.get("JOB_SECRET"),
  RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
  EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

/** The signed-in user from the request's access token, or null for visitors. */
async function currentUser(req: Request): Promise<User> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  // The public API key isn't a user token, so this fails for visitors.
  if (error || !data.user) return null;
  // When the token was issued, so sign-out-everywhere can refuse older ones.
  let issuedAt = 0;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    issuedAt = Number(JSON.parse(atob(payload)).iat) || 0;
  } catch {
    issuedAt = 0;
  }
  return { id: data.user.id, email: data.user.email, issuedAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const ctx: Context = {
    user: await currentUser(req),
    store,
    auth,
    photos,
    env,
  };
  const type = req.headers.get("content-type") || "";

  // Photo uploads arrive as a form with a "photo" file.
  if (type.startsWith("multipart/form-data")) {
    if (
      Number(req.headers.get("content-length") || 0) >
      MAX_PHOTO_BYTES + 20000
    )
      return reply(413, { error: "Choose a photo smaller than 4 MB." });
    try {
      const form = await req.formData();
      const file = form.get("photo");
      if (!(file instanceof File))
        return reply(400, { error: "Choose a photo." });
      if (file.size > MAX_PHOTO_BYTES)
        return reply(413, { error: "Choose a photo smaller than 4 MB." });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadPhoto(
        bytes,
        String(form.get("event") || ""),
        ctx,
        String(form.get("target") || ""),
      );
      return reply(result.status, result.body);
    } catch {
      return reply(400, { error: "Photo upload failed." });
    }
  }

  if (Number(req.headers.get("content-length") || 0) > 20000)
    return reply(413, { error: "Request too large" });
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return reply(400, { error: "Invalid request" });
  }
  const result = await handle(body, ctx);
  return reply(result.status, result.body);
});
