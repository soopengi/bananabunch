import { useEffect, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { loginEmail } from "../supabase/functions/_shared/accounts.ts";
import { callCircle, siteUrl, supabase } from "./supabase";

type Mode = "login" | "request" | "recovery" | "setup";

const mascot = import.meta.env.BASE_URL + "banana-ninja-v1.png";

/**
 * The login screen. `recovering` is true after someone opens a password-reset
 * link, so they can choose a new password.
 */
export default function Login({
  recovering = false,
  onRecovered,
}: {
  recovering?: boolean;
  onRecovered?: () => void;
}) {
  const [mode, M] = useState<Mode>(recovering ? "recovery" : "login"),
    [error, E] = useState(""),
    [message, S] = useState(""),
    [busy, B] = useState(false),
    [needsSetup, SETUP] = useState(false);

  useEffect(() => {
    if (recovering) M("recovery");
  }, [recovering]);

  // Ask the server whether the bunch still needs its first admin.
  useEffect(() => {
    callCircle({}).then(({ json }) => SETUP(!!json?.needsSetup));
  }, []);

  function switchTo(next: Mode) {
    M(next);
    E("");
    S("");
  }

  async function submit(e: any) {
    e.preventDefault();
    B(true);
    E("");
    S("");
    try {
      const values: any = Object.fromEntries(new FormData(e.currentTarget));
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail(values.username),
          password: values.password,
        });
        // The app switches to the dashboard when the sign-in lands.
        if (error) throw Error("Username or password is incorrect.");
        return;
      }
      if (mode === "request") {
        const { status, json } = await callCircle({
          action: "resetRequest",
          email: values.email,
          redirectTo: siteUrl,
        });
        if (status >= 400) throw Error(json.error);
        S(json.message);
        return;
      }
      if (mode === "recovery") {
        if (values.password !== values.confirmPassword)
          throw Error("The passwords do not match.");
        const { error } = await supabase.auth.updateUser({
          password: values.password,
        });
        if (error) throw Error(error.message);
        await supabase.auth.signOut();
        onRecovered?.();
        switchTo("login");
        S("Fresh password, happy Banana. You can now log in.");
        return;
      }
      if (mode === "setup") {
        if (values.password !== values.confirmPassword)
          throw Error("The passwords do not match.");
        const { status, json } = await callCircle({
          action: "setupAdmin",
          ...values,
        });
        if (status >= 400) throw Error(json.error);
        SETUP(false);
        switchTo("login");
        S(json.message);
      }
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  }

  const heading = {
    login: "Welcome back, Banana.",
    request: "A fresh peel.",
    recovery: "A fresh password for your Banana.",
    setup: "Plant the first Banana.",
  }[mode];
  const intro = {
    login: "Your bunch is waiting. Log in to bananacircle.",
    request:
      "Enter the recovery email saved in your profile and we’ll send you a reset link.",
    recovery: "Choose a new password for your Banana account.",
    setup:
      "Create the bunch’s first admin. You’ll need the setup secret (BOOTSTRAP_SECRET).",
  }[mode];
  const submitLabel = {
    login: "Log in",
    request: "Send reset link",
    recovery: "Update password",
    setup: "Create admin",
  }[mode];

  return (
    <main className="login-screen">
      <span className="login-brand">
        <img
          className="brand-mascot"
          src={mascot}
          alt=""
          width="64"
          height="72"
        />
        banana<span>circle</span>
      </span>
      <div className="login-layout">
        <section className="login-story">
          <div className="eyebrow">YOUR BUNCH. THEIR BIG DAYS.</div>
          <h1>
            One good banana.
            <br />A whole bunch of joy.
          </h1>
          <p>
            The gifts, the cake, the banana-sized details.
            <br />
            Bring the whole bunch together.
          </p>
          <div className="login-decoration mascot-decoration">
            <span>✳</span>
            <img
              src={mascot}
              alt="The bananacircle banana ninja mascot"
              width="205"
              height="220"
            />
            <span>✧</span>
          </div>
        </section>
        <section className="login-card">
          <span className="modal-icon">
            <KeyRound size={23} />
          </span>
          <h2>{heading}</h2>
          <p>{intro}</p>
          <form onSubmit={submit}>
            {mode === "login" && (
              <>
                <label>
                  Username
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    minLength={3}
                    placeholder="Your username"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    placeholder="Your password"
                  />
                </label>
              </>
            )}
            {mode === "request" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
            )}
            {mode === "setup" && (
              <>
                <label>
                  Setup secret
                  <input
                    name="secret"
                    type="password"
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  Your name
                  <input name="name" required minLength={2} maxLength={80} />
                </label>
                <label>
                  Username
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    pattern="[A-Za-z0-9_]{3,30}"
                    title="3–30 letters, numbers or underscores"
                  />
                </label>
                <label>
                  Birthday (DD-MM, optional)
                  <input
                    name="birthday"
                    pattern="[0-9]{2}-[0-9]{2}"
                    placeholder="08-11"
                  />
                </label>
              </>
            )}
            {(mode === "recovery" || mode === "setup") && (
              <>
                <label>
                  {mode === "setup" ? "Password" : "New password"}
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              </>
            )}
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
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Please wait…" : submitLabel}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="login-help">
            {mode === "login" ? (
              <button className="text-btn" onClick={() => switchTo("request")}>
                Forgot your password?
              </button>
            ) : (
              <button className="text-btn" onClick={() => switchTo("login")}>
                Back to login
              </button>
            )}
            {needsSetup && mode !== "setup" && (
              <button className="text-btn" onClick={() => switchTo("setup")}>
                First time? Create the admin
              </button>
            )}
          </div>
          <div className="login-join">
            Need to join the bunch? Ask your admin Banana for a username and
            password.
          </div>
        </section>
      </div>
      <p className="login-footer">Good gifts grow in good bunches. 🍌</p>
    </main>
  );
}
