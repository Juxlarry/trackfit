import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { Activity, ArrowRight, CircleAlert } from "lucide-react";
import { useAuth, useIsSignedIn } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS, authErrorMessage, signInWithEmail, signInWithGoogle } from "../firebase";
import { DEV_CREATE_USER } from "../graphql/operations";

/**
 * Sign-in for returning users. New users never see this: they build a plan
 * at /start first and create their account at the end of it.
 */
export function SignInPage() {
  const navigate = useNavigate();
  const { setDevUserId } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devName, setDevName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCreateUser] = useMutation<{ devCreateUser: { id: string } }>(DEV_CREATE_USER);
  const signedIn = useIsSignedIn();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); navigate("/", { replace: true }); }
    catch (e) { setError(authErrorMessage(e)); setBusy(false); }
  };

  const onEmail = (e: FormEvent) => { e.preventDefault(); void run(() => signInWithEmail(email.trim(), password)); };
  const onDev = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await devCreateUser({ variables: { displayName: devName.trim() || "Test athlete" } });
      if (!res.data) throw new Error("Couldn't create a dev account.");
      setDevUserId(res.data.devCreateUser.id);
    });
  };

  // Already signed in on this device: go straight to the plan (or the quiz if there isn't one).
  if (signedIn && !busy) return <Navigate to="/" replace />;

  return (
    <div className="app is-plan">
      <main className="stage">
        <div className="top"><div className="brand" style={{ display: "flex" }}><span className="brand-mark"><Activity /></span>TrackFit</div></div>
        <div className="screen-wrap">
          <section id="screen">
            <div className="enter">
              <h1 className="qh">Welcome <mark>back</mark>.</h1>
              <p className="qs">Sign in to pick up your plan where you left it.</p>
              <div className="qb">
                {DEV_AUTH_BYPASS ? (
                  <form className="auth" onSubmit={onDev}>
                    <div className="field">
                      <label htmlFor="f-dev">Display name</label>
                      <input className="txt" id="f-dev" value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="e.g. Kwame" autoFocus />
                      <p className="help">Dev auth bypass is on. This creates a throwaway test account instead of a real sign-in.</p>
                    </div>
                    <button className="cta" type="submit" disabled={busy}>Continue in dev mode<ArrowRight /></button>
                  </form>
                ) : (
                  <div className="auth">
                    <button type="button" className="gbtn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
                      <span className="g" aria-hidden="true">G</span>Continue with Google
                    </button>
                    <div className="or">or with email</div>
                    <form onSubmit={onEmail} style={{ display: "grid", gap: 18 }}>
                      <div className="field">
                        <label htmlFor="f-email">Email address</label>
                        <input className="txt" id="f-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="f-pw">Password</label>
                        <input className="txt" id="f-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                      </div>
                      <button className="cta" type="submit" disabled={busy || !email || !password}>Sign in<ArrowRight /></button>
                    </form>
                  </div>
                )}
                {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
                <p className="help" style={{ marginTop: 24 }}>New to TrackFit? <Link to="/start/welcome">Build your plan first</Link>. It takes about 6 minutes.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
