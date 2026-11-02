import { Suspense, lazy, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import { usePlan } from "./hooks/usePlan";
import { AppLayout } from "./app/AppLayout";
import { SignInPage } from "./pages/SignInPage";

// Each area downloads when first opened: returning users never load the
// onboarding quiz, and new users don't load the app until their plan exists.
const OnboardingFlow = lazy(() => import("./onboarding/OnboardingFlow").then((m) => ({ default: m.OnboardingFlow })));
const WelcomePage = lazy(() => import("./pages/WelcomePage").then((m) => ({ default: m.WelcomePage })));
const WelcomePhotoPage = lazy(() => import("./pages/WelcomePage").then((m) => ({ default: m.WelcomePhotoPage })));
const TodayPage = lazy(() => import("./app/TodayPage").then((m) => ({ default: m.TodayPage })));
const TrainPage = lazy(() => import("./app/TrainPage").then((m) => ({ default: m.TrainPage })));
const FuelPage = lazy(() => import("./app/FuelPage").then((m) => ({ default: m.FuelPage })));
const ProgressPage = lazy(() => import("./app/ProgressPage").then((m) => ({ default: m.ProgressPage })));
const SessionPage = lazy(() => import("./app/SessionPage").then((m) => ({ default: m.SessionPage })));
// MVP 1 screens (and recharts).
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
      {children}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<p className="boot">Loading…</p>}>
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
    </Suspense>
  );
}
