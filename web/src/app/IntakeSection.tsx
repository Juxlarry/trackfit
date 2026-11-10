import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { ArrowLeft, ArrowRight, Check, SlidersHorizontal, Utensils, X } from "lucide-react";
import type { IntakeSection } from "@engine";
import { COMPLETE_FUEL_SETUP, FINE_TUNE_TRAINING, MY_PLAN } from "../graphql/operations";
import type { ActivePlanDto } from "../graphql/types";
import { usePlan } from "../hooks/usePlan";
import { localToday } from "../lib/dates";
import { readJson, removeKey, writeJson } from "../lib/storage";
import { useToast } from "../components/ui/Toast";
import { emptyDraft, type Draft } from "../onboarding/draft";
import { SECTION_BLOCK, blockSteps, toDetailsInput, toFuelInput } from "../onboarding/blocks";
import type { StepCtx } from "../onboarding/steps";
import { ViewHead } from "./AppLayout";

/**
 * Quick start's "asked later" questions (README "Quick start onboarding"):
 * the quiz's own screens for one block, one per screen, saved on the device as
 * they're answered so leaving halfway resumes there.
 */

const KEY = (s: IntakeSection) => `trackfit.intake.${s}`;
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the plan already knows, so titles, skips and suggestions work, and nothing known is asked blank. */
function seed(plan: ActivePlanDto, name: string): Draft {
  const p = plan.profile;
  return {
    ...emptyDraft(), path: "QUICK", name, goal: p.goal as Draft["goal"], weightKg: p.startWeightKg, heightCm: p.heightCm, targetWeightKg: p.targetWeightKg,
    daysPerWeek: plan.daysPerWeek, sessionMinutes: p.sessionMinutes as Draft["sessionMinutes"], experience: p.experience as Draft["experience"], equipment: p.equipment as Draft["equipment"],
    availableDays: plan.sessions.map((s) => s.weekday),
  };
}

export function SectionQuestions({ section, onSubmit, onDone, onCancel, cancelLabel = "Close" }: {
  section: IntakeSection;
  /** After the default save. */
  onDone?: () => void;
  /** Default: save with completeFuelSetup or fineTuneTraining. The check-in passes its own, to send the answers with cycle 2. */
  onSubmit?: (d: Draft) => Promise<void> | void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const { plan, me } = usePlan();
  const toast = useToast();
  const today = useMemo(() => localToday(), []);
  const [d, setD] = useState<Draft>(() => ({ ...seed(plan!, me?.displayName ?? ""), ...readJson<Partial<Draft>>(KEY(section), {}) }));
  const ref = useRef(d);
  const [idx, setIdxState] = useState(0);
  // The screen being shown, for handlers queued before a re-render (a quick double tap mustn't skip a question).
  const at = useRef(0);
  const setIdx = (n: number) => { at.current = n; setIdxState(n); };
  const [busy, setBusy] = useState(false);
  // ActivePlan has no id, so refresh it explicitly rather than relying on the cache.
  const refetch = { refetchQueries: [{ query: MY_PLAN }, "MealDay"], awaitRefetchQueries: true };
  const [fuel] = useMutation(COMPLETE_FUEL_SETUP, refetch);
  const [tune] = useMutation(FINE_TUNE_TRAINING, refetch);
  const steps = blockSteps(SECTION_BLOCK[section], d);
  const step = steps[Math.min(idx, steps.length - 1)];
  useEffect(() => { window.scrollTo({ top: 0 }); }, [idx]);

  const set = (patch: Partial<Draft>) => {
    ref.current = { ...ref.current, ...patch };
    setD(ref.current);
    writeJson(KEY(section), ref.current);
  };
  const submit = async () => {
    setBusy(true);
    try {
      if (onSubmit) await onSubmit(ref.current);
      else if (section === "FUEL") await fuel({ variables: { input: toFuelInput(ref.current) } });
      else await tune({ variables: { input: toDetailsInput(ref.current) } });
      removeKey(KEY(section));
      onDone?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      setBusy(false);
    }
  };
  const next = () => {
    const i = at.current;
    const now = blockSteps(SECTION_BLOCK[section], ref.current);
    const here = now[Math.min(i, now.length - 1)];
    if (here.valid && !here.valid(ref.current)) return;
    if (i >= now.length - 1) void submit();
    else setIdx(i + 1);
  };
  const pick = (patch: Partial<Draft>) => {
    set(patch);
    const from = at.current;
    window.setTimeout(() => { if (at.current === from) next(); }, reduce() ? 60 : 340);
  };
  const ctx: StepCtx = {
    d, set, pick, next, choosePath: () => {}, go: () => {}, signedIn: true, hasPlan: true, resume: null, apiDown: false, today,
  };
  const last = idx >= steps.length - 1;
  const valid = step.valid ? step.valid(d) : true;
  return (
    <div className="view-in section-q">
      <div className="section-top">
        <button type="button" className="iconbtn" aria-label={cancelLabel} onClick={onCancel}><X /></button>
        <div className="sess-prog" aria-hidden="true"><i style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
        <span className="mono">{idx + 1} of {steps.length}</span>
      </div>
      <div key={step.id} className="enter">
        {step.title && <h1 className="qh">{step.title(d)}</h1>}
        {step.sub && <p className="qs">{step.sub(d)}</p>}
        <div className="qb">{step.body?.(ctx)}</div>
      </div>
      <div className="actions inline">
        {idx > 0 && <button type="button" className="ghost" onClick={() => setIdx(idx - 1)}><ArrowLeft />Back</button>}
        <button type="button" className="cta" disabled={!valid || busy} onClick={next}>
          {busy ? "Saving…" : last ? <>{onSubmit ? "Done" : "Save"}<Check /></> : <>Continue<ArrowRight /></>}
        </button>
      </div>
    </div>
  );
}

/** Fuel for a quick start user who hasn't set it up: what's needed and why, then Answer now or Go back. */
export function FuelSetupGate() {
  const { plan } = usePlan();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [answering, setAnswering] = useState(false);
  const back = () => (location.key === "default" ? navigate("/today") : navigate(-1));
  if (answering) {
    return <SectionQuestions section="FUEL" onCancel={() => setAnswering(false)} cancelLabel="Stop for now"
      onDone={() => toast("Fuel is set up. Here's your menu.")} />;
  }
  return (
    <div className="view-in">
      <ViewHead kicker="Fuel" title="Set up Fuel" />
      <section className="card gate fadein">
        <span className="gate-ic"><Utensils /></span>
        <h3>Fuel builds your menu from how you eat, so it needs a few answers first.</h3>
        <p className="help">About 2 minutes: how you eat, allergies, meals you love, how often you eat, and your day. Until then your target is {plan!.targets.kcal.toLocaleString("en-GB")} kcal and {plan!.targets.proteinG} g protein a day.</p>
        <div className="btnrow">
          <button type="button" className="cta" onClick={() => setAnswering(true)}>Answer now<ArrowRight /></button>
          <button type="button" className="ghost" onClick={() => { toast("No problem. Fuel will be here when you're ready."); back(); }}><ArrowLeft />Go back</button>
        </div>
      </section>
    </div>
  );
}

/** /fine-tune: "Fine-tune your training", from Train or the profile sheet. */
export function FineTunePage() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <SectionQuestions section="TRAINING_DETAILS" cancelLabel="Stop for now" onCancel={() => navigate("/train")}
      onDone={() => { toast("Your plan is updated with your answers."); navigate("/train", { replace: true }); }} />
  );
}

/** Train tab card while the training details are still owed. */
export function FineTuneCard() {
  const { plan } = usePlan();
  const navigate = useNavigate();
  if (!plan?.pendingSections.includes("TRAINING_DETAILS")) return null;
  return (
    <section className="card fadein gate-card">
      <span className="gate-ic"><SlidersHorizontal /></span>
      <div>
        <h3>Fine-tune your training</h3>
        <p className="help">Your plan uses sensible defaults. Tell us about your lifts, favourite muscles, cardio and sleep to make it yours. About 2 minutes.</p>
      </div>
      <button type="button" className="ghost" onClick={() => navigate("/fine-tune")}>Fine-tune</button>
    </section>
  );
}
