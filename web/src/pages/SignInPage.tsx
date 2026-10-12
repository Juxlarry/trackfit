import { useState, type FormEvent } from "react";
import { useMutation } from "@apollo/client/react";
import type { ConfirmationResult } from "firebase/auth";
import { useAuth } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS, startPhoneSignIn } from "../firebase";
import { DEV_CREATE_USER } from "../graphql/operations";

const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

/**
 * Sign-in screen. Two implementations behind one route, selected by
 * VITE_DEV_AUTH_BYPASS (mirrors the backend's DEV_AUTH_BYPASS):
 *  - dev mode: a display-name box that calls devCreateUser and stores the
 *    returned id as the dev user (no real auth — sandbox/testing only).
 *  - production: real phone + OTP via Firebase Auth, per architecture.md §5.
 */
export function SignInPage() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">TrackFit</div>
        <p className="tagline">Weight, workouts, and progress — in one place.</p>
        <div className="card">{DEV_AUTH_BYPASS ? <DevSignIn /> : <PhoneSignIn />}</div>
      </div>
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  );
}

function DevSignIn() {
  const { setDevUserId } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [devCreateUser, { loading, error }] = useMutation<{
    devCreateUser: { id: string; displayName: string };
  }>(DEV_CREATE_USER);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    const result = await devCreateUser({ variables: { displayName: displayName.trim() } });
    const id = result.data?.devCreateUser?.id;
    if (id) setDevUserId(id);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Kwame"
          autoFocus
        />
      </div>
      {error && <p className="empty-state">{error.message}</p>}
      <button type="submit" disabled={loading || !displayName.trim()}>
        {loading ? "Signing in…" : "Continue (dev mode)"}
      </button>
      <p className="empty-state" style={{ marginTop: 12 }}>
        Dev auth bypass is on — this creates a throwaway test account instead
        of a real sign-in.
      </p>
    </form>
  );
}

function PhoneSignIn() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await startPhoneSignIn(phoneNumber.trim(), RECAPTCHA_CONTAINER_ID);
      setConfirmation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    if (!confirmation) return;
    setError(null);
    setLoading(true);
    try {
      await confirmation.confirm(code.trim());
      // onAuthStateChanged in AuthProvider picks up the signed-in user from here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setLoading(false);
    }
  }

  if (confirmation) {
    return (
      <form onSubmit={confirmCode}>
        <div className="form-row">
          <label htmlFor="otp">Enter the code we texted you</label>
          <input
            id="otp"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoFocus
          />
        </div>
        {error && <p className="empty-state">{error}</p>}
        <button type="submit" disabled={loading || !code.trim()}>
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode}>
      <div className="form-row">
        <label htmlFor="phone">Phone number</label>
        <input
          id="phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+233 55 123 4567"
          autoFocus
        />
      </div>
      {error && <p className="empty-state">{error}</p>}
      <button type="submit" disabled={loading || !phoneNumber.trim()}>
        {loading ? "Sending…" : "Send code"}
      </button>
    </form>
  );
}
