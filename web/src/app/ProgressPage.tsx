import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Camera, CircleAlert, Columns2, HeartPulse, Lock, Plus, Trash2, TrendingUp } from "lucide-react";
import { addDaysIso, daysBetween, mondayOf } from "@engine";
import { ACTIVITY_LOGS, LAST_SETS, MY_CYCLES, SESSIONS_BETWEEN, SYNC_PROGRESS_PHOTOS, WEIGHT_HISTORY } from "../graphql/operations";
import type { ActivePlanDto, ActivityDto, CycleSpanDto, SessionSummaryDto } from "../graphql/types";
import { Sheet } from "../components/ui/Sheet";
import { usePlan, useUnits } from "../hooks/usePlan";
import { useToast } from "../components/ui/Toast";
import { DAYS, dayShort, localToday } from "../lib/dates";
import { MEDIA_SLOTS, checkMediaFile, deleteMedia, listMedia, mediaErrorMessage, mediaInCloud, releaseMedia, saveMedia, type MediaItem, type MediaLabel } from "../lib/media";
import { ViewHead } from "./AppLayout";
import { useSheets } from "./AppSheets";
import { ActivityRow } from "./TodayPage";
import { CYCLE_DAYS, checkinIsOpen, checkinText, localDateOf, sessionOn, sessionsByDate } from "./planUtil";

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

const SLOT_ORDER = MEDIA_SLOTS.map((s) => s.label);
const byTime = (a: MediaItem, b: MediaItem) => a.cycle - b.cycle || SLOT_ORDER.indexOf(a.label) - SLOT_ORDER.indexOf(b.label);
const takenOn = (m: MediaItem) => localDateOf(new Date(m.savedAt).toISOString());
const photoName = (m: MediaItem) => `Cycle ${m.cycle} · ${m.label}`;

/** The weigh-in closest to a date, within 3 days either side. */
function weightNear(weights: WeightRow[], iso: string): number | null {
  let best: { gap: number; kg: number } | null = null;
  for (const w of weights) {
    const gap = Math.abs(daysBetween(localDateOf(w.recordedAt), iso));
    if (gap <= 3 && (!best || gap < best.gap)) best = { gap, kg: w.weightKg };
  }
  return best?.kg ?? null;
}

function MediaView({ m, controls }: { m: MediaItem; controls?: boolean }) {
  return m.kind === "video"
    ? <video src={m.src} muted={!controls} controls={controls} playsInline preload="metadata" />
    : <img src={m.src} alt={`${photoName(m)} photo`} />;
}

/** Two photos side by side, each with its date and the weigh-in nearest to it. */
function PhotoPair({ a, b, weights }: { a: MediaItem; b: MediaItem; weights: WeightRow[] }) {
  const units = useUnits();
  const [ka, kb] = [weightNear(weights, takenOn(a)), weightNear(weights, takenOn(b))];
  const days = daysBetween(takenOn(a), takenOn(b));
  return (
    <>
      <div className="ph-pair">
        {[a, b].map((m, k) => (
          <figure key={m.path}>
            <div className="ph filled"><MediaView m={m} controls /></div>
            <figcaption><b>{k ? "Latest" : "First"}</b>{photoName(m)}<span>{dayShort(takenOn(m))}{(k ? kb : ka) != null && ` · ${units.fmt((k ? kb : ka)!)}`}</span></figcaption>
          </figure>
        ))}
      </div>
      <p className="help ph-gap">
        {days > 0 ? `${days} day${days > 1 ? "s" : ""} apart` : "Taken the same day"}
        {ka != null && kb != null && `, ${kb - ka > 0 ? "+" : kb - ka < 0 ? "-" : ""}${units.fmt(Math.abs(kb - ka))}`}
      </p>
    </>
  );
}

/** Pick any two photos from any cycle to compare. */
function CompareSheet({ all, start, weights, onClose }: { all: MediaItem[]; start: [MediaItem, MediaItem] | null; weights: WeightRow[]; onClose: () => void }) {
  // Keyed by `start` in the parent, so a new comparison starts fresh.
  const [pick, setPick] = useState<[MediaItem, MediaItem] | null>(start);
  return (
    <Sheet open={!!start} onClose={onClose} label="Compare progress photos" wide>
      {pick && (
        <>
          <h3>Compare photos</h3>
          <PhotoPair a={pick[0]} b={pick[1]} weights={weights} />
          {([0, 1] as const).map((side) => (
            <div key={side} className="ph-pick" role="group" aria-label={side ? "Latest photo" : "First photo"}>
              <span>{side ? "Latest" : "First"}</span>
              <div>
                {all.map((m) => (
                  <button key={m.path} type="button" className={pick[side].path === m.path ? "on" : ""} aria-pressed={pick[side].path === m.path} aria-label={photoName(m)}
                    onClick={() => setPick((p) => (p ? (side ? [p[0], m] : [m, p[1]]) : p))}>
                    <MediaView m={m} /><i>C{m.cycle} {m.label.replace("Week ", "W")}</i>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

function Photos({ plan, today, weights }: { plan: ActivePlanDto; today: string; weights: WeightRow[] }) {
  const toast = useToast();
  const cQ = useQuery<{ myCycles: CycleSpanDto[] }>(MY_CYCLES, { fetchPolicy: "cache-and-network" });
  const cycles = useMemo(
    () => cQ.data?.myCycles ?? [{ cycleNumber: plan.cycleNumber, startDate: plan.startDate, endDate: plan.endDate, active: true }],
    [cQ.data, plan.cycleNumber, plan.startDate, plan.endDate],
  );
  const cyclesReady = !!cQ.data || !!cQ.error;
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<MediaLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<MediaLabel>("Day 1");
  const [confirming, setConfirming] = useState<MediaLabel | null>(null);
  const [comparing, setComparing] = useState<[MediaItem, MediaItem] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => releaseMedia(media), [media]);
  const loadFailed = () => setError("Couldn't load your photos. Check your connection and reopen Progress.");
  const [sync] = useMutation(SYNC_PROGRESS_PHOTOS);
  // Each load also tells the API which of this cycle's slots are filled, so photo reminders skip them.
  const load = () => listMedia(cycles).then((items) => {
    setMedia(items);
    const mine = items.filter((m) => m.cycle === plan.cycleNumber);
    sync({ variables: { photos: mine.map((m) => ({ slot: m.label, savedAt: new Date(m.savedAt).toISOString() })) } }).catch(() => {});
  }, loadFailed);
  const cycleKey = cycles.map((c) => `${c.cycleNumber}:${c.startDate}`).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (cyclesReady) void load().finally(() => setLoading(false)); }, [cyclesReady, cycleKey]);
  const refresh = load;
  const current = media.filter((m) => m.cycle === plan.cycleNumber);
  const all = [...media].sort(byTime);
  const past = cycles.filter((c) => c.cycleNumber < plan.cycleNumber && media.some((m) => m.cycle === c.cycleNumber)).reverse();
  const onFile = async (f: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!f) return;
    const res = await checkMediaFile(f);
    if ("error" in res) { setError(res.error); return; }
    setError(null);
    setUploading(slot);
    try { await saveMedia(plan.cycleNumber, slot, res.kind, f, current.find((m) => m.label === slot)); } catch (err) { setError(mediaErrorMessage(err)); setUploading(null); return; }
    await refresh();
    setUploading(null);
    toast(`${slot} ${res.kind === "video" ? "video" : "photo"} saved.`);
  };
  // Two taps: the first arms the button, so a stray tap can't delete a photo.
  const remove = async (m: MediaItem) => {
    if (confirming !== m.label) { setConfirming(m.label); return; }
    setConfirming(null);
    try { await deleteMedia(m); } catch (err) { setError(mediaErrorMessage(err)); return; }
    await refresh();
    toast(`${m.label} ${m.kind === "video" ? "video" : "photo"} deleted.`);
  };
  return (
    <>
      {plan.cycleNumber > 1 && <p className="ph-h">Cycle {plan.cycleNumber}</p>}
      <div className="photos">
        {MEDIA_SLOTS.map(({ label, dayOffset }) => {
          const m = current.find((x) => x.label === label);
          const unlock = addDaysIso(plan.startDate, dayOffset);
          const open = unlock <= today;
          const pick = () => { if (uploading) return; setSlot(label); input.current?.click(); };
          if (uploading === label || (loading && open)) {
            return <div key={label} className="ph open" aria-busy="true"><span className="pulse-mark" aria-hidden="true"><Activity /></span><b>{label}</b>{uploading === label ? "Uploading…" : <span className="sr-only">Loading</span>}</div>;
          }
          if (m) {
            return (
              <div key={label} className="ph filled open">
                <MediaView m={m} />
                <button type="button" className="ph-hit" aria-label={`Replace ${label} ${m.kind}`} onClick={pick} />
                <span className="lbl">{label}</span>
                <button type="button" className={`ph-del${confirming === label ? " armed" : ""}`} aria-label={confirming === label ? `Tap again to delete ${label} ${m.kind}` : `Delete ${label} ${m.kind}`}
                  onClick={() => void remove(m)} onBlur={() => setConfirming((c) => (c === label ? null : c))}>
                  <Trash2 />{confirming === label && <span>Delete?</span>}
                </button>
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

      {!loading && all.length >= 2 && (
        <div className="ph-progress">
          <p className="ph-h">Your progress so far</p>
          <PhotoPair a={all[0]} b={all[all.length - 1]} weights={weights} />
          <button type="button" className="ghost" onClick={() => setComparing([all[0], all[all.length - 1]])}><Columns2 />Compare other photos</button>
        </div>
      )}

      {!loading && past.map((c) => (
        <div key={c.cycleNumber} className="ph-cycle">
          <p className="ph-h">Cycle {c.cycleNumber}<span>{dayShort(c.startDate)} – {dayShort(c.endDate)}</span></p>
          <div className="photos">
            {MEDIA_SLOTS.map(({ label }) => {
              const m = media.find((x) => x.cycle === c.cycleNumber && x.label === label);
              return m ? (
                <button key={label} type="button" className="ph filled open" aria-label={`Compare ${photoName(m)}`}
                  onClick={() => setComparing([m, all[all.length - 1] === m ? all[0] : all[all.length - 1]])}>
                  <MediaView m={m} /><span className="lbl">{label}</span>
                </button>
              ) : <div key={label} className="ph past"><b>{label}</b>No photo</div>;
            })}
          </div>
        </div>
      ))}

      <p className="help" style={{ marginTop: 10 }}>Photos up to 10 MB. Videos up to 30 seconds and 50 MB. Every cycle's photos are kept. {mediaInCloud() ? "Saved to your account, so they show on any device you sign in on." : "Kept on this device (dev mode)."}</p>
      <CompareSheet key={comparing?.map((m) => m.path).join() ?? ""} all={all} start={comparing} weights={weights} onClose={() => setComparing(null)} />
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
            <Photos plan={plan} today={today} weights={sorted} />
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
            {checkinIsOpen(plan, today) && <Link className="cta" style={{ minWidth: 0 }} to="/checkin">Start my check-in<ArrowRight /></Link>}
          </section>
        </div>
      </div>
    </div>
  );
}

const Row = ({ w, children }: { w: number; children: React.ReactNode }) => <><span>W{w + 1}</span>{children}</>;
