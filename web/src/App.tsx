import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, useIsSignedIn } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { SignInPage } from "./pages/SignInPage";
import { DashboardPage } from "./pages/DashboardPage";
import { WeightPage } from "./pages/WeightPage";
import { WorkoutsPage } from "./pages/WorkoutsPage";
import { TemplatesPage } from "./pages/TemplatesPage";

function App() {
  const { ready } = useAuth();
  const isSignedIn = useIsSignedIn();

  if (!ready) {
    return <p className="empty-state" style={{ padding: 32 }}>Loading…</p>;
  }

  if (!isSignedIn) {
    return (
      <Routes>
        <Route path="*" element={<SignInPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
