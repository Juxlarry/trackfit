import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Dumbbell, FlaskConical, Moon, Ruler, ShieldCheck, Target, User, Utensils } from "lucide-react";
import { computeTargets } from "@engine";
import { useIsSignedIn } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS } from "../firebase";
import { usePlan } from "../hooks/usePlan";
import { useToast } from "../components/ui/Toast";
import { localToday } from "../lib/dates";
import { firstName, sampleDraft, toTraining, type Draft } from "./draft";
import { useOnboarding, useSubmitPlan } from "./OnboardingProvider";
import { BuildLoader, PlanReveal, SignUp, StartDateBody } from "./screens";
import { STAGES, STEPS, kgFmt, type Step, type StepCtx } from "./steps";

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);

const GOAL_LABEL: Record<string, string> = { LOSE_FAT: "Lose fat", BUILD_MUSCLE: "Build muscle", RECOMP: "Recompose", FITNESS: "Get fitter and stronger", MAINTAIN: "Maintain" };
const EQ_LABEL: Record<string, string> = { FULL_GYM: "full gym", SMALL_GYM: "small gym", HOME_GYM: "home gym", DUMBBELLS: "dumbbells", BANDS: "bands", BODYWEIGHT: "bodyweight" };
const ACT_LABEL: Record<string, string> = { DESK: "mostly sitting", LIGHT: "lightly active", ACTIVE: "active", VERY_ACTIVE: "very active" };

function heightText(d: Draft) {
  if (d.heightUnit === "ft") { const inch = Math.round(d.heightCm / 2.54); return `${Math.floor(inch / 12)}′${inch % 12}″`; }
  return `${d.heightCm} cm`;
}

/** Living "your plan, so far" panel on wide screens. */
function Summary({ d, idx }: { d: Draft; idx: number }) {
  const past = (id: string) => idx > indexOf(id);
  const t = past("fuelcheck") ? computeTargets(toTraining(d)) : null;
  const rows: { k: string; icon: ReactNode; v: string }[] = [
    { k: "Athlete", icon: <User />, v: d.name.trim() },
    { k: "Starting point", icon: <Ruler />, v: past("weight") ? `${kgFmt(d)(d.weightKg)}, ${heightText(d)}, ${d.age} yrs` : "" },
    { k: "Goal", icon: <Target />, v: d.goal && past("goal") ? GOAL_LABEL[d.goal] + (d.targetWeightKg && past("target") ? ` to ${kgFmt(d)(d.targetWeightKg)}` : "") : "" },
    { k: "Training", icon: <Dumbbell />, v: d.daysPerWeek && past("days") ? `${d.daysPerWeek} days${d.sessionMinutes && past("length") ? ` x ${d.sessionMinutes} min` : ""}${d.equipment ? `, ${EQ_LABEL[d.equipment]}` : ""}` : "" },
    { k: "Recovery", icon: <Moon />, v: past("sleep") && d.activityLevel ? `${d.sleepHours} h sleep, ${ACT_LABEL[d.activityLevel]}` : "" },
    { k: "Fuel", icon: <Utensils />, v: t ? `${t.kcal.toLocaleString("en-GB")} kcal, ${t.proteinG} g protein` : "" },
  ];
  const last = useRef<Record<string, string>>({});
  const flashes = rows.map((r) => !!r.v && last.current[r.k] !== undefined && last.current[r.k] !== r.v);
  useEffect(() => { rows.forEach((r) => { last.current[r.k] = r.v; }); });
  const fn = firstName(d);
  return (
    <aside className="panel" aria-label="Your plan so far">
      <div className="brand"><span className="brand-mark"><Activity /></span>TrackFit</div>
      <div>
        <h2>{fn ? `${fn}'s plan, so far` : "Your plan, so far"}</h2>
        <p className="lead">{idx > indexOf("plan") ? "Ready to go. Save it to start training." : "Every answer shapes your program and meals. Watch it fill in."}</p>
      </div>
      <div className="sofar">
        {rows.map((r, k) => (
          <div key={r.k} className={`sofar-row${r.v ? " set" : ""}${flashes[k] ? " flash" : ""}`}>
            <span className="sofar-ico">{r.icon}</span>
            <div><div className="sofar-k">{r.k}</div><div className="sofar-v">{r.v || "Not set yet"}</div></div>
          </div>
        ))}
      </div>
      <div className="panel-foot"><ShieldCheck /><span>Health answers are used only to check a generated plan is safe for you. They are never shared.</span></div>
    </aside>
  );
}

function Rail({ step, d, signedIn }: { step: Step; d: Draft; signedIn: boolean }) {
  return (
    <div className={`rail${step.stage < 0 ? " hide" : ""}`} aria-hidden="true">
      {STAGES.map((name, s) => {
        const inStage = STEPS.filter((x) => x.stage === s && !x.skip?.(d, signedIn));
        const pos = inStage.indexOf(step);
        const pct = s < step.stage ? 100 : s > step.stage ? 0 : Math.round(((pos + 1) / inStage.length) * 100);
        return (
          <div key={name} className={`rail-seg${s < step.stage ? " done" : s === step.stage ? " now" : ""}`}>
            <div className="rail-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="rail-lbl">{name}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The onboarding quiz at /start/:stepId. Answers live in the draft
 * (localStorage) so a refresh, or the sign-in redirect, never loses them.
 */
export function OnboardingFlow() {
  const { stepId = "welcome" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const signedIn = useIsSignedIn();
  const { me } = usePlan();
  const { draft: d, latest, set, replace } = useOnboarding();
  const submitPlan = useSubmitPlan();
  const today = useMemo(() => localToday(), []);
  const idx = indexOf(stepId);
  const step = STEPS[idx];
  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const goTo = useCallback((id: string, direction: 1 | -1) => {
    window.clearTimeout(timer.current);
    setDir(direction);
    const swap = () => { setLeaving(false); navigate(`/start/${id}`); window.scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" }); };
    if (reduce()) swap();
    else { setLeaving(true); timer.current = window.setTimeout(swap, 180); }
  }, [navigate]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const nextId = useCallback((from: number) => {
    const dd = latest();
    let k = from + 1;
    while (k < STEPS.length && STEPS[k].skip?.(dd, signedIn)) k++;
    return STEPS[Math.min(k, STEPS.length - 1)].id;
  }, [latest, signedIn]);

  const submit = useCallback(async (email: string | null, method: "google" | "email" | "existing") => {
    await submitPlan(email, method);
  }, [submitPlan]);

  const next = useCallback(async () => {
    if (!step) return;
    const dd = latest();
    if (step.valid && !step.valid(dd)) return;
    if (step.id === "start" && signedIn) {
      setBusy(true);
      try { await submit(me?.email ?? null, "existing"); }
      catch (e) { toast(e instanceof Error ? e.message : "Couldn't save your plan. Try again."); setBusy(false); }
      return;
    }
    if (step.onNext) { await step.onNext(ctx); return; }
    goTo(nextId(idx), 1);
    // ctx is rebuilt every render; reading it here is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, latest, signedIn, submit, me, toast, goTo, nextId, idx]);

  const back = () => {
    const dd = latest();
    let k = idx - 1;
    while (k > 0 && STEPS[k].skip?.(dd, signedIn)) k--;
    if (STEPS[k]?.id === "screened" || STEPS[k]?.id === "build") k = Math.max(0, indexOf(STEPS[k].id === "build" ? "support" : "safety"));
    if (k >= 0) goTo(STEPS[k].id, -1);
  };

  const pick = (patch: Partial<Draft>) => {
    set(patch);
    const here = step;
    window.setTimeout(() => {
      if (here && (!here.valid || here.valid(latest()))) goTo(nextId(indexOf(here.id)), 1);
    }, reduce() ? 60 : 340);
  };

  const ctx: StepCtx = { d, set, pick, next: () => void next(), go: (id) => goTo(id, -1), signedIn, today };

  // Enter advances, except in text areas, open sheets and screens without the action bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || !step || step.hideActions) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || document.querySelector(".sheet-back")) return;
      e.preventDefault();
      void next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, next]);

  if (!step) return <Navigate to="/start/welcome" replace />;
  // Deep links past the questions need a finished draft.
  if (["build", "plan", "start", "signup"].includes(step.id) && !d.support) return <Navigate to="/start/welcome" replace />;

  const valid = step.valid ? step.valid(d) : true;
  const cta = typeof step.cta === "function" ? step.cta(d) : step.cta ?? "Continue";

  let content: ReactNode;
  if (step.id === "build") content = <BuildLoader c={ctx} />;
  else if (step.id === "plan") content = <PlanReveal c={ctx} />;
  else if (step.id === "signup") content = <SignUp c={ctx} submit={submit} />;
  else if (step.screen) content = step.screen(ctx);
  else {
    content = (
      <>
        {step.title && <h1 className="qh">{step.title(d)}</h1>}
        {step.sub && <p className="qs">{step.sub(d)}</p>}
        <div className="qb">{step.id === "start" ? <StartDateBody c={ctx} /> : step.body?.(ctx)}</div>
      </>
    );
  }

  return (
    <div className={`app${step.wide ? " is-plan" : ""}`}>
      <Summary d={d} idx={idx} />
      <main className="stage">
        <div className="top">
          <div className="brand"><span className="brand-mark"><Activity /></span>TrackFit</div>
          <button className="back" type="button" onClick={back} disabled={idx === 0 || step.id === "build"}><ArrowLeft />Back</button>
          <Rail step={step} d={d} signedIn={signedIn} />
        </div>
        <div className="screen-wrap">
          <section id="screen" aria-live="polite">
            <div key={step.id} className={`${leaving ? "leave" : "enter"}${dir < 0 ? " back-dir" : ""}`}>{content}</div>
          </section>
        </div>
        <div className={`actions${step.hideActions ? " hide" : ""}`}>
          <button className="cta" type="button" disabled={!valid || busy} onClick={() => void next()}>
            {busy ? <><span className="spin" aria-hidden="true" />Saving your plan</> : <><span>{step.id === "start" && signedIn ? "Save my plan" : cta}</span><ArrowRight /></>}
          </button>
          <span className="hint">or press <kbd>Enter</kbd></span>
          {DEV_AUTH_BYPASS && step.id === "welcome" && (
            <button type="button" className="linkbtn" style={{ marginLeft: "auto" }}
              onClick={() => { replace({ ...sampleDraft(today), startChoice: "", startDate: "" }); goTo("build", 1); }}>
              <FlaskConical />Fill sample answers
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
