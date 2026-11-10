import { Suspense, lazy, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import { usePlan } from "./hooks/usePlan";
import { AppLayout } from "./app/AppLayout";
import { SignInPage } from "./pages/SignInPage";
import { PulseLoader } from "./components/ui/PulseLoader";

// Each area downloads when first opened: returning users never load the
// onboarding quiz, and new users don't load the app until their plan exists.
const OnboardingFlow = lazy(() => import("./onboarding/OnboardingFlow").then((m) => ({ default: m.OnboardingFlow })));
const WelcomePage = lazy(() => import("./pages/WelcomePage").then((m) => ({ default: m.WelcomePage })));
const WelcomePhotoPage = lazy(() => import("./pages/WelcomePage").then((m) => ({ default: m.WelcomePhotoPage })));
const TodayPage = lazy(() => import("./app/TodayPage").then((m) => ({ default: m.TodayPage })));
const TrainPage = lazy(() => import("./app/TrainPage").then((m) => ({ default: m.TrainPage })));
const FuelPage = lazy(() => import("./app/FuelPage").then((m) => ({ default: m.FuelPage })));
const FineTunePage = lazy(() => import("./app/IntakeSection").then((m) => ({ default: m.FineTunePage })));
const ProgressPage = lazy(() => import("./app/ProgressPage").then((m) => ({ default: m.ProgressPage })));
const CheckinPage = lazy(() => import("./app/CheckinPage").then((m) => ({ default: m.CheckinPage })));
const SessionPage = lazy(() => import("./app/SessionPage").then((m) => ({ default: m.SessionPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((m) => ({ default: m.JoinPage })));
const ClubsPage = lazy(() => import("./app/clubs/ClubsPage").then((m) => ({ default: m.ClubsPage })));
const ClubPage = lazy(() => import("./app/clubs/ClubPage").then((m) => ({ default: m.ClubPage })));
const PostPage = lazy(() => import("./app/clubs/PostPage").then((m) => ({ default: m.PostPage })));
const MemberLogPage = lazy(() => import("./app/clubs/MemberLogPage").then((m) => ({ default: m.MemberLogPage })));
const RoutinePage = lazy(() => import("./app/clubs/RoutinePage").then((m) => ({ default: m.RoutinePage })));
const ChallengePage = lazy(() => import("./app/clubs/ChallengePage").then((m) => ({ default: m.ChallengePage })));
const ConsolePage = lazy(() => import("./app/clubs/ConsolePage").then((m) => ({ default: m.ConsolePage })));
// MVP 1 screens (and recharts).
const WeightPage = lazy(() => import("./pages/WeightPage").then((m) => ({ default: m.WeightPage })));
const WorkoutsPage = lazy(() => import("./pages/WorkoutsPage").then((m) => ({ default: m.WorkoutsPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));

/** "/" sends people where they belong: their plan, or the onboarding quiz. */
function Home() {
  const { ready } = useAuth();
  const { signedIn, loading, plan } = usePlan();
  if (!ready || loading) return <PulseLoader full />;
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
    <Suspense fallback={<PulseLoader full />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/start" element={<Navigate to="/start/welcome" replace />} />
      <Route path="/start/:stepId" element={<OnboardingFlow />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/welcome/photo" element={<WelcomePhotoPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route element={<AppLayout />}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/train" element={<TrainPage />} />
        <Route path="/fuel" element={<FuelPage />} />
        <Route path="/fine-tune" element={<FineTunePage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/session/:templateId" element={<SessionPage />} />
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/clubs" element={<ClubsPage />} />
        <Route path="/clubs/:id" element={<ClubPage />} />
        <Route path="/clubs/:id/posts/:postId" element={<PostPage />} />
        <Route path="/clubs/:id/members/:userId" element={<MemberLogPage />} />
        <Route path="/clubs/:id/routines/:routineId" element={<RoutinePage />} />
        <Route path="/clubs/:id/challenges/:challengeId" element={<ChallengePage />} />
        <Route path="/console" element={<ConsolePage />} />
        <Route path="/weight" element={<Legacy><WeightPage /></Legacy>} />
        <Route path="/workouts" element={<Legacy><WorkoutsPage /></Legacy>} />
        <Route path="/templates" element={<Legacy><TemplatesPage /></Legacy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
