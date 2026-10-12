import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS } from "../firebase";
import { getFirebaseAuth } from "../firebase";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/weight", label: "Weight" },
  { to: "/workouts", label: "Workouts" },
  { to: "/templates", label: "Templates" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { signOutDev } = useAuth();

  async function handleSignOut() {
    if (DEV_AUTH_BYPASS) {
      signOutDev();
    } else {
      await getFirebaseAuth().signOut();
    }
  }

  return (
    <div>
      {DEV_AUTH_BYPASS && <div className="dev-banner">Dev auth bypass is on — not production auth</div>}
      <div className="app-shell">
        <nav className="app-nav">
          <div className="brand">TrackFit</div>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "active" : "")}
              end={link.to === "/"}
            >
              {link.label}
            </NavLink>
          ))}
          <div style={{ flex: 1 }} />
          <button className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </nav>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
