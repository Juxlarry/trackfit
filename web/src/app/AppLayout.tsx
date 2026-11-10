import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApolloClient } from "@apollo/client/react";
import { Activity, ChartLine, Dumbbell, Sun, Users, Utensils } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { usePlan } from "../hooks/usePlan";
import { takePendingJoin } from "../lib/pendingJoin";
import { syncPush } from "../lib/push";
import { AppSheets, useSheets } from "./AppSheets";
import { PulseLoader } from "../components/ui/PulseLoader";

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
    const move = () => {
      const on = nav.current?.querySelector<HTMLElement>(".tab.on");
      setInd(on ? { w: on.offsetWidth, h: on.offsetHeight, x: on.offsetLeft, y: on.offsetTop } : null);
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
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
