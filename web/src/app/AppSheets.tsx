import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import {
  Activity, ArrowLeftRight, Bell, BellOff, Bike, CalendarDays, CalendarX, Camera, Check, CircleAlert, Dumbbell, Flame, Footprints, HeartPulse, LogOut, Minus, Mountain, Music, Pencil, PersonStanding,
  Play, Plus, Repeat, Scale, Ship, SlidersHorizontal, Smartphone, Target, Trophy, Undo2, Utensils, Waves, type LucideIcon,
} from "lucide-react";
import {
  ACTIVITY_TYPES, CARDIO_LIKE_TO_TYPE, MAX_WEEKLY_SWAPS, ROUTINES, WARMUPS, estimateActivityKcal, swapIssue, weekTypes, weekdayOf, type Effort,
} from "@engine";
import { useAuth } from "../auth/AuthContext";
import {
  LOG_ACTIVITY, LOG_WEIGHT, MY_PLAN, WEIGHT_HISTORY, RESET_WEEK_SCHEDULE, SESSIONS_BETWEEN, REMINDER_PREFS, SEND_TEST_PUSH, SET_REMINDER, SET_REMINDER_PREFS, SET_START_DATE, SET_TRAINING_DAYS,
  SWAP_SESSION_DAYS, UPDATE_UNITS,
} from "../graphql/operations";
import type { PlannedSessionDto, SessionSummaryDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { DaysControl, ExerciseList, useGuide } from "../components/plan/PlanBits";
import { ChipGroup, OptionList, toggleIn } from "../components/ui/Options";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { DAYS_LONG, dayLabel, dayShort, localToday } from "../lib/dates";
import { useInstall } from "../lib/pwa";
import { disablePushHere, enablePush, pushStatus, type PushStatus } from "../lib/push";
import { ShareCard } from "./clubs/ShareCard";
import { SwapPicker } from "./ExerciseSwap";
import { useResetSwap } from "./swapHooks";
import { ChallengeProof } from "./clubs/ChallengeProof";
import { useMyChallenges } from "./clubs/challengeHooks";
import { challengeRule } from "../lib/clubFormat";
import { REFETCH_LOGS, readFlags, sessionOn, sessionsByDate, swapsFor, weekDates, writeFlags } from "./planUtil";

export const ACT_ICON: Record<string, LucideIcon> = {
  WALK: Footprints, RUN: Activity, CYCLE: Bike, SWIM: Waves, HIKE: Mountain, ROW: Ship, SKIP: Repeat, FOOTBALL: Trophy, BASKETBALL: Trophy,
  DANCE: Music, WARMUP: Flame, MOBILITY: PersonStanding, ABS: Target,
};
export const ACT_TILES: [string, LucideIcon, string, string][] = [
  ["CARDIO", HeartPulse, "Cardio", "Run, walk, cycle, swim"], ["SPORT", Trophy, "Sport", "Football, basketball, dance"],
  ["WARMUP", Flame, "Warm-up", "5 minutes"], ["MOBILITY", PersonStanding, "Mobility", "10 minute routine"], ["ABS", Target, "Abs finisher", "8 minutes"],
];

type Open =
  | { t: "activity"; kind: string; date: string; preset?: string; challengeId?: string }
  | { t: "weigh" } | { t: "reminder" } | { t: "audit" } | { t: "profile" } | { t: "swap" }
  | { t: "preview"; session: PlannedSessionDto; date: string };

interface SheetsApi {
  /** preset: an activity type to start on, e.g. "RUN" from a club routine. challengeId: log it for this club challenge. */
  activity: (kind?: string, date?: string, preset?: string, challengeId?: string) => void;
  weighIn: () => void;
  reminder: () => void;
  audit: () => void;
  profile: () => void;
  preview: (session: PlannedSessionDto, date: string) => void;
  swapDays: () => void;
  guide: (name: string, pattern: string | null) => void;
  /** Bumped when a local-only flag changes so pages re-read it. */
  flagsVersion: number;
}
const Ctx = createContext<SheetsApi | null>(null);
export const useSheets = () => { const c = useContext(Ctx); if (!c) throw new Error("useSheets outside AppSheets"); return c; };

export function AppSheets({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [flagsVersion, setFlagsVersion] = useState(0);
  const guide = useGuide();
  const swapTo = (o: Open) => { if (open) { setOpen(null); window.setTimeout(() => setOpen(o), 220); } else setOpen(o); };
  const api = useMemo<SheetsApi>(() => ({
    activity: (kind = "", date = localToday(), preset, challengeId) => swapTo({ t: "activity", kind, date, preset, challengeId }),
    weighIn: () => swapTo({ t: "weigh" }),
    reminder: () => swapTo({ t: "reminder" }),
    audit: () => swapTo({ t: "audit" }),
    profile: () => swapTo({ t: "profile" }),
    preview: (session, date) => swapTo({ t: "preview", session, date }),
    swapDays: () => swapTo({ t: "swap" }),
    guide: guide.open,
    flagsVersion,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [open, flagsVersion]);
  const close = () => setOpen(null);
  const bump = () => setFlagsVersion((v) => v + 1);
  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={open?.t === "activity"} onClose={close} label="Add an activity">
        {open?.t === "activity" && <ActivitySheet kind={open.kind} date={open.date} preset={open.preset} challengeId={open.challengeId} onPick={(k) => swapTo({ t: "activity", kind: k, date: open.date })} onDone={close} />}
      </Sheet>
      <Sheet open={open?.t === "weigh"} onClose={close} label="Log your weigh-in">{open?.t === "weigh" && <WeighInSheet onDone={close} />}</Sheet>
      <Sheet open={open?.t === "reminder"} onClose={close} label="Reminders">{open?.t === "reminder" && <ReminderSheet onDone={close} />}</Sheet>
      <Sheet open={open?.t === "audit"} onClose={close} label="Meal audit">{open?.t === "audit" && <AuditSheet onDone={() => { bump(); close(); }} />}</Sheet>
      <Sheet open={open?.t === "profile"} onClose={close} label="Profile and settings">
        {open?.t === "profile" && <ProfileSheet onReminder={() => swapTo({ t: "reminder" })} onWeigh={() => swapTo({ t: "weigh" })} onDone={close} />}
      </Sheet>
      <Sheet open={open?.t === "preview"} onClose={close} label="Session preview">
        {open?.t === "preview" && <PreviewSheet session={open.session} date={open.date} onGuide={guide.open} onDone={close} onSeen={bump} />}
      </Sheet>
      <Sheet open={open?.t === "swap"} onClose={close} label="Swap training days">{open?.t === "swap" && <SwapSheet onDone={close} />}</Sheet>
      {guide.element}
    </Ctx.Provider>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────

function ActivitySheet({ kind, date, preset, challengeId, onPick, onDone }: { kind: string; date: string; preset?: string; challengeId?: string; onPick: (k: string) => void; onDone: () => void }) {
  if (!kind) {
    return (
      <>
        <p className="sh-k">{dayLabel(date)}</p>
        <h3>Add an activity</h3>
        <p>Everything you do counts toward your week.</p>
        <div className="acts">
          {ACT_TILES.map(([k, Icon, t, s]) => (
            <button key={k} type="button" className="act-tile" onClick={() => onPick(k)}><span className="ic"><Icon /></span><span>{t}<br /><small>{s}</small></span></button>
          ))}
        </div>
      </>
    );
  }
  if (kind === "WARMUP" || kind === "MOBILITY" || kind === "ABS") return <RoutineSheet kind={kind} date={date} onDone={onDone} />;
  return <CardioSheet kind={kind as "CARDIO" | "SPORT"} date={date} preset={preset} challengeId={challengeId} onDone={onDone} />;
}

function RoutineSheet({ kind, date, onDone }: { kind: "WARMUP" | "MOBILITY" | "ABS"; date: string; onDone: () => void }) {
  const toast = useToast();
  const r = kind === "WARMUP" ? { title: "Warm-up", minutes: 5, items: WARMUPS.full } : ROUTINES[kind];
  const [log, { loading }] = useMutation(LOG_ACTIVITY, { refetchQueries: REFETCH_LOGS });
  const save = async () => {
    try {
      await log({ variables: { input: { performedOn: date, activityType: kind, durationMinutes: r.minutes } } });
      toast(`${r.title} logged.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  return (
    <>
      <p className="sh-k">{r.minutes} minutes</p>
      <h3>{r.title}</h3>
      <div className="routine">{r.items.map((x) => <div key={x.name}><span>{x.name}</span><span>{x.dose}</span></div>)}</div>
      <button type="button" className="cta" disabled={loading} onClick={() => void save()}>Log as done<Check /></button>
    </>
  );
}

function CardioSheet({ kind, date, preset, challengeId, onDone }: { kind: "CARDIO" | "SPORT"; date: string; preset?: string; challengeId?: string; onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const units = useUnits();
  const weightKg = plan?.profile.startWeightKg ?? 75;
  const keys = Object.keys(ACTIVITY_TYPES).filter((k) => ACTIVITY_TYPES[k].kind === kind);
  const liked = (plan?.profile.cardioLikes ?? []).map((c) => CARDIO_LIKE_TO_TYPE[c]).filter((k) => k && keys.includes(k));
  const [type, setType] = useState(preset && keys.includes(preset) ? preset : liked[0] ?? keys[0]);
  const [minutes, setMinutes] = useState(kind === "SPORT" ? "60" : "30");
  const [km, setKm] = useState("");
  const [kcal, setKcal] = useState("");
  const [hr, setHr] = useState("");
  const [effort, setEffort] = useState<Effort>("MODERATE");
  // Walks and runs: outdoor or on a treadmill, with an optional incline (README "Treadmill runs and walks").
  const [treadmill, setTreadmill] = useState(false);
  const [incline, setIncline] = useState("");
  const [log, { loading }] = useMutation<{ logActivity: { id: string } }>(LOG_ACTIVITY, { refetchQueries: REFETCH_LOGS });
  const { me } = usePlan();
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  // Activity challenges you've taken on that this log could count for.
  const challenges = useMyChallenges(date).filter((m) => m.challenge.kind === "ACTIVITY" && !m.doneForPeriod && !m.completed && keys.includes(m.challenge.activityType ?? ""));
  const [forId, setForId] = useState<string | null>(challengeId ?? null);
  const forChallenge = challenges.find((m) => m.challenge.id === forId)?.challenge ?? null;
  // Kept once saved: sending proof refetches the list, which then leaves this challenge out.
  const [savedFor, setSavedFor] = useState<typeof forChallenge>(null);
  const meta = ACTIVITY_TYPES[type];
  const canTread = type === "WALK" || type === "RUN";
  const onTread = canTread && treadmill;
  const inclinePct = onTread && incline !== "" && Number(incline) >= 0 ? Math.min(15, Number(incline)) : null;
  const est = estimateActivityKcal(type, Number(minutes) || 0, weightKg, effort, onTread ? { inclinePct, distanceKm: Number(km) > 0 ? Number(km) : null } : null);
  const save = async () => {
    const m = Math.round(Number(minutes));
    if (!m || m < 1) { toast("Add how many minutes it took."); return; }
    try {
      const res = await log({ variables: { input: {
        performedOn: date, activityType: type, durationMinutes: m, effort,
        distanceKm: meta.distance && Number(km) > 0 ? Number(km) : null,
        kcal: Number(kcal) > 0 ? Math.round(Number(kcal)) : null,
        avgHeartRate: Number(hr) > 0 ? Math.round(Number(hr)) : null,
        ...(onTread ? { setting: "TREADMILL", inclinePct } : {}),
      } } });
      const text = `${onTread ? `Treadmill ${meta.label.toLowerCase()}` : meta.label} logged: ${m} min, ${(Number(kcal) || est).toLocaleString("en-GB")} kcal.`;
      const id = res.data?.logActivity.id;
      // Club members get the challenge proof or share prompt here; everyone else is done.
      if (id && me?.showClubs) { setSavedFor(forChallenge); setSaved({ id, text }); }
      else { toast(text); onDone(); }
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  if (saved && savedFor) {
    return <ChallengeProof challenge={savedFor} date={date} activityId={saved.id} onDone={onDone} />;
  }
  if (saved) {
    return (
      <>
        <div className="burst"><Check /></div>
        <h3 style={{ marginTop: 16 }}>{saved.text}</h3>
        <ShareCard link={{ activityId: saved.id }} />
        <button type="button" className="cta" style={{ marginTop: 16 }} onClick={onDone}>Done</button>
      </>
    );
  }
  return (
    <>
      <p className="sh-k">{dayLabel(date)}</p>
      <h3>Log {kind === "SPORT" ? "a sport" : "cardio"}</h3>
      {challenges.length > 0 && (
        <div className="ch-for">
          <p className="rt-label" style={{ marginTop: 6 }}><Trophy />Log for this challenge?</p>
          <ChipGroup label="Club challenge" selected={[forId ?? ""]}
            onPick={(v) => { setForId(v || null); const c = challenges.find((m) => m.challenge.id === v)?.challenge; if (c?.activityType) setType(c.activityType); }}
            options={[...challenges.map((m) => ({ value: m.challenge.id, label: `${m.challenge.title}` })), { value: "", label: "No" }]} />
          {forChallenge && <p className="help">{challengeRule(forChallenge, units.unit === "lb")}. You'll add a photo or video as proof next.</p>}
        </div>
      )}
      <div style={{ margin: "12px 0 18px" }}>
        <ChipGroup options={keys.map((k) => ({ value: k, label: ACTIVITY_TYPES[k].label, icon: ACT_ICON[k] }))} selected={[type]} onPick={(k) => { setType(k); if (forChallenge && forChallenge.activityType !== k) setForId(null); }} label="Activity" />
      </div>
      {canTread && (
        <div className="tread-row">
          <span className="tl">Where</span>
          <span className="seg">
            {([false, true] as const).map((t) => (
              <button key={String(t)} type="button" className={treadmill === t ? "on" : ""} aria-pressed={treadmill === t} onClick={() => setTreadmill(t)}>{t ? "Treadmill" : "Outdoor"}</button>
            ))}
          </span>
        </div>
      )}
      <div className="row2">
        {onTread && <div className="field"><label htmlFor="c-inc">Incline (%) <span className="opt-l">Optional</span></label><input className="txt" id="c-inc" type="number" inputMode="decimal" min={0} max={15} step={0.5} placeholder="e.g. 2" value={incline} onChange={(e) => setIncline(e.target.value)} /></div>}
        <div className="field"><label htmlFor="c-min">Duration (minutes)</label><input className="txt" id="c-min" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
        {meta.distance && <div className="field"><label htmlFor="c-km">Distance (km) <span className="opt-l">Optional</span></label><input className="txt" id="c-km" type="number" inputMode="decimal" min={0} step={0.1} placeholder="e.g. 5.2" value={km} onChange={(e) => setKm(e.target.value)} /></div>}
        <div className="field"><label htmlFor="c-kcal">Calories <span className="opt-l">From your watch, optional</span></label><input className="txt" id="c-kcal" type="number" inputMode="numeric" min={0} placeholder={`About ${est}`} value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
        <div className="field"><label htmlFor="c-hr">Average heart rate <span className="opt-l">Optional</span></label><input className="txt" id="c-hr" type="number" inputMode="numeric" min={40} max={220} placeholder="bpm" value={hr} onChange={(e) => setHr(e.target.value)} /></div>
      </div>
      <p style={{ fontWeight: 600, margin: "18px 0 8px" }}>How hard was it?</p>
      <ChipGroup options={[{ value: "EASY", label: "Easy" }, { value: "MODERATE", label: "Moderate" }, { value: "HARD", label: "Hard" }]} selected={[effort]} onPick={(v) => setEffort(v as Effort)} label="Effort" />
      <div className="est"><Flame /><span>Estimated burn: <b>{est.toLocaleString("en-GB")} kcal</b>, from your weight, time and {onTread ? "incline" : "effort"}. Your watch's number wins if you add it.</span></div>
      <button type="button" className="cta" disabled={loading} onClick={() => void save()}>Save activity<Check /></button>
    </>
  );
}

// ── Weigh-in, reminder, audit ───────────────────────────────────────────

function WeighInSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const units = useUnits();
  // Starts from the last weigh-in, so most mornings it's a nudge or two (README "Weigh-ins that are easy to find").
  const lastQ = useQuery<{ weightHistory: { weightKg: number }[] }>(WEIGHT_HISTORY, { variables: { limit: 1 }, fetchPolicy: "cache-and-network" });
  const lastKg = lastQ.data?.weightHistory[0]?.weightKg;
  const [kg, setKg] = useState<number | null>(null);
  const value = kg ?? lastKg ?? plan?.profile.startWeightKg ?? 75;
  const [log, { loading }] = useMutation(LOG_WEIGHT, { refetchQueries: [...REFETCH_LOGS, { query: WEIGHT_HISTORY, variables: { limit: 1 } }, { query: WEIGHT_HISTORY, variables: { limit: 30 } }] });
  const step = units.unit === "kg" ? 0.1 : 0.5 / 2.20462;
  const save = async () => {
    try {
      await log({ variables: { input: { weightKg: Math.round(value * 10) / 10 } } });
      toast(`Weigh-in saved: ${units.fmt(value)}.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  return (
    <>
      <p className="sh-k">{dayLabel(localToday())}</p>
      <h3>Log your weigh-in</h3>
      <p>Morning, after the bathroom, before food. Daily numbers bounce around, so we use your 7-day average.</p>
      <div className="readout" style={{ margin: "10px 0 6px" }}>
        <button className="stepbtn" type="button" aria-label="Decrease" onClick={() => setKg(Math.max(30, value - step))}><Minus /></button>
        <div className="big"><output className="mono">{units.unit === "kg" ? (Math.round(value * 10) / 10).toFixed(1) : units.toDisplay(value)}</output><span className="u">{units.unit}</span></div>
        <button className="stepbtn" type="button" aria-label="Increase" onClick={() => setKg(Math.min(300, value + step))}><Plus /></button>
      </div>
      {lastKg != null && kg === null && <p className="help" style={{ textAlign: "center" }}>Starting from your last weigh-in. Tap − or + to match the scale.</p>}
      <button type="button" className="cta" disabled={loading} onClick={() => void save()}>Save weigh-in<Check /></button>
    </>
  );
}

const TIMES = ["06:00", "07:00", "12:30", "17:30", "19:00"];
const PUSH_NOTE: Partial<Record<PushStatus, string>> = {
  "needs-install": "On iPhone, reminders only work from the home screen. In Safari, tap Share, then Add to Home Screen. Open TrackFit from there and set your reminder again.",
  "in-app": "This in-app browser can't show notifications. Open TrackFit in Chrome or Safari to get reminders.",
  unsupported: "This browser can't show notifications. Try Chrome, or Safari on iPhone.",
  denied: "Notifications are blocked for TrackFit. Allow them in your browser's site settings, then come back here.",
  "server-off": "Notifications aren't switched on for TrackFit yet. Your time is saved and reminders will start once they are.",
};

type PrefKey = "weighIn" | "progressPhotos" | "missedSession" | "clubChallenges";
type Prefs = Record<PrefKey, boolean> & { weighInTime: string };
const WEIGH_TIMES = ["06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];
const PREF_OPTIONS: { value: PrefKey; label: string; desc: string; icon: LucideIcon }[] = [
  { value: "weighIn", label: "Daily weigh-in", desc: "Every morning, skipped once you've weighed in", icon: Scale },
  { value: "progressPhotos", label: "Progress photos", desc: "With your weigh-in when your Week 3 and Week 6 slots open", icon: Camera },
  { value: "missedSession", label: "Missed sessions", desc: "8 am the day after, a gentle nudge", icon: CalendarX },
  { value: "clubChallenges", label: "New club challenges", desc: "When a coach in your club sets one", icon: Trophy },
];

function ReminderSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const client = useApolloClient();
  const { plan } = usePlan();
  const [time, setTime] = useState(plan?.profile.reminderTime ?? "");
  const [push, setPush] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [save] = useMutation(SET_REMINDER, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  const [sendTest, test] = useMutation<{ sendTestPush: number }>(SEND_TEST_PUSH);
  const prefsQ = useQuery<{ reminderPrefs: Prefs }>(REMINDER_PREFS);
  const [savePrefs] = useMutation(SET_REMINDER_PREFS, { refetchQueries: [{ query: REMINDER_PREFS }] });
  const [picked, setPicked] = useState<PrefKey[] | null>(null);
  const saved = prefsQ.data?.reminderPrefs;
  const [weighTime, setWeighTime] = useState<string | null>(null);
  const weighAt = weighTime ?? saved?.weighInTime ?? "07:30";
  const { me } = usePlan();
  const options = PREF_OPTIONS.filter((o) => o.value !== "clubChallenges" || me?.showClubs);
  const extras = picked ?? (saved ? options.map((o) => o.value).filter((k) => saved[k]) : []);
  useEffect(() => { pushStatus(client).then(setPush, () => setPush("unsupported")); }, [client]);
  const before = plan ? localToday() < plan.startDate : false;
  const turnOn = (!!time || extras.length > 0) && push === "off";
  return (
    <>
      <p className="sh-k">Reminders</p>
      <h3>When should we nudge you to train?</h3>
      <p>We'll send a notification on training days only.</p>
      <ChipGroup options={[...TIMES.map((t) => ({ value: t, label: t })), { value: "", label: "Off" }]} selected={[time]} onPick={setTime} label="Reminder time" />
      <div className="field" style={{ marginTop: 14, maxWidth: 200 }}>
        <label htmlFor="r-time">Or pick a time</label>
        <input className="txt" type="time" id="r-time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {before && <p className="help" style={{ marginTop: 14 }}>We'll also remind you at 7 pm the evening before your first session.</p>}
      <p className="sh-k" style={{ marginTop: 22 }}>Also remind me about</p>
      <OptionList multi label="Other reminders" options={options} selected={extras} onPick={(v) => setPicked(toggleIn(extras, v))} />
      {extras.includes("weighIn") && (
        <>
          <p style={{ fontWeight: 600, margin: "16px 0 8px" }}>Weigh-in reminder time</p>
          <ChipGroup options={[...new Set([...WEIGH_TIMES, weighAt])].sort().map((t) => ({ value: t, label: t }))} selected={[weighAt]} onPick={setWeighTime} label="Weigh-in reminder time" />
        </>
      )}
      {push && PUSH_NOTE[push] && <div className="note" role="note"><BellOff /><span>{PUSH_NOTE[push]}</span></div>}
      {push === "on" && (
        <div className="note" role="note">
          <Bell /><span>Notifications are on for this device. <button type="button" className="linkbtn" disabled={test.loading} onClick={async () => {
            try {
              const r = await sendTest();
              toast(r.data?.sendTestPush ? "Test sent. It should arrive in a few seconds." : "Couldn't reach this device. Turn notifications off and on in your browser, then try again.");
            } catch { toast("Couldn't send a test. Try again."); }
          }}>Send a test</button></span>
        </div>
      )}
      <button type="button" className="cta" style={{ marginTop: 18 }} disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          // Ask first: Safari only shows the permission prompt straight from a tap.
          const status = turnOn ? await enablePush(client) : push;
          if (status) setPush(status);
          await save({ variables: { time: time || null } });
          if (picked || weighTime) {
            const on = picked ?? extras;
            await savePrefs({ variables: { input: { ...Object.fromEntries(options.map((o) => [o.value, on.includes(o.value)])), ...(weighTime ? { weighInTime: weighTime } : {}) } } });
          }
          if (!time && !extras.length) toast("Reminders are off.");
          else if (!time && status === "on") toast("Workout reminder is off. Your other reminders are on.");
          else if (status === "on") toast(`Reminders saved. Workouts at ${time} on training days.`);
          else { toast("Saved. Notifications still need turning on for this device."); setBusy(false); return; }
          onDone();
        } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
        setBusy(false);
      }}>{turnOn ? "Save and allow notifications" : "Save reminders"}</button>
    </>
  );
}

function AuditSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const [pick, setPick] = useState("");
  const [size, setSize] = useState("");
  const foods = ["Jollof", "Waakye", "Banku and tilapia", "Kenkey and fish", "Fufu and soup", "Red red", "Rice and stew", "Something else"];
  return (
    <>
      <p className="sh-k">Meal audit, 2 minutes</p>
      <h3>What does a normal lunch look like?</h3>
      <p>No judgement and no numbers. We compare this with your plan so the first changes are small ones.</p>
      <ChipGroup options={foods.map((f) => ({ value: f, label: f }))} selected={[pick]} onPick={setPick} label="Usual lunch" />
      <p style={{ fontWeight: 600, margin: "20px 0 8px" }}>How big is the plate?</p>
      <ChipGroup options={[{ value: "small", label: "Small" }, { value: "normal", label: "Normal" }, { value: "big", label: "Big, plus seconds" }]} selected={[size]} onPick={setSize} label="Plate size" />
      <button type="button" className="cta" disabled={!pick || !size} onClick={() => {
        if (plan) writeFlags(plan.programId, { audit: { pick, size } });
        toast(size === "big" ? "Thanks. Your first goal: one plate, no seconds, at lunch." : "Thanks. Your lunches are already close to plan.");
        onDone();
      }}>Finish audit</button>
    </>
  );
}

// ── Swap training days ──────────────────────────────────────────────────

function SwapSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const plan = usePlan().plan!;
  const today = localToday();
  const week = weekDates(today);
  const sessQ = useQuery<{ workoutSessionsBetween: SessionSummaryDto[] }>(SESSIONS_BETWEEN, { variables: { from: week[0], to: week[6] }, fetchPolicy: "cache-and-network" });
  const done = sessionsByDate(sessQ.data?.workoutSessionsBetween);
  const opts = { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true };
  const [swap, swapping] = useMutation(SWAP_SESSION_DAYS, opts);
  const [reset, resetting] = useMutation(RESET_WEEK_SCHEDULE, opts);
  const [picked, setPicked] = useState<string[]>([]);
  const swaps = swapsFor(plan, today);
  const left = MAX_WEEKLY_SWAPS - swaps.length;
  const locked = (date: string) =>
    date < today ? "Already passed" : done.has(date) ? "Logged" : date < plan.startDate || date > plan.endDate ? "Outside this cycle" : null;
  const name = (date: string) => sessionOn(plan, date)?.name ?? "";
  const [a, b] = [...picked].sort();
  const issue = left <= 0 ? `You've used your ${MAX_WEEKLY_SWAPS} swaps this week.` : b ? swapIssue(weekTypes(plan.sessions), swaps, weekdayOf(a), weekdayOf(b)) : null;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); onDone(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't change your week."); }
  };
  return (
    <>
      <p className="sh-k">This week only</p>
      <h3>Swap two training days</h3>
      <p>Your workouts stay the same, just on different days. Next week goes back to your plan.</p>
      <OptionList multi label="Training days" selected={picked} onPick={(v) => setPicked((p) => toggleIn(p, v, { max: 2 }))}
        options={week.filter((d) => sessionOn(plan, d)).map((d) => {
          const why = locked(d);
          return { value: d, label: dayShort(d), desc: why ? `${name(d)}. ${why}` : name(d), disabled: !!why || left <= 0 };
        })} />
      {issue ? <div className="err"><CircleAlert /><span>{issue}</span></div>
        : b && <p className="help" style={{ marginTop: 14 }}>{name(b)} moves to {DAYS_LONG[weekdayOf(a)]}, {name(a)} moves to {DAYS_LONG[weekdayOf(b)]}.</p>}
      <button type="button" className="cta" disabled={!b || !!issue || swapping.loading}
        onClick={() => void run(() => swap({ variables: { dateA: a, dateB: b } }), `Swapped. ${name(b)} is now on ${DAYS_LONG[weekdayOf(a)]}.`)}>
        Swap days<ArrowLeftRight />
      </button>
      <p className="fine" style={{ marginTop: 12 }}>{Math.max(0, left)} of {MAX_WEEKLY_SWAPS} swaps left this week. Rest days stay put, and days you've logged or that have passed can't move.</p>
      {swaps.length > 0 && (
        <div className="btnrow" style={{ marginTop: 14 }}>
          <button type="button" className="ghost" disabled={resetting.loading}
            onClick={() => void run(() => reset({ variables: { date: today } }), "This week is back to your plan.")}><Undo2 />Back to my plan</button>
        </div>
      )}
    </>
  );
}

// ── Preview and profile ─────────────────────────────────────────────────

function PreviewSheet({ session, date, onGuide, onDone, onSeen }: {
  session: PlannedSessionDto; date: string; onGuide: (n: string, p: string | null) => void; onDone: () => void; onSeen: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { plan } = usePlan();
  const today = localToday();
  const [setStart] = useMutation(SET_START_DATE, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  const [swapFor, setSwapFor] = useState<{ exerciseId: string; name: string } | null>(null);
  const resetSwap = useResetSwap();
  // The plan refreshes after a swap; show this session from it.
  const live = plan?.sessions.find((s) => s.templateId && s.templateId === session.templateId) ?? session;
  if (plan && !readFlags(plan.programId).previewed) { writeFlags(plan.programId, { previewed: true }); queueMicrotask(onSeen); }
  const start = async () => {
    if (plan && today < plan.startDate) {
      try { await setStart({ variables: { date: today } }); toast("Starting early. Your plan now begins today."); }
      catch (e) { toast(e instanceof Error ? e.message : "Couldn't move your start date."); return; }
    }
    onDone();
    navigate(`/session/${session.templateId ?? "x"}?date=${today}`);
  };
  if (swapFor && session.templateId) {
    return <SwapPicker templateId={session.templateId} exercise={swapFor} onDone={() => setSwapFor(null)} onBack={() => setSwapFor(null)} />;
  }
  return (
    <>
      <p className="sh-k">{dayLabel(date)}</p>
      <h3>{session.name}</h3>
      <p>{session.warmup.length ? "5 min warm-up, then " : ""}{session.exercises.length} exercises. About {plan?.profile.sessionMinutes ?? 45} minutes. Tap a picture to see how it's done.</p>
      <div className="exlist" style={{ display: "block" }}>
        <ExerciseList warmup={live.warmup} exercises={live.exercises} onGuide={onGuide}
          onSwap={session.templateId ? (e) => setSwapFor({ exerciseId: e.exerciseId!, name: e.name }) : undefined}
          onReset={session.templateId ? (e) => void resetSwap.reset(session.templateId!, e.exerciseId!, e.swappedFrom!.name) : undefined} />
      </div>
      <button type="button" className="cta" onClick={() => void start()}>{date === today ? "Start workout" : "Start it today instead"}<Play /></button>
    </>
  );
}

function InstallRow() {
  const toast = useToast();
  const state = useInstall();
  if (state.kind === "installed" || state.kind === "unsupported") return null;
  const d = {
    prompt: "Opens from your home screen like any other app",
    ios: "In Safari, tap Share, then Add to Home Screen",
    "in-app": state.kind === "in-app" ? `${state.app}'s browser can't install apps. Open this page in Chrome or Safari first.` : "",
  }[state.kind];
  return (
    <div className="li">
      <span className="ic"><Smartphone /></span>
      <span><span className="t">Add TrackFit to your home screen</span><span className="d" style={{ display: "block" }}>{d}</span></span>
      {state.kind === "prompt" ? <button type="button" className="linkbtn" onClick={async () => { if (await state.install()) toast("TrackFit is on your home screen."); }}>Install</button> : <span />}
    </div>
  );
}

function ProfileSheet({ onReminder, onWeigh, onDone }: { onReminder: () => void; onWeigh: () => void; onDone: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { signOut, firebaseUser } = useAuth();
  const client = useApolloClient();
  const { plan, me } = usePlan();
  const opts = { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true };
  const [setDays, days] = useMutation(SET_TRAINING_DAYS, opts);
  const [setUnits] = useMutation(UPDATE_UNITS, opts);
  if (!plan || !me) return null;
  const provider = firebaseUser?.providerData[0]?.providerId === "google.com" ? "Google" : firebaseUser ? "email" : "dev mode";
  return (
    <>
      <p className="sh-k">Signed in with {provider}</p>
      <h3>{me.displayName || "Your profile"}</h3>
      {me.email && <p>{me.email}</p>}
      <div className="list">
        <div className="li"><span className="ic"><Scale /></span><span><span className="t">Weigh-in</span><span className="d" style={{ display: "block" }}>Every morning, before breakfast</span></span><button type="button" className="linkbtn" onClick={onWeigh}><Plus />Log weigh-in</button></div>
        <div className="li"><span className="ic"><CalendarDays /></span><span><span className="t">Plan start</span><span className="d" style={{ display: "block" }}>{dayLabel(plan.startDate)}</span></span><span /></div>
        <div className="li">
          <span className="ic"><Dumbbell /></span>
          <span><span className="t">Training days</span><span className="d" style={{ display: "block" }}>{plan.dayRange.min} to {plan.dayRange.max} allowed, based on your answers</span></span>
          <DaysControl value={plan.daysPerWeek} min={plan.dayRange.min} max={plan.dayRange.max} busy={days.loading} onChange={async (n) => {
            try { await setDays({ variables: { days: n } }); toast(`Your week is now ${n} days.`); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't change that."); }
          }} />
        </div>
        <div className="li">
          <span className="ic"><Scale /></span><span className="t">Units</span>
          <span className="seg">
            {(["METRIC", "IMPERIAL"] as const).map((u) => (
              <button key={u} type="button" className={me.units === u ? "on" : ""} aria-pressed={me.units === u} onClick={() => void setUnits({ variables: { units: u } })}>{u === "METRIC" ? "kg" : "lb"}</button>
            ))}
          </span>
        </div>
        <div className="li"><span className="ic"><Bell /></span><span><span className="t">Reminders</span><span className="d" style={{ display: "block" }}>{plan.profile.reminderTime ? `Workouts at ${plan.profile.reminderTime} on training days` : "Workout reminder off"}</span></span><button type="button" className="linkbtn" onClick={onReminder}>Change</button></div>
        {plan.pendingSections.includes("FUEL") && (
          <div className="li"><span className="ic"><Utensils /></span><span><span className="t">Fuel</span><span className="d" style={{ display: "block" }}>Not set yet</span></span>
            <button type="button" className="linkbtn" onClick={() => { onDone(); navigate("/fuel"); }}>Answer</button></div>
        )}
        {plan.pendingSections.includes("TRAINING_DETAILS") && (
          <div className="li"><span className="ic"><SlidersHorizontal /></span><span><span className="t">Training details</span><span className="d" style={{ display: "block" }}>Not set yet: your plan uses sensible defaults</span></span>
            <button type="button" className="linkbtn" onClick={() => { onDone(); navigate("/fine-tune"); }}>Answer</button></div>
        )}
        <InstallRow />
      </div>
      <div className="btnrow" style={{ marginTop: 18 }}>
        <button type="button" className="ghost" onClick={() => { onDone(); navigate("/start/welcome?redo=1"); }}><Pencil />Change my answers</button>
        <button type="button" className="ghost" onClick={async () => { onDone(); await disablePushHere(client).catch(() => {}); await signOut(); await client.clearStore(); navigate("/signin", { replace: true }); }}><LogOut />Sign out</button>
      </div>
      <p className="fine" style={{ marginTop: 12 }}>Changing your answers builds a new 6-week plan. Your logged workouts, weigh-ins and activities stay.</p>
    </>
  );
}
