import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import Dashboard from "./Dashboard";
import Login from "./Login";
import { configError, supabase } from "./supabase";

/** Shows the login screen or the dashboard, depending on who's signed in. */
export default function App() {
  const [signedIn, SIGNED_IN] = useState<boolean | null>(null),
    [recovering, RECOVERING] = useState(false);

  useEffect(() => {
    if (configError) return;
    // Fires on page load (INITIAL_SESSION) and on every sign-in or sign-out.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Opening a password-reset link signs you in briefly so you can choose
      // a new password: stay on the login screen for that.
      if (event === "PASSWORD_RECOVERY") RECOVERING(true);
      SIGNED_IN(!!session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (configError)
    return (
      <div className="loading">
        <Gift size={40} />
        <p>{configError}</p>
      </div>
    );
  if (signedIn === null) return <div className="loading" />;
  if (!signedIn || recovering)
    return (
      <Login recovering={recovering} onRecovered={() => RECOVERING(false)} />
    );
  return <Dashboard />;
}
