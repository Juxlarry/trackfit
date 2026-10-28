import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { DEV_AUTH_BYPASS, getFirebaseAuth } from "../firebase";

interface AuthState {
  /** True once we know whether someone is signed in (avoids a login-page flash). */
  ready: boolean;
  /** Real Firebase user, when not in dev-bypass mode. */
  firebaseUser: FirebaseUser | null;
  /** Dev-bypass user id (mirrors the backend's x-dev-user-id header). */
  devUserId: string | null;
  setDevUserId: (id: string | null) => void;
  signOutDev: () => void;
  /** Signs out of whichever auth mode is active. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const DEV_USER_ID_KEY = "trackfit.devUserId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(DEV_AUTH_BYPASS);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [devUserId, setDevUserIdState] = useState<string | null>(() => {
    if (!DEV_AUTH_BYPASS) return null;
    try {
      return localStorage.getItem(DEV_USER_ID_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setFirebaseUser(user);
      setReady(true);
    });
    return unsubscribe;
  }, []);

  function setDevUserId(id: string | null) {
    setDevUserIdState(id);
    try {
      if (id) localStorage.setItem(DEV_USER_ID_KEY, id);
      else localStorage.removeItem(DEV_USER_ID_KEY);
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }

  function signOutDev() {
    setDevUserId(null);
  }

  async function signOut() {
    if (DEV_AUTH_BYPASS) signOutDev();
    else await getFirebaseAuth().signOut();
  }

  return (
    <AuthContext.Provider value={{ ready, firebaseUser, devUserId, setDevUserId, signOutDev, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useIsSignedIn() {
  const { firebaseUser, devUserId } = useAuth();
  return DEV_AUTH_BYPASS ? devUserId !== null : firebaseUser !== null;
}
