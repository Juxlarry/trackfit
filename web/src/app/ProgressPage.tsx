import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@apollo/client/react";
import { Camera, CircleAlert, HeartPulse, Lock, Plus, TrendingUp } from "lucide-react";
import { addDaysIso, daysBetween, mondayOf } from "@engine";
import { ACTIVITY_LOGS, LAST_SETS, SESSIONS_BETWEEN, WEIGHT_HISTORY } from "../graphql/operations";
import type { ActivePlanDto, ActivityDto, SessionSummaryDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { useToast } from "../components/ui/Toast";
import { DAYS, dayShort, localToday } from "../lib/dates";
import { MEDIA_SLOTS, checkMediaFile, listMedia, saveMedia, type MediaLabel, type StoredMedia } from "../lib/media";
import { ViewHead } from "./AppLayout";
import { useSheets } from "./AppSheets";
import { ActivityRow } from "./TodayPage";
import { CYCLE_DAYS, checkinText, localDateOf, sessionOn, sessionsByDate } from "./planUtil";

interface WeightRow { id: string; weightKg: number; recordedAt: string }
interface HistSet { setNumber: number; reps: number; weightKg: number; exercise: { id: string } }
interface Hist { id: string; startedAt: string; sets: HistSet[] }

function WeightChart({ plan, weights, toDisplay }: { plan: ActivePlanDto; weights: WeightRow[]; toDisplay: (kg: number) => number }) {
  const W = 600, H = 220, pl = 40, pr = 16, pt = 14, pb = 28;
  const start = plan.startDate;
  const startKg = plan.profile.startWeightKg;
  const target = plan.profile.targetWeightKg;
  const pts = weights.map((w) => ({ x: daysBetween(start, localDateOf(w.recordedAt)), y: w.weightKg })).filter((p) => p.x >= -3 && p.x <= CYCLE_DAYS).sort((a, b) => a.x - b.x);
  if (!pts.length) pts.push({ x: 0, y: startKg });
  const rate = plan.projection ? (target != null && target < startKg ? -1 : 1) * plan.projection.weeklyRateKg : 0;
  const endProj = startKg + rate * 6;
  const ys = [...pts.map((p) => p.y), startKg, endProj, ...(target != null ? [target] : [])];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(0.8, (hi - lo) * 0.15);
  lo -= pad; hi += pad;
  const X = (x: number) => pl + ((W - pl - pr) * Math.max(0, x)) / CYCLE_DAYS;
  const Y = (y: number) => pt + (H - pt - pb) * (1 - (y - lo) / (hi - lo));
  const avg = pts.map((p) => { const win = pts.filter((q) => q.x <= p.x && q.x > p.x - 7); return { x: p.x, y: win.reduce((a, q) => a + q.y, 0) / win.length }; });
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend against your planned pace">
        {[hi - pad, (hi + lo) / 2, lo + pad].map((v) => (
          <g key={v}><line className="gl" x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} /><text x={pl - 6} y={Y(v) + 4} textAnchor="end">{Math.round(toDisplay(v) * 10) / 10}</text></g>
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((w) => <text key={w} x={X(w * 7)} y={H - 8} textAnchor="middle">{w === 0 ? "Start" : `W${w}`}</text>)}
        {target != null && target > lo && target < hi && (
          <><line className="goal" x1={pl} x2={W - pr} y1={Y(target)} y2={Y(target)} /><text x={W - pr} y={Y(target) - 6} textAnchor="end">Goal</text></>
        )}
        <path className="proj" d={`M${X(0)} ${Y(startKg)} L${X(CYCLE_DAYS)} ${Y(endProj)}`} />
        {avg.length > 1 && <path className="avg draw" style={{ "--len": 900 } as CSSProperties} d={avg.map((p, k) => `${k ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ")} />}
        {pts.map((p, k) => <circle key={k} className="pt" cx={X(p.x)} cy={Y(p.y)} r={3.5} />)}
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--ink)" }} />7-day average</span><span><i style={{ background: "var(--ink-3)" }} />Planned pace</span>
        {target != null && <span><i style={{ background: "var(--coral)" }} />Goal</span>}
      </div>
    </>
  );
}

function Photos({ plan, today }: { plan: ActivePlanDto; today: string }) {
  const toast = useToast();
  const [media, setMedia] = useState<StoredMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<MediaLabel>("Day 1");
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => new Map(media.map((m) => [m.label, URL.createObjectURL(m.blob)])), [media]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  useEffect(() => { void listMedia().then(setMedia); }, []);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const res = await checkMediaFile(f);
    if ("error" in res) { setError(res.error); return; }
    try { await saveMedia({ label: slot, kind: res.kind, blob: f, savedAt: Date.now() }); } catch { setError("Couldn't save on this device."); return; }
    setError(null);
    setMedia(await listMedia());
    toast(`${slot} ${res.kind === "video" ? "video" : "photo"} saved.`);
    if (input.current) input.current.value = "";
  };
  return (
    <>
      <div className="photos">
        {MEDIA_SLOTS.map(({ label, dayOffset }) => {
          const m = media.find((x) => x.label === label);
          const unlock = addDaysIso(plan.startDate, dayOffset);
          const open = unlock <= today;
          const pick = () => { setSlot(label); input.current?.click(); };
          if (m) {
            return (
              <div key={label} className="ph filled open" role="button" tabIndex={0} aria-label={`Replace ${label} ${m.kind}`} onClick={pick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}>
                {m.kind === "video" ? <video src={urls.get(label)} muted playsInline /> : <img src={urls.get(label)} alt={`${label} photo`} />}
                <span className="lbl">{label}</span>
              </div>
            );
          }
          return (
            <div key={label} className={`ph${open ? " open" : ""}`} {...(open ? { role: "button", tabIndex: 0, onClick: pick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } } : {})}>
              {open ? <Camera /> : <Lock />}<b>{label}</b>{open ? "Add photo or video" : `Unlocks ${dayShort(unlock)}`}
            </div>
          );
        })}
      </div>
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
      <p className="help" style={{ marginTop: 10 }}>Photos up to 10 MB. Videos up to 30 seconds and 50 MB. Kept on this device for now.</p>
    </>
  );
}

export function ProgressPage() {
  const plan = usePlan().plan!;
  const units = useUnits();
  const sheets = useSheets();
  const today = useMemo(() => localToday(), []);
  const heatStart = mondayOf(plan.startDate);
  const heatEnd = addDaysIso(heatStart, 41);
  const wkMon = mondayOf(today);
  const wQ = useQuery<{ weightHistory: WeightRow[] }>(WEIGHT_HISTORY, { variables: { limit: 90 }, fetchPolicy: "cache-and-network" });
  const sQ = useQuery<{ workoutSessionsBetween: SessionSummaryDto[] }>(SESSIONS_BETWEEN, { variables: { from: heatStart, to: heatEnd }, fetchPolicy: "cache-and-network" });
  const aQ = useQuery<{ activityLogs: ActivityDto[] }>(ACTIVITY_LOGS, { variables: { from: heatStart, to: heatEnd }, fetchPolicy: "cache-and-network" });
  const hQ = useQuery<{ workoutHistory: Hist[] }>(LAST_SETS, { fetchPolicy: "cache-and-network" });

  const weights = wQ.data?.weightHistory ?? [];
  const sorted = [...weights].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const startKg = plan.profile.startWeightKg;
  const cur = sorted.length ? sorted[sorted.length - 1].weightKg : startKg;
  const ch = cur - startKg;
  const target = plan.profile.targetWeightKg;
  const done = sessionsByDate(sQ.data?.workoutSessionsBetween);
  const acts = aQ.data?.activityLogs ?? [];
  const actDays = new Set(acts.map((a) => a.performedOn));
  let planned = 0;
  for (let k = 0; k < CYCLE_DAYS; k++) { const d = addDaysIso(plan.startDate, k); if (d <= today && sessionOn(plan, d)) planned++; }
  const doneCount = [...done.keys()].filter((d) => d >= plan.startDate).length;
  const wkCardio = acts.filter((a) => a.performedOn >= wkMon && (a.kind === "CARDIO" || a.kind === "SPORT"));
  const cMin = wkCardio.reduce((a, x) => a + x.durationMinutes, 0);
  const cKm = wkCardio.reduce((a, x) => a + (x.distanceKm ?? 0), 0);
  const cK = wkCardio.reduce((a, x) => a + (x.kcal ?? 0), 0);

  // Strength: estimated 1RM (Epley) of each session's opening lift across logged workouts.
  const lifts = useMemo(() => {
    const main = [...new Map(plan.sessions.map((s) => s.exercises[0]).filter((e) => e?.exerciseId && e.suggestedLoadKg != null).map((e) => [e.exerciseId!, e.name])).entries()].slice(0, 3);
    const hist = [...(hQ.data?.workoutHistory ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return main.map(([id, name]) => {
      const pts = hist.map((h) => Math.max(0, ...h.sets.filter((s) => s.exercise.id === id && s.weightKg > 0).map((s) => s.weightKg * (1 + s.reps / 30)))).filter((v) => v > 0).slice(-6);
      return { name, pts };
    }).filter((l) => l.pts.length >= 2);
  }, [plan.sessions, hQ.data]);

  return (
    <div className="view-in">
      <ViewHead kicker={`Since ${dayShort(plan.startDate)}`} title="Progress" />
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <div className="card-h">
              <div><h3>Body weight</h3><p>{weights.length > 2 ? "Dots are weigh-ins, the line is your 7-day average" : "Weigh in 3 to 4 times a week, first thing in the morning"}</p></div>
              <button type="button" className="cta small-cta" style={{ minWidth: 0 }} onClick={sheets.weighIn}>Log weigh-in<Plus /></button>
            </div>
            <div className="statrow">
              <div><b>{units.fmt(cur)}</b>Current</div>
              <div><b>{ch > 0 ? "+" : ch < 0 ? "-" : ""}{units.fmt(Math.abs(ch))}</b>Change</div>
              <div><b>{target != null ? units.fmt(Math.abs(cur - target)) : "-"}</b>To goal</div>
            </div>
            <div className="wchart"><WeightChart plan={plan} weights={weights} toDisplay={units.toDisplay} /></div>
          </section>
          <section className="card fadein" style={{ "--d": ".08s" } as CSSProperties}>
            <div className="card-h"><div><h3>Progress photos</h3><p>Same spot, same light. Private to you.</p></div></div>
            <Photos plan={plan} today={today} />
          </section>
        </div>
        <div className="acol">
          <section className="card fadein" style={{ "--d": ".05s" } as CSSProperties}>
            <div className="card-h"><div><h3>Consistency</h3><p>{doneCount} of {planned} planned sessions done so far</p></div></div>
            <div className="heat">
              <span />{DAYS.map((d) => <span key={d} style={{ textAlign: "center" }}>{d[0]}</span>)}
              {[0, 1, 2, 3, 4, 5].map((w) => (
                <Row key={w} w={w}>
                  {[0, 1, 2, 3, 4, 5, 6].map((k) => {
                    const d = addDaysIso(heatStart, w * 7 + k);
                    const c = done.has(d) ? "d" : actDays.has(d) ? "c" : d > today && d >= plan.startDate && sessionOn(plan, d) ? "p" : d > today ? "f" : "";
                    return <i key={d} className={c} title={dayShort(d)} />;
                  })}
                </Row>
              ))}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--lime)" }} />Workout</span><span><i style={{ background: "var(--coral)" }} />Other activity</span>
              <span><i style={{ background: "color-mix(in srgb,var(--ink) 18%,var(--sunk))" }} />Planned</span>
            </div>
          </section>
          <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
            <div className="card-h"><div><h3>Cardio this week</h3><p>From activities you log</p></div><button type="button" className="linkbtn" onClick={() => sheets.activity("CARDIO")}><Plus />Log</button></div>
            <div className="statrow"><div><b>{cMin}</b>Minutes</div><div><b>{Math.round(cKm * 10) / 10}</b>km</div><div><b>{cK.toLocaleString("en-GB")}</b>kcal</div></div>
            {wkCardio.length ? (
              <>
                <div className="list" style={{ marginTop: 8 }}>{wkCardio.slice(-3).reverse().map((a) => <ActivityRow key={a.id} a={a} />)}</div>
                <p className="fine" style={{ marginTop: 8 }}>* Estimated from your weight, time and effort when no calories were entered.</p>
              </>
            ) : <div className="empty" style={{ marginTop: 8 }}><HeartPulse /><span>No cardio logged this week yet.</span></div>}
          </section>
          <section className="card fadein" style={{ "--d": ".15s" } as CSSProperties}>
            <div className="card-h"><div><h3>Strength</h3><p>Estimated one-rep max on your main lifts</p></div></div>
            {lifts.length ? (
              <div className="lifts">
                {lifts.map((l) => {
                  const lo = Math.min(...l.pts), hi = Math.max(...l.pts), span = Math.max(hi - lo, 1);
                  const up = l.pts[l.pts.length - 1] - l.pts[0];
                  return (
                    <div className="lift" key={l.name}>
                      <span>{l.name}</span>
                      <svg className="spark" viewBox="0 0 110 36" preserveAspectRatio="none" aria-hidden="true">
                        <path d={l.pts.map((p, j) => `${j ? "L" : "M"}${(j * 106) / (l.pts.length - 1) + 2} ${(32 - ((p - lo) / span) * 28).toFixed(1)}`).join(" ")} />
                      </svg>
                      <b>{Math.round(units.toDisplay(l.pts[l.pts.length - 1]))} {up >= 0 && <span className="up">+{Math.round(units.toDisplay(up) * 10) / 10}</span>}</b>
                    </div>
                  );
                })}
              </div>
            ) : <div className="empty"><TrendingUp /><span>Log your main lift in 2 workouts and your strength trend appears here.</span></div>}
          </section>
          <section className="card fadein" style={{ "--d": ".2s" } as CSSProperties}>
            <div className="card-h"><div><h3>Cycle check-in</h3><p>{checkinText(plan, today)}</p></div></div>
          </section>
        </div>
      </div>
    </div>
  );
}

const Row = ({ w, children }: { w: number; children: React.ReactNode }) => <><span>W{w + 1}</span>{children}</>;
