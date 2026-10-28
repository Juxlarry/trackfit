import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowRight, Check, Flame, Info, Plus, Sparkles, Trash2, X } from "lucide-react";
import { LAST_SETS, LOG_PLANNED_SESSION } from "../graphql/operations";
import type { PlannedExerciseDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { ExerciseThumb } from "../figures/Figures";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { localToday, mmss, noonOn } from "../lib/dates";
import { useSheets } from "./AppSheets";
import { REFETCH_LOGS, sessionOn } from "./planUtil";

interface Row { kg: string; reps: string; done: boolean }
interface Hist { id: string; startedAt: string; sets: { setNumber: number; reps: number; weightKg: number; exercise: { id: string } }[] }

const COMPOUND = new Set(["squat", "rdl", "bench", "row", "pulldown", "press", "thrust", "lunge"]);
const midRep = (reps: string) => { const n = reps.match(/\d+/g); return n ? (n.length > 1 ? Math.round((+n[0] + +n[1]) / 2) : +n[0]) : 10; };

export function SessionPage() {
  const { templateId } = useParams();
  const [params] = useSearchParams();
  const plan = usePlan().plan!;
  const units = useUnits();
  const toast = useToast();
  const sheets = useSheets();
  const navigate = useNavigate();
  const today = useMemo(() => localToday(), []);
  const date = params.get("date") ?? today;
  const session = plan.sessions.find((s) => s.templateId === templateId) ?? sessionOn(plan, date);
  const histQ = useQuery<{ workoutHistory: Hist[] }>(LAST_SETS, { fetchPolicy: "cache-and-network" });
  const [logSession, { loading: saving }] = useMutation<{ logWorkoutSession: { id: string; durationMinutes: number | null; setCount: number; volumeKg: number; milestones: { type: string }[] } }>(LOG_PLANNED_SESSION, { refetchQueries: REFETCH_LOGS });

  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(t0);
  const [warm, setWarm] = useState<boolean[]>(() => session?.warmup.map(() => false) ?? []);
  const [rows, setRows] = useState<Row[][]>(() => session?.exercises.map((e) => Array.from({ length: e.sets }, () => ({ kg: "", reps: "", done: false }))) ?? []);
  const [rest, setRest] = useState<{ left: number; total: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [summary, setSummary] = useState<{ dur: number; sets: number; vol: number; prs: number; partial: boolean } | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    if (!rest) return;
    const id = window.setTimeout(() => {
      if (rest.left <= 1) { setRest(null); toast("Rest done. Next set."); } else setRest({ ...rest, left: rest.left - 1 });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [rest, toast]);
  useEffect(() => { document.documentElement.style.overflow = "hidden"; return () => { document.documentElement.style.overflow = ""; }; }, []);

  // Last time: the most recent logged set with the same exercise and set number.
  const last = useMemo(() => {
    const m = new Map<string, { weightKg: number; reps: number }>();
    const hist = [...(histQ.data?.workoutHistory ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const h of hist) for (const s of h.sets) { const k = `${s.exercise.id}:${s.setNumber}`; if (!m.has(k)) m.set(k, s); }
    return m;
  }, [histQ.data]);

  if (!session) return <Navigate to="/train" replace />;

  const all = rows.flat().length;
  const doneN = rows.flat().filter((r) => r.done).length;
  const suggested = (e: PlannedExerciseDto) => (e.suggestedLoadKg != null ? units.toDisplay(e.suggestedLoadKg) : null);
  const placeholderKg = (e: PlannedExerciseDto, si: number) => {
    const l = e.exerciseId ? last.get(`${e.exerciseId}:${si + 1}`) : undefined;
    if (l && l.weightKg > 0) return String(units.toDisplay(l.weightKg));
    const s = suggested(e);
    return s != null ? String(Math.round(s)) : "BW";
  };

  const update = (ei: number, si: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, i) => (i !== ei ? r : r.map((x, j) => (j !== si ? x : { ...x, ...patch })))));
  const toggleSet = (ei: number, si: number) => {
    const e = session.exercises[ei];
    const r = rows[ei][si];
    if (r.done) { update(ei, si, { done: false }); return; }
    const kgPh = placeholderKg(e, si);
    update(ei, si, { done: true, kg: r.kg || (kgPh === "BW" ? "" : kgPh), reps: r.reps || String(/s$/.test(e.reps) ? 40 : midRep(e.reps)) });
    setJustDone(`${ei}:${si}`);
    window.setTimeout(() => setJustDone(null), 800);
    if (doneN + 1 < all) { const secs = e.pattern && COMPOUND.has(e.pattern) ? 90 : 60; setRest({ left: secs, total: secs }); }
    else { setRest(null); toast("Last set done. Tap Finish to save your workout."); }
  };

  const finish = async () => {
    if (!doneN) { toast("Mark at least one set as done before finishing."); return; }
    const sets = session.exercises.flatMap((e, ei) => e.exerciseId ? rows[ei].map((r, si) => ({ r, si })).filter(({ r }) => r.done).map(({ r, si }) => ({
      exerciseId: e.exerciseId!, setNumber: si + 1, reps: Math.max(1, Math.round(Number(r.reps) || 1)),
      weightKg: r.kg ? Math.round(units.fromDisplay(Number(r.kg)) * 100) / 100 : 0,
    })) : []);
    const dur = Math.round((Date.now() - t0) / 1000);
    try {
      const res = await logSession({ variables: { input: {
        templateId: session.templateId, durationMinutes: Math.max(1, Math.round(dur / 60)), sets,
        ...(date !== today ? { startedAt: noonOn(date) } : {}),
      } } });
      const out = res.data?.logWorkoutSession;
      setRest(null);
      setSummary({ dur, sets: doneN, vol: out?.volumeKg ?? 0, prs: out?.milestones.length ?? 0, partial: doneN < all });
    } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save your workout. Try again."); }
  };

  const leave = () => { if (!doneN) navigate(-1); else setLeaving(true); };
  const C = 2 * Math.PI * 22;

  return (
    <div className="sess" role="dialog" aria-modal="true" aria-label={`${session.name} workout`}>
      <div className="sess-top">
        <div className="sess-top-in">
          <button type="button" className="iconbtn" aria-label="Leave workout" onClick={leave}><X /></button>
          <div className="grow"><h2>{session.name}</h2><span className="clock">{mmss((now - t0) / 1000)}</span><span className="clock"> elapsed</span></div>
          <button type="button" className="finish" disabled={saving} onClick={() => void finish()}>Finish</button>
        </div>
        <div className="sess-prog"><i style={{ width: `${all ? (doneN / all) * 100 : 0}%` }} /></div>
      </div>
      <div className="sess-body">
        {session.warmup.length > 0 && (
          <section className="excard">
            <div className="excard-h"><span className="thumb"><Flame /></span><div><div className="t">Warm-up</div><div className="d">5 minutes, tick each one off</div></div><span /></div>
            <div className="ess">
              {session.warmup.map((w, k) => (
                <button key={w.name} type="button" className={warm[k] ? "on" : ""} aria-pressed={warm[k]} onClick={() => setWarm((a) => a.map((x, i) => (i === k ? !x : x)))}>
                  <span className="bx"><Check /></span><span><span className="et">{w.name}</span><span className="ed">{w.dose}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}
        {session.exercises.map((e, ei) => {
          const timed = /s$/.test(e.reps);
          const hasLoad = e.suggestedLoadKg != null || rows[ei].some((r) => r.kg);
          return (
            <section className="excard" key={e.name}>
              <div className="excard-h">
                <ExerciseThumb pattern={e.pattern} name={e.name} onOpen={() => sheets.guide(e.name, e.pattern)} />
                <div><div className="t">{e.name}{e.swapped && <span className="tag swap">swap</span>}</div><div className="d">{e.sets} sets of {e.reps}{e.swapped && e.replaces ? `, replaces ${e.replaces.toLowerCase()}` : ""}</div></div>
                <button type="button" className="linkbtn" onClick={() => sheets.guide(e.name, e.pattern)}><Info />How</button>
              </div>
              <table className="sets">
                <thead><tr><th>Set</th><th>Last time</th><th>{hasLoad ? units.unit : "Load"}</th><th>{timed ? "Secs" : "Reps"}</th><th><span className="sr-only">Done</span></th></tr></thead>
                <tbody>
                  {rows[ei].map((r, si) => {
                    const l = e.exerciseId ? last.get(`${e.exerciseId}:${si + 1}`) : undefined;
                    return (
                      <tr key={si} className={`${r.done ? "done" : ""}${justDone === `${ei}:${si}` ? " just" : ""}`}>
                        <td>{si + 1}</td>
                        <td className="prev">{l ? `${l.weightKg > 0 ? units.toDisplay(l.weightKg) : "BW"} x ${l.reps}` : "-"}</td>
                        <td><input inputMode="decimal" aria-label={`Set ${si + 1} ${units.unit}`} placeholder={placeholderKg(e, si)} value={r.kg} disabled={!hasLoad && !l} onChange={(ev) => update(ei, si, { kg: ev.target.value })} /></td>
                        <td><input inputMode="numeric" aria-label={`Set ${si + 1} ${timed ? "seconds" : "reps"}`} placeholder={String(timed ? 40 : midRep(e.reps))} value={r.reps} onChange={(ev) => update(ei, si, { reps: ev.target.value })} /></td>
                        <td><button type="button" className={`setbtn${r.done ? " on" : ""}`} aria-label={`Mark set ${si + 1} done`} aria-pressed={r.done} onClick={() => toggleSet(ei, si)}><Check /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {ei === 0 && e.suggestedLoadKg != null && <p className="hintline"><Sparkles />Suggested {units.unit} is a starting estimate. Log what you actually lift and next week adjusts to it.</p>}
            </section>
          );
        })}
        <div className="btnrow"><button type="button" className="ghost" onClick={() => sheets.activity("", date)}><Plus />Add activity</button></div>
      </div>
      {rest && (
        <div className="restbar" role="status">
          <div className="rr">
            <svg viewBox="0 0 52 52"><circle className="tr" cx="26" cy="26" r="22" /><circle className="fg" cx="26" cy="26" r="22" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - rest.left / rest.total)).toFixed(1)} /></svg>
            <span className="rt">{mmss(rest.left)}</span>
          </div>
          <div className="rl"><b>Rest</b>Next set when the ring empties</div>
          <button type="button" onClick={() => setRest({ left: rest.left + 15, total: rest.total + 15 })}>+15 s</button>
          <button type="button" onClick={() => setRest(null)}>Skip</button>
        </div>
      )}
      <Sheet open={leaving} onClose={() => setLeaving(false)} label="Leave this workout?">
        <h3>Leave this workout?</h3>
        <p>You've logged {doneN} of {all} sets.</p>
        <div className="opts">
          <button type="button" className="opt noico" onClick={() => { setLeaving(false); void finish(); }}><span className="t">Finish and save what I did</span><span className="tick"><Check /></span></button>
          <button type="button" className="opt noico" onClick={() => setLeaving(false)}><span className="t">Keep going</span><span className="tick"><ArrowRight /></span></button>
          <button type="button" className="opt noico" onClick={() => { toast("Workout discarded."); navigate(-1); }}><span className="t">Discard this workout</span><span className="tick"><Trash2 /></span></button>
        </div>
      </Sheet>
      <Sheet open={!!summary} onClose={() => navigate("/today", { replace: true })} label="Workout done">
        {summary && (
          <>
            <div className="burst"><Check /></div>
            <h3 style={{ marginTop: 16 }}>{session.name} done.</h3>
            <p>{summary.partial ? `You did ${summary.sets} of ${all} sets. Showing up is the hard part.` : "Every set done. Next week's weights adjust to what you just lifted."}</p>
            <div className="sumgrid">
              <div><b>{mmss(summary.dur)}</b>Time</div><div><b>{summary.sets}</b>Sets</div>
              <div><b>{units.toDisplay(summary.vol).toLocaleString("en-GB")}</b>{units.unit} lifted</div>
            </div>
            {summary.prs > 0 && <p style={{ marginTop: 8 }}><span className="pr" style={{ margin: "0 6px 0 0" }}>PR</span>{summary.prs} new personal best{summary.prs > 1 ? "s" : ""} today.</p>}
            <button type="button" className="cta" style={{ marginTop: 16 }} onClick={() => navigate("/today", { replace: true })}>Back to Today</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
