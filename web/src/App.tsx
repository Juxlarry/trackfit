import { Suspense, lazy, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import { usePlan } from "./hooks/usePlan";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { AppLayout } from "./app/AppLayout";
import { TodayPage } from "./app/TodayPage";
import { TrainPage } from "./app/TrainPage";
import { FuelPage } from "./app/FuelPage";
import { ProgressPage } from "./app/ProgressPage";
import { SessionPage } from "./app/SessionPage";
import { SignInPage } from "./pages/SignInPage";
import { WelcomePage, WelcomePhotoPage } from "./pages/WelcomePage";
// MVP 1 screens (and recharts) load only when opened.
const WeightPage = lazy(() => import("./pages/WeightPage").then((m) => ({ default: m.WeightPage })));
const WorkoutsPage = lazy(() => import("./pages/WorkoutsPage").then((m) => ({ default: m.WorkoutsPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));

/** "/" sends people where they belong: their plan, or the onboarding quiz. */
function Home() {
  const { ready } = useAuth();
  const { signedIn, loading, plan } = usePlan();
  if (!ready || loading) return <p className="boot">Loading…</p>;
  if (!signedIn) return <Navigate to="/start/welcome" replace />;
  return <Navigate to={plan ? "/today" : "/start/welcome"} replace />;
}

/** MVP 1 screens (custom templates, history, weight log) inside the new shell. */
function Legacy({ children }: { children: ReactNode }) {
  return (
    <div className="view-in legacy">
      <Link className="back-link" to="/train"><ArrowLeft />Back to Train</Link>
      <Suspense fallback={<p className="boot">Loading…</p>}>{children}</Suspense>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/start" element={<Navigate to="/start/welcome" replace />} />
      <Route path="/start/:stepId" element={<OnboardingFlow />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/welcome/photo" element={<WelcomePhotoPage />} />
      <Route element={<AppLayout />}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/train" element={<TrainPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/session/:templateId" element={<SessionPage />} />
        <Route path="/weight" element={<Legacy><WeightPage /></Legacy>} />
        <Route path="/workouts" element={<Legacy><WorkoutsPage /></Legacy>} />
        <Route path="/templates" element={<Legacy><TemplatesPage /></Legacy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
