import { createClient } from "@supabase/supabase-js";

// Both values are public: they identify your Supabase project, and the
// database itself is locked down (see supabase/migrations). Set them in
// .env.local for local development, and as GitHub repository variables
// for the deployed site.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configError =
  url && key
    ? ""
    : "Supabase isn't configured. Copy .env.example to .env.local and fill it in (see README).";

export const supabase = createClient(
  url || "http://localhost",
  key || "missing",
);

/** Where Supabase sends people back to after email links (password resets). */
export const siteUrl = window.location.origin + import.meta.env.BASE_URL;

/**
 * Calls the "circle" Edge Function with { action, ... } (or a photo form).
 * Returns the HTTP status and the JSON reply, including for errors.
 */
export async function callCircle(
  body: Record<string, unknown> | FormData,
): Promise<{ status: number; json: any }> {
  const { data, error } = await supabase.functions.invoke("circle", { body });
  if (!error) return { status: 200, json: data };
  const response: Response | undefined = (error as any).context;
  if (response && typeof response.json === "function") {
    const json = await response.json().catch(() => ({}));
    return {
      status: response.status,
      json: { error: json.error || error.message, ...json },
    };
  }
  return {
    status: 503,
    json: { error: "The bunch can't be reached. Please try again." },
  };
}
