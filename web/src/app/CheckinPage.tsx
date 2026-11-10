import { useMemo, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, ArrowRight, Camera, Check, CircleAlert, Repeat, Utensils } from "lucide-react";
import { addDaysIso, weekdayOf } from "@engine";
import { COMPLETE_CHECKIN, CYCLE_CHECKIN, LOG_WEIGHT, MY_PLAN, PREVIEW_NEXT_CYCLE } from "../graphql/operations";
import type { CheckinAnswers, CyclePreviewDto, CycleCheckinDto, EatingAdherence, GoalChoice, WorkoutFeel } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { adaptIcon } from "../components/plan/PlanBits";
import { ChipGroup, OptionList } from "../components/ui/Options";
import { useToast } from "../components/ui/Toast";
import { dayLabel, localToday } from "../lib/dates";
import { ViewHead } from "./AppLayout";
import { REFETCH_LOGS } from "./planUtil";
import { PulseLoader } from "../components/ui/PulseLoader";

/**
 * Week-6 check-in (backend planning/checkin.service.ts, rules in
 * engine/checkin.ts): what the cycle did, three questions, then the next
 * cycle with every change explained.
 */
type Step = "results" | "feel" | "eating" | "next" | "preview";
const STEPS: Step[] = ["results", "feel", "eating", "next", "preview"];

const FEEL: { value: WorkoutFeel; label: string; desc: string }[] = [
  { value: "TOO_EASY", label: "Too easy", desc: "I could have done more most sessions" },
  { value: "ABOUT_RIGHT", label: "About right", desc: "Hard work, but I finished them" },
  { value: "TOO_HARD", label: "Too hard", desc: "I often couldn't finish, or felt wrecked after" },
];
const EATING: { value: EatingAdherence; label: string; desc: string }[] = [
  { value: "MOST_DAYS", label: "Most days", desc: "I ate the plan, or close to it, 5+ days a week" },
  { value: "SOME_DAYS", label: "Some days", desc: "About half the time" },
  { value: "HARD", label: "Hard to follow", desc: "Most days I ate something else" },
];

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

export function CheckinPage() {
  const { plan } = usePlan();
  const today = useMemo(() => localToday(), []);
  const q = useQuery<{ cycleCheckin: CycleCheckinDto | null }>(CYCLE_CHECKIN, { variables: { today }, fetchPolicy: "cache-and-network" });
  const c = q.data?.cycleCheckin;
  if (!plan) return null;
  if (q.error) return <p className="boot">Couldn't load your check-in. Check your connection and try again.</p>;
  if (!c) return <PulseLoader label="Loading your 6 weeks" />;
  if (!c.open) return <Navigate to="/today" replace />;
  return <Flow c={c} today={today} onWeighed={() => void q.refetch()} />;
}

function Flow({ c, today, onWeighed }: { c: CycleCheckinDto; today: string; onWeighed: () => void }) {
  const r = c.results;
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>("results");
  const [feel, setFeel] = useState<WorkoutFeel | null>(null);
  const [eating, setEating] = useState<EatingAdherence | null>(c.eatingLog.suggested);
  const [days, setDays] = useState(r.suggestedDays);
  const [goalChoice, setGoalChoice] = useState<GoalChoice>("NEW_TARGET");
  const [target, setTarget] = useState<number | null>(r.suggestedTargetKg);
  const [keep, setKeep] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(addDaysIso(today, 1));
  const next = c.cycleNumber + 1;
  const answers: CheckinAnswers | null = feel && eating ? {
    feel, eating, days, keep,
    ...(r.goalReached ? { goalChoice: r.suggestedTargetKg == null ? "MAINTAIN" : goalChoice, newTargetKg: goalChoice === "NEW_TARGET" ? target : null } : {}),
  } : null;
  const go = (d: 1 | -1) => { setStep(STEPS[STEPS.indexOf(step) + d]); window.scrollTo({ top: 0 }); };
  const [complete, done] = useMutation(COMPLETE_CHECKIN, { refetchQueries: [{ query: MY_PLAN }, ...REFETCH_LOGS], awaitRefetchQueries: true });

  const titles: Record<Step, string> = {
    results: "Your 6 weeks", feel: "How did the workouts feel?", eating: "How did the eating plan go?",
    next: r.goalReached ? "You reached your goal" : "How many days next cycle?", preview: `Your cycle ${next}`,
  };
  return (
    <div className="view-in">
      <ViewHead kicker={`Cycle ${c.cycleNumber} check-in · ${STEPS.indexOf(step) + 1} of ${STEPS.length}`} title={titles[step]} />
      <div className="acol" style={{ maxWidth: 680 }}>
        {step === "results" && <Results c={c} onWeighed={onWeighed} />}
        {step === "feel" && (
          <section className="card fadein">
            <p className="help" style={{ marginTop: 0 }}>Think about weeks 5 and 6.</p>
            <OptionList label="How the workouts felt" options={FEEL} selected={feel ? [feel] : []} onPick={setFeel} />
          </section>
        )}
        {step === "eating" && (
          <section className="card fadein">
            <p className="help" style={{ marginTop: 0 }}>No judgement: this decides whether we change your calories or your meals.</p>
            {c.eatingLog.suggested && (
              <div className="note" role="note" style={{ marginBottom: 14 }}><Utensils /><span>From your Fuel log: you logged {c.eatingLog.loggedDays} days and were within 10% of your {c.currentKcal.toLocaleString("en-GB")} kcal on {c.eatingLog.onTargetDays} of them. We've picked an answer from that; change it if it feels wrong.</span></div>
            )}
            <OptionList label="How the eating plan went" options={EATING} selected={eating ? [eating] : []} onPick={setEating} />
          </section>
        )}
        {step === "next" && (r.goalReached ? (
          <GoalStep c={c} choice={r.suggestedTargetKg == null ? "MAINTAIN" : goalChoice} setChoice={setGoalChoice} target={target} setTarget={setTarget} />
        ) : (
          <section className="card fadein">
            <ChipGroup label="Training days" options={Array.from({ length: c.dayRange.max - c.dayRange.min + 1 }, (_, k) => c.dayRange.min + k)
              .map((n) => ({ value: n, label: `${n} days${n === c.currentDays ? " (same)" : ""}` }))} selected={[days]} onPick={setDays} />
            {r.suggestedDays < c.currentDays && (
              <div className="note" role="note"><CircleAlert /><span>You did {r.sessionsDone} of {r.sessionsPlanned} sessions, so we suggest {r.suggestedDays}. Fewer days you'll actually do beat more you'll skip. You can still pick {c.currentDays}.</span></div>
            )}
          </section>
        ))}
        {step === "preview" && answers && (
          <Preview today={today} answers={answers} next={next} keep={keep} setKeep={setKeep} startDate={startDate} setStartDate={setStartDate} />
        )}

        <div className="btnrow">
          {step !== "results" && <button type="button" className="ghost" onClick={() => go(-1)}><ArrowLeft />Back</button>}
          {step !== "preview" ? (
            <button type="button" className="cta" onClick={() => go(1)}
              disabled={(step === "results" && r.needsWeighIn) || (step === "feel" && !feel) || (step === "eating" && !eating) || (step === "next" && r.goalReached && goalChoice === "NEW_TARGET" && r.suggestedTargetKg != null && !target)}>
              {step === "results" ? "Three quick questions" : step === "next" ? `See my cycle ${next}` : "Next"}<ArrowRight />
            </button>
          ) : (
            <button type="button" className="cta" disabled={done.loading || !answers} onClick={async () => {
              try {
                await complete({ variables: { today, answers, startDate } });
                toast(`Cycle ${next} is ready. It starts ${startDate === today ? "today" : dayLabel(startDate)}.`);
                navigate("/today", { replace: true });
              } catch (e) { toast(e instanceof Error ? e.message : "Couldn't build your next cycle. Try again."); }
            }}>{done.loading ? "Building…" : `Start cycle ${next}`}<Check /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function Results({ c, onWeighed }: { c: CycleCheckinDto; onWeighed: () => void }) {
  const r = c.results;
  const units = useUnits();
  const toast = useToast();
  const [val, setVal] = useState("");
  const [log, logging] = useMutation(LOG_WEIGHT, { refetchQueries: REFETCH_LOGS });
  if (r.needsWeighIn) {
    return (
      <section className="card fadein">
        <div className="card-h"><div><h3>First, today's weigh-in</h3><p>Your results and next calories start from your real weight. Morning, after the bathroom, before food is best.</p></div></div>
        <form style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }} onSubmit={async (e) => {
          e.preventDefault();
          const v = Number(val);
          if (!v) return;
          try {
            await log({ variables: { input: { weightKg: Math.round(units.fromDisplay(v) * 10) / 10 } } });
            onWeighed();
          } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save that. Try again."); }
        }}>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="ci-kg">Weight ({units.unit})</label>
            <input className="txt mono" id="ci-kg" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(",", "."))} autoFocus />
          </div>
          <button type="submit" className="cta" style={{ minWidth: 0 }} disabled={!Number(val) || logging.loading}>Save</button>
        </form>
      </section>
    );
  }
  const onPace = r.changeKg != null && r.plannedChangeKg !== 0 ? Math.round((r.changeKg / r.plannedChangeKg) * 100) : null;
  return (
    <>
      <div className="stats fadein" style={{ marginTop: 0 }}>
        <div className="stat">
          <div className="v">{r.changeKg != null ? signed(units.toDisplay(r.changeKg)) : "–"}<small>{units.unit}</small></div>
          <div className="k">{r.endKg != null ? `${units.fmt(r.startKg)} → ${units.fmt(r.endKg)}` : "No weigh-ins at the end"}{r.plannedChangeKg ? `, planned ${signed(units.toDisplay(r.plannedChangeKg))} ${units.unit}` : ""}</div>
        </div>
        <div className="stat">
          <div className="v">{r.sessionsDone}<small>/ {r.sessionsPlanned}</small></div>
          <div className="k">sessions done ({Math.round(r.adherence * 100)}%)</div>
        </div>
        {r.bestLift && (
          <div className="stat">
            <div className="v">{signed(units.toDisplay(r.bestLift.toKg - r.bestLift.fromKg))}<small>{units.unit}</small></div>
            <div className="k">{r.bestLift.name}, {units.fmt(r.bestLift.fromKg)} → {units.fmt(r.bestLift.toKg)}</div>
          </div>
        )}
      </div>
      <section className="card fadein" style={{ "--d": ".08s" } as CSSProperties}>
        <p style={{ margin: 0 }}>{verdict(r, onPace)}</p>
        <div className="note" role="note"><Camera /><span>Haven't taken your Week 6 photo? <Link to="/progress">Add it on Progress</Link>, then come back. Your answers here aren't saved until the end.</span></div>
      </section>
    </>
  );
}

function verdict(r: CycleCheckinDto["results"], onPace: number | null): string {
  if (r.goalReached) return "You hit your goal weight. That's six weeks of showing up.";
  const sessions = r.adherence >= 0.8 ? "You showed up for nearly every session." : r.adherence >= 0.6 ? "You made most of your sessions." : "Sessions were hard to fit in this cycle.";
  if (onPace == null) return sessions;
  const pace = onPace >= 80 ? "Your weight moved right on plan." : onPace >= 50 ? "Your weight moved, a bit slower than planned." : onPace > 0 ? "Your weight moved less than planned." : "Your weight didn't move the way we planned.";
  return `${sessions} ${pace} Three questions and we'll tune the next six weeks around it.`;
}

function GoalStep({ c, choice, setChoice, target, setTarget }: {
  c: CycleCheckinDto; choice: GoalChoice; setChoice: (g: GoalChoice) => void; target: number | null; setTarget: (n: number | null) => void;
}) {
  const r = c.results;
  const units = useUnits();
  const options = [
    ...(r.suggestedTargetKg != null ? [{ value: "NEW_TARGET" as const, label: "Set a new target", desc: `Keep the momentum: suggested ${units.fmt(r.suggestedTargetKg)}, another 6 weeks at the same pace` }] : []),
    { value: "MAINTAIN" as const, label: "Hold this weight, get stronger", desc: "Calories to maintain, training keeps progressing" },
  ];
  return (
    <section className="card fadein">
      <p className="help" style={{ marginTop: 0 }}>{c.targetWeightKg != null && `Your target was ${units.fmt(c.targetWeightKg)}. `}What's next?</p>
      <OptionList label="Next goal" options={options} selected={[choice]} onPick={setChoice} />
      {choice === "NEW_TARGET" && r.suggestedTargetKg != null && (
        <div className="field" style={{ marginTop: 14, maxWidth: 200 }}>
          <label htmlFor="ci-target">New target ({units.unit})</label>
          <input className="txt mono" id="ci-target" inputMode="decimal" defaultValue={units.toDisplay(r.suggestedTargetKg)}
            onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); setTarget(v ? Math.round(units.fromDisplay(v) * 10) / 10 : null); }} />
        </div>
      )}
      {target != null && choice === "NEW_TARGET" && <p className="help">The next cycle checks it's a healthy weight for your height.</p>}
    </section>
  );
}

function Preview({ today, answers, next, keep, setKeep, startDate, setStartDate }: {
  today: string; answers: CheckinAnswers; next: number; keep: string[]; setKeep: (k: string[]) => void; startDate: string; setStartDate: (d: string) => void;
}) {
  const units = useUnits();
  const q = useQuery<{ previewNextCycle: CyclePreviewDto }>(PREVIEW_NEXT_CYCLE, { variables: { today, answers } });
  const p = q.data?.previewNextCycle;
  // One row per swap, plus swaps the user undid (shown as kept).
  const swaps = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of p?.sessions.flatMap((s) => s.exercises) ?? []) if (e.rotatedFrom) m.set(e.rotatedFrom, e.name);
    return [...m.entries()].map(([from, to]) => ({ from, to }));
  }, [p]);
  const monday = addDaysIso(today, (7 - weekdayOf(today)) % 7 || 7);
  if (q.error) return <div className="err" role="alert"><CircleAlert /><span>{q.error.message}</span></div>;
  if (!p) return <p className="boot">Building your cycle {next}…</p>;
  return (
    <>
      <section className="card fadein">
        <div className="card-h"><div><h3>What changes</h3><p>{p.daysPerWeek} days a week, {p.splitLabel.toLowerCase()}. {p.targets.kcal.toLocaleString("en-GB")} kcal and {p.targets.proteinG} g protein a day.</p></div></div>
        <div className="adapt">
          <ul style={{ display: "flex", flexDirection: "column", gap: 14, padding: 0, margin: 0, listStyle: "none" }}>
            {p.changes.map((x, k) => {
              const Icon = adaptIcon(x.icon);
              return <li key={k}><span className="ai"><Icon /></span><span><b>{x.title}</b><br /><span style={{ color: "var(--ink-2)", fontSize: 13.5 }}>{x.why}</span></span></li>;
            })}
          </ul>
        </div>
      </section>
      {(swaps.length > 0 || keep.length > 0) && (
        <section className="card fadein" style={{ "--d": ".06s" } as CSSProperties}>
          <div className="card-h"><div><h3>New exercises</h3><p>Same muscles, a fresh angle. Prefer the old one? Keep it.</p></div></div>
          <div className="list">
            {swaps.map(({ from, to }) => (
              <div className="li" key={from}>
                <span className="ic"><Repeat /></span>
                <span><span className="t">{to}</span><span className="d" style={{ display: "block" }}>Replaces {from}</span></span>
                <button type="button" className="linkbtn" disabled={q.loading} onClick={() => setKeep([...keep, from])}>Keep {from.toLowerCase()}</button>
              </div>
            ))}
            {keep.map((name) => (
              <div className="li" key={name}>
                <span className="ic"><Check /></span>
                <span><span className="t">{name}</span><span className="d" style={{ display: "block" }}>Kept from last cycle</span></span>
                <button type="button" className="linkbtn" disabled={q.loading} onClick={() => setKeep(keep.filter((k) => k !== name))}>Use the new one</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {p.sessions.some((s) => s.exercises.some((e) => e.startLoadKg != null)) && (
        <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
          <div className="card-h"><div><h3>Starting weights</h3><p>From what you lifted in weeks 5 and 6.</p></div></div>
          <div className="list">
            {[...new Map(p.sessions.flatMap((s) => s.exercises).filter((e) => e.startLoadKg != null).map((e) => [e.name, e])).values()].map((e) => (
              <div className="li" key={e.name}><span /><span className="t">{e.name}</span><span className="mono">{units.fmt(e.startLoadKg!)}</span></div>
            ))}
          </div>
        </section>
      )}
      <section className="card fadein" style={{ "--d": ".14s" } as CSSProperties}>
        <div className="card-h"><div><h3>When do you start?</h3><p>Your current plan runs until then.</p></div></div>
        <ChipGroup label="Start date" selected={[startDate]} onPick={setStartDate} options={[
          { value: today, label: "Today" }, { value: addDaysIso(today, 1), label: "Tomorrow" },
          ...(monday > addDaysIso(today, 1) ? [{ value: monday, label: "Next Monday" }] : []),
        ]} />
      </section>
    </>
  );
}
