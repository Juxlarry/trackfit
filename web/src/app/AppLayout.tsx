import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApolloClient } from "@apollo/client/react";
import { Activity, ChartLine, Dumbbell, Sun, Timer, Users, Utensils } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { usePlan } from "../hooks/usePlan";
import { takePendingJoin } from "../lib/pendingJoin";
import { syncPush } from "../lib/push";
import { AppSheets, useSheets } from "./AppSheets";
import { PulseLoader } from "../components/ui/PulseLoader";
import { STALE_MS, clearActive, sessionPath, useActiveWorkout } from "../lib/activeWorkout";
import { mmss } from "../lib/dates";
import { useToast } from "../components/ui/Toast";

const TABS = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/train", label: "Train", icon: Dumbbell },
  { to: "/fuel", label: "Fuel", icon: Utensils },
  { to: "/progress", label: "Progress", icon: ChartLine },
];
const CLUBS_TAB = { to: "/clubs", label: "Clubs", icon: Users };

/** Signed in + has an active plan, or redirect into onboarding. */
export function RequirePlan({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  const { signedIn, loading, plan, error } = usePlan();
  if (!ready || loading) return <PulseLoader full label="Loading your plan" />;
  if (!signedIn) return <Navigate to="/signin" replace />;
  if (error) return <p className="boot">Couldn't reach TrackFit. Check the API is running, then refresh. ({error.message})</p>;
  if (!plan) return <Navigate to="/start/welcome" replace />;
  return <>{children}</>;
}

function Tabs() {
  const nav = useRef<HTMLElement>(null);
  const loc = useLocation();
  const showClubs = usePlan().me?.showClubs ?? false;
  const tabs = showClubs ? [...TABS, CLUBS_TAB] : TABS;
  const [ind, setInd] = useState<{ w: number; h: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    // Measured again whenever any tab changes size (web fonts landing, Clubs
    // joining the bar, rotation), not just on navigation, so the highlight
    // never drifts off its tab (README "Tab highlight that stays on its tab").
    const move = () => {
      const on = nav.current?.querySelector<HTMLElement>(".tab.on");
      setInd((prev) => {
        const next = on ? { w: on.offsetWidth, h: on.offsetHeight, x: on.offsetLeft, y: on.offsetTop } : null;
        return prev && next && prev.w === next.w && prev.h === next.h && prev.x === next.x && prev.y === next.y ? prev : next;
      });
    };
    move();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(move);
    if (ro && nav.current) { ro.observe(nav.current); nav.current.querySelectorAll(".tab").forEach((t) => ro.observe(t)); }
    window.addEventListener("resize", move);
    let live = true;
    document.fonts?.ready.then(() => { if (live) move(); }).catch(() => {});
    return () => { live = false; ro?.disconnect(); window.removeEventListener("resize", move); };
  }, [loc.pathname, showClubs]);
  return (
    <nav className="tabs" aria-label="Main" ref={nav}>
      <div className="brand"><span className="brand-mark"><Activity /></span>TrackFit</div>
      <span className="tab-ind" aria-hidden="true" style={ind ? { width: ind.w, height: ind.h, transform: `translate(${ind.x}px,${ind.y}px)` } : { opacity: 0 }} />
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? " on" : ""}`}><Icon /><span>{label}</span></NavLink>
      ))}
      {!showClubs && <div className="tabs-foot"><Users /><span>Clubs join this menu in a later release.</span></div>}
    </nav>
  );
}

/** Opening the app again goes straight back into a running workout (once per app load). */
let resumedOnLoad = false;

/**
 * A started workout keeps running when you leave it (README "A started
 * workout is never lost"). This bar sits above the tabs on every screen and
 * takes you back. After 4 hours without a tick it asks "Still training?".
 */
function ResumeBar() {
  const { user, active } = useActiveWorkout();
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const inSession = loc.pathname.startsWith("/session/");
  useEffect(() => {
    if (!active || inSession) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, inSession]);
  useEffect(() => {
    if (resumedOnLoad || !active) return;
    resumedOnLoad = true;
    // A link that asks for something (e.g. the weigh-in push's ?weigh=1) wins; the bar still shows.
    if (!inSession && !loc.search && Date.now() - active.touchedAt < STALE_MS) navigate(sessionPath(active));
  }, [active, inSession, navigate, loc.search]);
  if (!active || inSession) return null;
  const stale = now - active.touchedAt >= STALE_MS;
  if (stale) {
    return (
      <div className="resume stale" role="status">
        <span className="ic"><Timer /></span>
        <span className="grow"><b>Still training?</b><span>{active.name} has been open for {Math.floor((now - active.startedAt) / 3_600_000)} h</span></span>
        <button type="button" onClick={() => navigate(`${sessionPath(active)}&finish=1`)}>Finish and save</button>
        <button type="button" className="quiet" onClick={() => { clearActive(user); toast("Workout discarded."); }}>Discard</button>
      </div>
    );
  }
  return (
    <button type="button" className="resume" onClick={() => navigate(sessionPath(active))}>
      <span className="ic"><Timer /></span>
      <span className="grow"><b>{active.name} in progress</b><span>Tap to carry on</span></span>
      <span className="clock">{mmss((now - active.startedAt) / 1000)}</span>
    </button>
  );
}

/** Back to a club join link opened before sign-in or the quiz (lib/pendingJoin). */
function ResumeJoin() {
  const navigate = useNavigate();
  useEffect(() => {
    const token = takePendingJoin();
    if (token) navigate(`/join/${token}`, { replace: true });
  }, [navigate]);
  return null;
}

export function AppLayout() {
  const client = useApolloClient();
  useEffect(() => { syncPush(client).catch(() => {}); }, [client]);
  return (
    <RequirePlan>
      <ResumeJoin />
      <AppSheets>
        <div className="shell">
          <Tabs />
          <ResumeBar />
          <main className="view"><Suspense fallback={<PulseLoader />}><Outlet /></Suspense></main>
        </div>
      </AppSheets>
    </RequirePlan>
  );
}

/** Page header with the profile avatar. */
export function ViewHead({ kicker, title }: { kicker: string; title: string }) {
  const { me } = usePlan();
  const sheets = useSheets();
  const initial = ((me?.displayName ?? "T").trim()[0] ?? "T").toUpperCase();
  return (
    <header className="vh">
      <div><p className="k">{kicker}</p><h1>{title}</h1></div>
      <button type="button" className="avatar" aria-label="Profile and settings" onClick={sheets.profile}>{initial}</button>
    </header>
  );
}
