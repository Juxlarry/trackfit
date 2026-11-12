import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowRight, Check, Flame, Info, Pause, Plus, Repeat, Sparkles, Target, Trash2, TrendingDown, TrendingUp, Trophy, X } from "lucide-react";
import { LAST_SETS, LOG_PLANNED_SESSION } from "../graphql/operations";
import type { PlannedExerciseDto, PlannedSessionDto, ProgressionOfferDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { ExerciseThumb } from "../figures/Figures";
import { patOf } from "../figures/figureEngine";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { localToday, mmss, noonOn } from "../lib/dates";
import {
  clearActive, readActive, sessionPath, useActiveWorkout, writeActive,
  type ActiveWorkout, type Ease, type OneOffSwap, type WorkoutRow,
} from "../lib/activeWorkout";
import { useSheets } from "./AppSheets";
import { REFETCH_LOGS, sessionOn } from "./planUtil";
import { ShareCard } from "./clubs/ShareCard";
import { ChallengeWorkoutSheet } from "./clubs/Challenges";
import { useMyChallenges } from "./clubs/challengeHooks";
import type { ClubChallengeDto } from "../graphql/types";
import { patternOf } from "@engine";
import { SwapPicker } from "./ExerciseSwap";
import { useResetSwap } from "./swapHooks";
import { challengeRule } from "../lib/clubFormat";

interface Hist { id: string; startedAt: string; sets: { setNumber: number; reps: number; weightKg: number; exercise: { id: string } }[] }

const without = <T,>(m: Record<number, T>, k: number) => Object.fromEntries(Object.entries(m).filter(([key]) => Number(key) !== k)) as Record<number, T>;
const COMPOUND = new Set(["squat", "rdl", "bench", "row", "pulldown", "press", "thrust", "lunge"]);
const midRep = (reps: string) => { const n = reps.match(/\d+/g); return n ? (n.length > 1 ? Math.round((+n[0] + +n[1]) / 2) : +n[0]) : 10; };
const EASE: { value: Ease; label: string; hint: string }[] = [
  { value: "EASY", label: "Easy", hint: "Reps to spare" },
  { value: "OKAY", label: "Okay", hint: "Hard but clean" },
  { value: "HARD", label: "Hard", hint: "A grind" },
];
const C = 2 * Math.PI * 22;

/** The saved workout, fitted to today's session (set counts can change if the plan changed meanwhile). */
function fresh(session: PlannedSessionDto, templateId: string, date: string, saved: ActiveWorkout | null): ActiveWorkout {
  const blank = (n: number): WorkoutRow[] => Array.from({ length: n }, () => ({ kg: "", reps: "", done: false }));
  if (saved && saved.templateId === templateId && saved.date === date) {
    return {
      ...saved,
      rows: session.exercises.map((e, i) => { const r = saved.rows[i] ?? []; return r.length >= e.sets ? r.slice(0, e.sets) : [...r, ...blank(e.sets - r.length)]; }),
      warm: session.warmup.map((_, i) => saved.warm[i] ?? false),
    };
  }
  const now = Date.now();
  return {
    v: 1, templateId, date, name: session.name, startedAt: now, touchedAt: now,
    rows: session.exercises.map((e) => blank(e.sets)), warm: session.warmup.map(() => false),
    oneOff: {}, ratings: {}, offers: {}, rest: null,
  };
}

/** "4 steady sessions at 40 kg. Go up to 42.5 kg?" and its two buttons (README "Exercise ease"). */
function offerText(o: ProgressionOfferDto, timed: boolean, fmt: (kg: number) => string) {
  const unit = timed ? " s" : " reps";
  const at = o.fromWeightKg != null ? ` at ${fmt(o.fromWeightKg)}` : "";
  switch (o.kind) {
    case "WEIGHT_UP": return { q: `${o.steady} steady sessions${at}. Go up to ${fmt(o.weightKg!)}?`, yes: `Go up to ${fmt(o.weightKg!)}`, no: `Keep ${fmt(o.fromWeightKg!)}` };
    case "REPS_UP": return { q: `${o.steady} steady sessions${at}. Try ${o.reps}${unit}?`, yes: `Try ${o.reps}`, no: `Keep ${o.fromReps}` };
    case "LIGHTER": return { q: `Hard the last two times. Try ${fmt(o.weightKg!)} and build back up?`, yes: `Try ${fmt(o.weightKg!)}`, no: `Keep ${fmt(o.fromWeightKg!)}` };
    case "GOAL": return { q: `Aim for ${o.reps}${unit} on each set this time${at}.`, yes: "", no: "" };
  }
}

export function SessionPage() {
  const { templateId: tid } = useParams();
  const [params] = useSearchParams();
  const plan = usePlan().plan!;
  const units = useUnits();
  const toast = useToast();
  const sheets = useSheets();
  const navigate = useNavigate();
  const today = useMemo(() => localToday(), []);
  const date = params.get("date") ?? today;
  const templateId = tid ?? "x";
  const session = plan.sessions.find((s) => s.templateId === tid) ?? sessionOn(plan, date);
  const histQ = useQuery<{ workoutHistory: Hist[] }>(LAST_SETS, { fetchPolicy: "cache-and-network" });
  const [logSession, { loading: saving }] = useMutation<{ logWorkoutSession: { id: string; durationMinutes: number | null; setCount: number; volumeKg: number; milestones: { type: string }[] } }>(LOG_PLANNED_SESSION, { refetchQueries: REFETCH_LOGS });

  // The workout in progress lives in lib/activeWorkout, saved on every change (README "A started workout is never lost").
  const { user, active } = useActiveWorkout();
  const other = active && (active.templateId !== templateId || active.date !== date) ? active : null;
  const [w, setW] = useState<ActiveWorkout | null>(() => (session && !other ? fresh(session, templateId, date, readActive(user)) : null));
  const restored = useRef(!!active && !other);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const [summary, setSummary] = useState<{ id: string | null; dur: number; sets: number; vol: number; prs: number; partial: boolean; all: number } | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const challenges = useMyChallenges(date).filter((m) => m.challenge.kind === "WORKOUT" && !m.doneForPeriod && !m.completed);
  const [challenge, setChallenge] = useState<ClubChallengeDto | null>(null);
  const [swapAt, setSwapAt] = useState<number | null>(null);
  const resetSwap = useResetSwap();
  const scroller = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const [restSeen, setRestSeen] = useState(true);

  /** Every change is saved straight away, and counts as activity for "Still training?". */
  const patch = (fn: (x: ActiveWorkout) => ActiveWorkout) => setW((x) => {
    if (!x) return x;
    const next = { ...fn(x), touchedAt: Date.now() };
    writeActive(user, next);
    return next;
  });

  // Starting (or reopening) saves it, so leaving at once still keeps the clock.
  useEffect(() => { if (w && !summary) writeActive(user, w); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { document.documentElement.style.overflow = "hidden"; return () => { document.documentElement.style.overflow = ""; }; }, []);

  // Rest runs from its end time, so it's right after time away. One that ended while away just clears.
  useEffect(() => {
    if (!w?.rest || now < w.rest.endsAt) return;
    const late = now - w.rest.endsAt > 3000;
    patch((x) => ({ ...x, rest: null }));
    if (!late) { toast("Rest done. Next set."); try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, w?.rest]);

  // Back after time away: scroll to the next unticked set.
  useEffect(() => {
    if (!restored.current || !w) return;
    restored.current = false;
    window.setTimeout(() => {
      for (let ei = 0; ei < w.rows.length; ei++) {
        const si = w.rows[ei].findIndex((r) => !r.done);
        if (si >= 0) { document.getElementById(`set-${ei}-${si}`)?.scrollIntoView({ block: "center" }); return; }
      }
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The bottom pill shows only while the in-card timer is scrolled out of view.
  const restKey = w?.rest ? `${w.rest.ei}:${w.rest.si}` : null;
  useEffect(() => {
    setRestSeen(true);
    const el = restRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRestSeen(e.isIntersecting), { root: scroller.current, rootMargin: "-70px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [restKey]);

  // Last time: the most recent logged set with the same exercise and set number.
  const last = useMemo(() => {
    const m = new Map<string, { weightKg: number; reps: number; startedAt: string }>();
    const hist = [...(histQ.data?.workoutHistory ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const h of hist) for (const s of h.sets) { const k = `${s.exercise.id}:${s.setNumber}`; if (!m.has(k)) m.set(k, { ...s, startedAt: h.startedAt }); }
    return m;
  }, [histQ.data]);

  // "Finish and save" from the "Still training?" bar.
  const finishAsked = params.get("finish") === "1";
  const asked = useRef(false);

  if (!session) return <Navigate to="/train" replace />;

  if (other || !w) {
    return (
      <div className="sess" role="dialog" aria-modal="true" aria-label="Workout in progress">
        <div className="sess-body" style={{ paddingTop: 48 }}>
          <section className="excard">
            <h3 style={{ marginTop: 0 }}>{other?.name ?? "Another workout"} is still in progress</h3>
            <p>Finish or discard it before starting {session.name}. One workout runs at a time.</p>
            <div className="opts">
              {other && <button type="button" className="opt noico" onClick={() => navigate(sessionPath(other), { replace: true })}><span className="t">Back to {other.name}</span><span className="tick"><ArrowRight /></span></button>}
              <button type="button" className="opt noico" onClick={() => { const f = fresh(session, templateId, date, null); clearActive(user); writeActive(user, f); setW(f); toast(`${other?.name ?? "Workout"} discarded.`); }}><span className="t">Discard it and start {session.name}</span><span className="tick"><Trash2 /></span></button>
              <button type="button" className="opt noico" onClick={() => navigate("/today")}><span className="t">Not now</span><span className="tick"><X /></span></button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  /** The session as it'll be done today: planned exercises, with today-only swaps in their place. */
  const exs: PlannedExerciseDto[] = session.exercises.map((e, ei) => {
    const o = w.oneOff[ei];
    return o ? { ...e, exerciseId: o.exerciseId, name: o.name, pattern: patternOf(o.name), suggestedLoadKg: o.suggestedLoadKg, startLoadKg: null, swapped: false, replaces: null, swappedFrom: null, offer: null } : e;
  });
  const rows = w.rows;
  const all = rows.flat().length;
  const doneN = rows.flat().filter((r) => r.done).length;
  const suggested = (e: PlannedExerciseDto) => (e.suggestedLoadKg != null ? units.toDisplay(e.suggestedLoadKg) : null);
  const placeholderKg = (e: PlannedExerciseDto, si: number) => {
    const l = e.exerciseId ? last.get(`${e.exerciseId}:${si + 1}`) : undefined;
    // New cycle: the check-in's weight until this exercise is logged in it.
    if (e.startLoadKg != null && !(l && l.startedAt.slice(0, 10) >= plan.startDate)) return String(units.toDisplay(e.startLoadKg));
    if (l && l.weightKg > 0) return String(units.toDisplay(l.weightKg));
    const s = suggested(e);
    return s != null ? String(Math.round(s)) : "BW";
  };
  const placeholderReps = (e: PlannedExerciseDto, si: number) => {
    const l = e.exerciseId ? last.get(`${e.exerciseId}:${si + 1}`) : undefined;
    return String(l?.reps ?? (/s$/.test(e.reps) ? 40 : midRep(e.reps)));
  };

  const update = (ei: number, si: number, p: Partial<WorkoutRow>) =>
    patch((x) => ({ ...x, rows: x.rows.map((r, i) => (i !== ei ? r : r.map((y, j) => (j !== si ? y : { ...y, ...p })))) }));
  const toggleSet = (ei: number, si: number) => {
    const e = exs[ei];
    const r = rows[ei][si];
    if (r.done) { patch((x) => ({ ...x, rows: x.rows.map((rr, i) => (i !== ei ? rr : rr.map((y, j) => (j !== si ? y : { ...y, done: false })))), rest: x.rest && x.rest.ei === ei && x.rest.si === si ? null : x.rest })); return; }
    const kgPh = placeholderKg(e, si);
    const filled = { done: true, kg: r.kg || (kgPh === "BW" ? "" : kgPh), reps: r.reps || placeholderReps(e, si) };
    const more = doneN + 1 < all;
    const secs = e.pattern && COMPOUND.has(e.pattern) ? 90 : 60;
    patch((x) => ({
      ...x,
      rows: x.rows.map((rr, i) => (i !== ei ? rr : rr.map((y, j) => (j !== si ? y : { ...y, ...filled })))),
      rest: more ? { endsAt: Date.now() + secs * 1000, total: secs, ei, si } : null,
    }));
    setJustDone(`${ei}:${si}`);
    window.setTimeout(() => setJustDone(null), 800);
    if (!more) toast("Last set done. Tap Finish to save your workout.");
  };
  const addRest = () => patch((x) => (x.rest ? { ...x, rest: { ...x.rest, endsAt: x.rest.endsAt + 15_000, total: x.rest.total + 15 } } : x));
  const skipRest = () => patch((x) => ({ ...x, rest: null }));
  const answerOffer = (ei: number, o: ProgressionOfferDto, yes: boolean) => patch((x) => ({
    ...x,
    offers: { ...x.offers, [ei]: yes },
    rows: !yes ? x.rows : x.rows.map((rr, i) => (i !== ei ? rr : rr.map((y) => (y.done ? y : {
      ...y, kg: o.weightKg != null ? String(units.toDisplay(o.weightKg)) : y.kg, reps: String(o.reps),
    })))),
  }));

  const finish = async () => {
    if (!doneN) { toast("Mark at least one set as done before finishing."); return; }
    const sets = exs.flatMap((e, ei) => e.exerciseId ? rows[ei].map((r, si) => ({ r, si })).filter(({ r }) => r.done).map(({ r, si }) => ({
      exerciseId: e.exerciseId!, setNumber: si + 1, reps: Math.max(1, Math.round(Number(r.reps) || 1)),
      weightKg: r.kg ? Math.round(units.fromDisplay(Number(r.kg)) * 100) / 100 : 0,
      ...(w.oneOff[ei] ? { replacesExerciseId: w.oneOff[ei].replaces.exerciseId } : {}),
    })) : []);
    // One rating per exercise that has a logged set.
    const logged = new Set(sets.map((s) => s.exerciseId));
    const ratings = [...new Map(exs.flatMap((e, ei) => (e.exerciseId && w.ratings[ei] && logged.has(e.exerciseId) ? [[e.exerciseId, w.ratings[ei]] as const] : []))).entries()]
      .map(([exerciseId, ease]) => ({ exerciseId, ease }));
    const dur = Math.round((Date.now() - w.startedAt) / 1000);
    try {
      const res = await logSession({ variables: { input: {
        templateId: session.templateId, durationMinutes: Math.max(1, Math.round(dur / 60)), sets,
        ...(ratings.length ? { ratings } : {}),
        ...(date !== today ? { startedAt: noonOn(date) } : {}),
      } } });
      const out = res.data?.logWorkoutSession;
      clearActive(user);
      setSummary({ id: out?.id ?? null, dur, sets: doneN, vol: out?.volumeKg ?? 0, prs: out?.milestones.length ?? 0, partial: doneN < all, all });
    } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save your workout. Try again."); }
  };
  if (finishAsked && !asked.current) { asked.current = true; queueMicrotask(() => (doneN ? void finish() : setLeaving(true))); }

  const keepRunning = () => { setLeaving(false); navigate("/today"); };
  const discard = () => { clearActive(user); setLeaving(false); toast("Workout discarded."); navigate("/today", { replace: true }); };
  const rest = w.rest;
  const restLeft = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  const ring = (size: number) => rest && (
    <div className="rr" style={{ width: size, height: size }}>
      <svg viewBox="0 0 52 52"><circle className="tr" cx="26" cy="26" r="22" /><circle className="fg" cx="26" cy="26" r="22" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - restLeft / rest.total)).toFixed(1)} /></svg>
      <span className="rt">{mmss(restLeft)}</span>
    </div>
  );

  return (
    <div className="sess" role="dialog" aria-modal="true" aria-label={`${session.name} workout`} ref={scroller}>
      <div className="sess-top">
        <div className="sess-top-in">
          <button type="button" className="iconbtn" aria-label="Leave workout" onClick={() => (summary ? navigate("/today") : setLeaving(true))}><X /></button>
          <div className="grow"><h2>{session.name}</h2><span className="clock">{mmss((now - w.startedAt) / 1000)}</span><span className="clock"> elapsed</span></div>
          <button type="button" className="finish" disabled={saving} onClick={() => void finish()}>Finish</button>
        </div>
        <div className="sess-prog"><i style={{ width: `${all ? (doneN / all) * 100 : 0}%` }} /></div>
      </div>
      <div className="sess-body">
        {session.warmup.length > 0 && (
          <section className="excard">
            <div className="excard-h"><span className="thumb"><Flame /></span><div><div className="t">Warm-up</div><div className="d">5 minutes, tick each one off</div></div><span /></div>
            <div className="ess">
              {session.warmup.map((wu, k) => (
                <button key={wu.name} type="button" className={w.warm[k] ? "on" : ""} aria-pressed={w.warm[k]} onClick={() => patch((x) => ({ ...x, warm: x.warm.map((v, i) => (i === k ? !v : v)) }))}>
                  <span className="bx"><Check /></span><span><span className="et">{wu.name}</span><span className="ed">{wu.dose}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}
        {exs.map((e, ei) => {
          const timed = /s$/.test(e.reps);
          // Swaps are offered until the first set of the exercise is ticked.
          const untouched = rows[ei].every((r) => !r.done);
          const finished = rows[ei].every((r) => r.done);
          const swapOk = !!e.exerciseId && !!session.templateId && untouched;
          const hasLoad = e.suggestedLoadKg != null || rows[ei].some((r) => r.kg) || e.offer?.weightKg != null;
          const offer = e.offer && !w.oneOff[ei] ? e.offer : null;
          const said = w.offers[ei];
          const ot = offer ? offerText(offer, timed, units.fmt) : null;
          return (
            <section className="excard" key={`${ei}:${e.name}`}>
              <div className="excard-h">
                <ExerciseThumb pattern={patOf(e.name)} name={e.name} onOpen={() => sheets.guide(e.name, e.pattern)} />
                <div>
                  <div className="t">{e.name}{e.swapped && <span className="tag swap">swap</span>}{w.oneOff[ei] && <span className="tag">Today only</span>}{e.swappedFrom && <span className="tag">Swapped</span>}</div>
                  <div className="d">{e.sets} sets of {e.reps}{e.swapped && e.replaces ? `, replaces ${e.replaces.toLowerCase()}` : ""}</div>
                  {untouched && (w.oneOff[ei] || e.swappedFrom) && (
                    <button type="button" className="linkbtn back-to" onClick={() => {
                      if (w.oneOff[ei]) patch((x) => ({ ...x, oneOff: without(x.oneOff, ei) }));
                      else void resetSwap.reset(session.templateId!, e.exerciseId!, e.swappedFrom!.name);
                    }}>Back to {(w.oneOff[ei]?.replaces ?? e.swappedFrom)!.name}</button>
                  )}
                </div>
                <span className="ex-acts">
                  {swapOk && <button type="button" className="linkbtn" onClick={() => setSwapAt(ei)}><Repeat />Swap</button>}
                  <button type="button" className="linkbtn" onClick={() => sheets.guide(e.name, e.pattern)}><Info />How</button>
                </span>
              </div>
              {offer && ot && (offer.kind === "GOAL" ? (
                <p className="offer goal"><Target /><span>{ot.q}</span></p>
              ) : said === undefined && untouched ? (
                <div className={`offer${offer.kind === "LIGHTER" ? " down" : ""}`} role="group" aria-label="Suggested change">
                  <p>{offer.kind === "LIGHTER" ? <TrendingDown /> : <TrendingUp />}<span>{ot.q}</span></p>
                  <div className="offer-acts">
                    <button type="button" className="yes" onClick={() => answerOffer(ei, offer, true)}>{ot.yes}</button>
                    <button type="button" onClick={() => answerOffer(ei, offer, false)}>{ot.no}</button>
                  </div>
                </div>
              ) : said === true ? (
                <p className="offer goal"><TrendingUp /><span>{ot.yes.replace(/^Go up to|^Try/, "Today:")}{offer.kind === "REPS_UP" ? (timed ? " s" : " reps") : ""}</span></p>
              ) : null)}
              <table className="sets">
                <thead><tr><th>Set</th><th>Last time</th><th>{hasLoad ? units.unit : "Load"}</th><th>{timed ? "Secs" : "Reps"}</th><th><span className="sr-only">Done</span></th></tr></thead>
                <tbody>
                  {rows[ei].map((r, si) => {
                    const l = e.exerciseId ? last.get(`${e.exerciseId}:${si + 1}`) : undefined;
                    const resting = rest && rest.ei === ei && rest.si === si;
                    return [
                      <tr key={si} id={`set-${ei}-${si}`} className={`${r.done ? "done" : ""}${justDone === `${ei}:${si}` ? " just" : ""}`}>
                        <td>{si + 1}</td>
                        <td className="prev">{l ? `${l.weightKg > 0 ? units.toDisplay(l.weightKg) : "BW"} x ${l.reps}` : "-"}</td>
                        <td><input inputMode="decimal" aria-label={`Set ${si + 1} ${units.unit}`} placeholder={placeholderKg(e, si)} value={r.kg} disabled={!hasLoad && !l} onChange={(ev) => update(ei, si, { kg: ev.target.value })} /></td>
                        <td><input inputMode="numeric" aria-label={`Set ${si + 1} ${timed ? "seconds" : "reps"}`} placeholder={placeholderReps(e, si)} value={r.reps} onChange={(ev) => update(ei, si, { reps: ev.target.value })} /></td>
                        <td><button type="button" className={`setbtn${r.done ? " on" : ""}`} aria-label={`Mark set ${si + 1} done`} aria-pressed={r.done} onClick={() => toggleSet(ei, si)}><Check /></button></td>
                      </tr>,
                      resting && (
                        <tr key={`rest-${si}`} className="rest-row">
                          <td colSpan={5}>
                            <div className="restin" role="status" ref={restRef}>
                              {ring(48)}
                              <div className="rl"><b>Rest</b>Next set when the ring empties</div>
                              <button type="button" onClick={addRest}>+15 s</button>
                              <button type="button" onClick={skipRest}>Skip</button>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
              {finished && e.exerciseId && (
                <div className="ease" role="group" aria-label={`How did ${e.name} feel?`}>
                  <p>How did that feel?</p>
                  <div className="ease-chips">
                    {EASE.map((o) => (
                      <button key={o.value} type="button" className={w.ratings[ei] === o.value ? "on" : ""} aria-pressed={w.ratings[ei] === o.value}
                        onClick={() => patch((x) => ({ ...x, ratings: x.ratings[ei] === o.value ? without(x.ratings, ei) : { ...x.ratings, [ei]: o.value } }))}>
                        <b>{o.label}</b><span>{o.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {ei === 0 && <p className="hintline"><Sparkles />Rate each exercise when you finish it. Next time we'll suggest whether to go up.</p>}
            </section>
          );
        })}
        {challenges.map(({ challenge: c }) => (
          <section className="excard ch-block" key={c.id}>
            <div className="excard-h">
              <span className="thumb"><Trophy /></span>
              <div><div className="t">Club challenge: {c.title}</div><div className="d">{c.clubName} · {challengeRule(c, units.unit === "lb")}</div></div>
              <button type="button" className="linkbtn" onClick={() => setChallenge(c)}>{c.timeLimitMinutes ? "Start the clock" : "Do it"}</button>
            </div>
            <div className="ch-ex">{c.exercises.map((e) => <div key={e.exerciseId}><span>{e.name}</span><span>{e.sets} × {e.reps}</span></div>)}</div>
          </section>
        ))}
        <div className="btnrow"><button type="button" className="ghost" onClick={() => sheets.activity("", date)}><Plus />Add activity</button></div>
      </div>
      {rest && !restSeen && (
        <button type="button" className="restpill" aria-label={`Rest, ${mmss(restLeft)} left. Show the exercise.`}
          onClick={() => restRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          {ring(40)}<span>Rest</span>
        </button>
      )}
      <Sheet open={swapAt !== null} onClose={() => setSwapAt(null)} label="Swap an exercise">
        {swapAt !== null && session.templateId && (() => {
          // A today-only swap is swapped again from the planned exercise, so options and the record stay about the plan.
          const planned = session.exercises[swapAt];
          return (
            <SwapPicker templateId={session.templateId} exercise={{ exerciseId: planned.exerciseId!, name: planned.name }}
              onOneOff={(o) => patch((x) => ({ ...x, oneOff: { ...x.oneOff, [swapAt]: { ...o, replaces: { exerciseId: planned.exerciseId!, name: planned.name } } as OneOffSwap }, offers: without(x.offers, swapAt) }))}
              onCycle={() => patch((x) => ({ ...x, oneOff: without(x.oneOff, swapAt), offers: without(x.offers, swapAt) }))}
              onDone={() => setSwapAt(null)} />
          );
        })()}
      </Sheet>
      <Sheet open={!!challenge} onClose={() => setChallenge(null)} label="Club challenge">
        {challenge && <ChallengeWorkoutSheet challenge={challenge} date={date} onDone={() => setChallenge(null)} />}
      </Sheet>
      <Sheet open={leaving} onClose={() => setLeaving(false)} label="Leave this workout?">
        <h3>Leave this workout?</h3>
        <p>{doneN ? `You've logged ${doneN} of ${all} sets.` : "Nothing ticked yet."} It keeps running until you finish or discard it, so you can come back to it from any tab.</p>
        <div className="opts">
          <button type="button" className="opt noico" onClick={keepRunning}><span className="t">Keep it running</span><span className="tick"><Pause /></span></button>
          {doneN > 0 && <button type="button" className="opt noico" onClick={() => { setLeaving(false); void finish(); }}><span className="t">Finish and save what I did</span><span className="tick"><Check /></span></button>}
          <button type="button" className="opt noico" onClick={discard}><span className="t">Discard this workout</span><span className="tick"><Trash2 /></span></button>
        </div>
      </Sheet>
      <Sheet open={!!summary} onClose={() => navigate("/today", { replace: true })} label="Workout done">
        {summary && (
          <>
            <div className="burst"><Check /></div>
            <h3 style={{ marginTop: 16 }}>{session.name} done.</h3>
            <p>{summary.partial ? `You did ${summary.sets} of ${summary.all} sets. Showing up is the hard part.` : "Every set done. Your ratings shape what we suggest next time."}</p>
            <div className="sumgrid">
              <div><b>{mmss(summary.dur)}</b>Time</div><div><b>{summary.sets}</b>Sets</div>
              <div><b>{units.toDisplay(summary.vol).toLocaleString("en-GB")}</b>{units.unit} lifted</div>
            </div>
            {summary.prs > 0 && <p style={{ marginTop: 8 }}><span className="pr" style={{ margin: "0 6px 0 0" }}>PR</span>{summary.prs} new personal best{summary.prs > 1 ? "s" : ""} today.</p>}
            {summary.id && <ShareCard link={{ sessionId: summary.id }} />}
            <button type="button" className="cta" style={{ marginTop: 16 }} onClick={() => navigate("/today", { replace: true })}>Back to Today</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
