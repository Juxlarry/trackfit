import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Activity, ChartLine, Dumbbell, Sun, Users, Utensils } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { usePlan } from "../hooks/usePlan";
import { AppSheets, useSheets } from "./AppSheets";

const TABS = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/train", label: "Train", icon: Dumbbell },
  { to: "/fuel", label: "Fuel", icon: Utensils },
  { to: "/progress", label: "Progress", icon: ChartLine },
];

/** Signed in + has an active plan, or redirect into onboarding. */
export function RequirePlan({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  const { signedIn, loading, plan, error } = usePlan();
  if (!ready || loading) return <p className="boot">Loading your plan…</p>;
  if (!signedIn) return <Navigate to="/start/welcome" replace />;
  if (error) return <p className="boot">Couldn't reach TrackFit. Check the API is running, then refresh. ({error.message})</p>;
  if (!plan) return <Navigate to="/start/welcome" replace />;
  return <>{children}</>;
}

function Tabs() {
  const nav = useRef<HTMLElement>(null);
  const loc = useLocation();
  const [ind, setInd] = useState<{ w: number; h: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const move = () => {
      const on = nav.current?.querySelector<HTMLElement>(".tab.on");
      setInd(on ? { w: on.offsetWidth, h: on.offsetHeight, x: on.offsetLeft, y: on.offsetTop } : null);
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, [loc.pathname]);
  return (
    <nav className="tabs" aria-label="Main" ref={nav}>
      <div className="brand"><span className="brand-mark"><Activity /></span>TrackFit</div>
      <span className="tab-ind" aria-hidden="true" style={ind ? { width: ind.w, height: ind.h, transform: `translate(${ind.x}px,${ind.y}px)` } : { opacity: 0 }} />
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? " on" : ""}`}><Icon /><span>{label}</span></NavLink>
      ))}
      <div className="tabs-foot"><Users /><span>Clubs join this menu in a later release.</span></div>
    </nav>
  );
}

export function AppLayout() {
  return (
    <RequirePlan>
      <AppSheets>
        <div className="shell">
          <Tabs />
          <main className="view"><Outlet /></main>
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
