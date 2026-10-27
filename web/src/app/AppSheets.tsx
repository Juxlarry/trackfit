import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApolloClient, useMutation } from "@apollo/client/react";
import {
  Activity, Bell, Bike, CalendarDays, Check, Dumbbell, Flame, Footprints, HeartPulse, LogOut, Minus, Mountain, Music, Pencil, PersonStanding,
  Play, Plus, Repeat, Scale, Ship, Target, Trophy, Waves, type LucideIcon,
} from "lucide-react";
import { ACTIVITY_TYPES, CARDIO_LIKE_TO_TYPE, ROUTINES, WARMUPS, estimateActivityKcal, type Effort } from "@engine";
import { useAuth } from "../auth/AuthContext";
import { LOG_ACTIVITY, LOG_WEIGHT, MY_PLAN, SET_REMINDER, SET_START_DATE, SET_TRAINING_DAYS, UPDATE_UNITS } from "../graphql/operations";
import type { PlannedSessionDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { DaysControl, ExerciseList, useGuide } from "../components/plan/PlanBits";
import { ChipGroup } from "../components/ui/Options";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { dayLabel, localToday } from "../lib/dates";
import { REFETCH_LOGS, readFlags, writeFlags } from "./planUtil";

export const ACT_ICON: Record<string, LucideIcon> = {
  WALK: Footprints, RUN: Activity, CYCLE: Bike, SWIM: Waves, HIKE: Mountain, ROW: Ship, SKIP: Repeat, FOOTBALL: Trophy, BASKETBALL: Trophy,
  DANCE: Music, WARMUP: Flame, MOBILITY: PersonStanding, ABS: Target,
};
export const ACT_TILES: [string, LucideIcon, string, string][] = [
  ["CARDIO", HeartPulse, "Cardio", "Run, walk, cycle, swim"], ["SPORT", Trophy, "Sport", "Football, basketball, dance"],
  ["WARMUP", Flame, "Warm-up", "5 minutes"], ["MOBILITY", PersonStanding, "Mobility", "10 minute routine"], ["ABS", Target, "Abs finisher", "8 minutes"],
];

type Open =
  | { t: "activity"; kind: string; date: string }
  | { t: "weigh" } | { t: "reminder" } | { t: "audit" } | { t: "profile" }
  | { t: "preview"; session: PlannedSessionDto; date: string };

interface SheetsApi {
  activity: (kind?: string, date?: string) => void;
  weighIn: () => void;
  reminder: () => void;
  audit: () => void;
  profile: () => void;
  preview: (session: PlannedSessionDto, date: string) => void;
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
    activity: (kind = "", date = localToday()) => swapTo({ t: "activity", kind, date }),
    weighIn: () => swapTo({ t: "weigh" }),
    reminder: () => swapTo({ t: "reminder" }),
    audit: () => swapTo({ t: "audit" }),
    profile: () => swapTo({ t: "profile" }),
    preview: (session, date) => swapTo({ t: "preview", session, date }),
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
        {open?.t === "activity" && <ActivitySheet kind={open.kind} date={open.date} onPick={(k) => swapTo({ t: "activity", kind: k, date: open.date })} onDone={close} />}
      </Sheet>
      <Sheet open={open?.t === "weigh"} onClose={close} label="Log your weigh-in">{open?.t === "weigh" && <WeighInSheet onDone={close} />}</Sheet>
      <Sheet open={open?.t === "reminder"} onClose={close} label="Workout reminder">{open?.t === "reminder" && <ReminderSheet onDone={close} />}</Sheet>
      <Sheet open={open?.t === "audit"} onClose={close} label="Meal audit">{open?.t === "audit" && <AuditSheet onDone={() => { bump(); close(); }} />}</Sheet>
      <Sheet open={open?.t === "profile"} onClose={close} label="Profile and settings">
        {open?.t === "profile" && <ProfileSheet onReminder={() => swapTo({ t: "reminder" })} onDone={close} />}
      </Sheet>
      <Sheet open={open?.t === "preview"} onClose={close} label="Session preview">
        {open?.t === "preview" && <PreviewSheet session={open.session} date={open.date} onGuide={guide.open} onDone={close} onSeen={bump} />}
      </Sheet>
      {guide.element}
    </Ctx.Provider>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────

function ActivitySheet({ kind, date, onPick, onDone }: { kind: string; date: string; onPick: (k: string) => void; onDone: () => void }) {
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
  return <CardioSheet kind={kind as "CARDIO" | "SPORT"} date={date} onDone={onDone} />;
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

function CardioSheet({ kind, date, onDone }: { kind: "CARDIO" | "SPORT"; date: string; onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const weightKg = plan?.profile.startWeightKg ?? 75;
  const keys = Object.keys(ACTIVITY_TYPES).filter((k) => ACTIVITY_TYPES[k].kind === kind);
  const liked = (plan?.profile.cardioLikes ?? []).map((c) => CARDIO_LIKE_TO_TYPE[c]).filter((k) => k && keys.includes(k));
  const [type, setType] = useState(liked[0] ?? keys[0]);
  const [minutes, setMinutes] = useState(kind === "SPORT" ? "60" : "30");
  const [km, setKm] = useState("");
  const [kcal, setKcal] = useState("");
  const [hr, setHr] = useState("");
  const [effort, setEffort] = useState<Effort>("MODERATE");
  const [log, { loading }] = useMutation(LOG_ACTIVITY, { refetchQueries: REFETCH_LOGS });
  const meta = ACTIVITY_TYPES[type];
  const est = estimateActivityKcal(type, Number(minutes) || 0, weightKg, effort);
  const save = async () => {
    const m = Math.round(Number(minutes));
    if (!m || m < 1) { toast("Add how many minutes it took."); return; }
    try {
      await log({ variables: { input: {
        performedOn: date, activityType: type, durationMinutes: m, effort,
        distanceKm: meta.distance && Number(km) > 0 ? Number(km) : null,
        kcal: Number(kcal) > 0 ? Math.round(Number(kcal)) : null,
        avgHeartRate: Number(hr) > 0 ? Math.round(Number(hr)) : null,
      } } });
      toast(`${meta.label} logged: ${m} min, ${(Number(kcal) || est).toLocaleString("en-GB")} kcal.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  return (
    <>
      <p className="sh-k">{dayLabel(date)}</p>
      <h3>Log {kind === "SPORT" ? "a sport" : "cardio"}</h3>
      <div style={{ margin: "12px 0 18px" }}>
        <ChipGroup options={keys.map((k) => ({ value: k, label: ACTIVITY_TYPES[k].label, icon: ACT_ICON[k] }))} selected={[type]} onPick={setType} label="Activity" />
      </div>
      <div className="row2">
        <div className="field"><label htmlFor="c-min">Duration (minutes)</label><input className="txt" id="c-min" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
        {meta.distance && <div className="field"><label htmlFor="c-km">Distance (km) <span className="opt-l">Optional</span></label><input className="txt" id="c-km" type="number" inputMode="decimal" min={0} step={0.1} placeholder="e.g. 5.2" value={km} onChange={(e) => setKm(e.target.value)} /></div>}
        <div className="field"><label htmlFor="c-kcal">Calories <span className="opt-l">From your watch, optional</span></label><input className="txt" id="c-kcal" type="number" inputMode="numeric" min={0} placeholder={`About ${est}`} value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
        <div className="field"><label htmlFor="c-hr">Average heart rate <span className="opt-l">Optional</span></label><input className="txt" id="c-hr" type="number" inputMode="numeric" min={40} max={220} placeholder="bpm" value={hr} onChange={(e) => setHr(e.target.value)} /></div>
      </div>
      <p style={{ fontWeight: 600, margin: "18px 0 8px" }}>How hard was it?</p>
      <ChipGroup options={[{ value: "EASY", label: "Easy" }, { value: "MODERATE", label: "Moderate" }, { value: "HARD", label: "Hard" }]} selected={[effort]} onPick={(v) => setEffort(v as Effort)} label="Effort" />
      <div className="est"><Flame /><span>Estimated burn: <b>{est.toLocaleString("en-GB")} kcal</b>, from your weight, time and effort. Your watch's number wins if you add it.</span></div>
      <button type="button" className="cta" disabled={loading} onClick={() => void save()}>Save activity<Check /></button>
    </>
  );
}

// ── Weigh-in, reminder, audit ───────────────────────────────────────────

function WeighInSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const units = useUnits();
  const [kg, setKg] = useState(plan?.profile.startWeightKg ?? 75);
  const [log, { loading }] = useMutation(LOG_WEIGHT, { refetchQueries: REFETCH_LOGS });
  const step = units.unit === "kg" ? 0.1 : 0.5 / 2.20462;
  const save = async () => {
    try {
      await log({ variables: { input: { weightKg: Math.round(kg * 10) / 10 } } });
      toast(`Weigh-in saved: ${units.fmt(kg)}.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  return (
    <>
      <p className="sh-k">{dayLabel(localToday())}</p>
      <h3>Log your weigh-in</h3>
      <p>Morning, after the bathroom, before food. Daily numbers bounce around, so we use your 7-day average.</p>
      <div className="readout" style={{ margin: "10px 0 6px" }}>
        <button className="stepbtn" type="button" aria-label="Decrease" onClick={() => setKg((v) => Math.max(30, v - step))}><Minus /></button>
        <div className="big"><output className="mono">{units.unit === "kg" ? (Math.round(kg * 10) / 10).toFixed(1) : units.toDisplay(kg)}</output><span className="u">{units.unit}</span></div>
        <button className="stepbtn" type="button" aria-label="Increase" onClick={() => setKg((v) => Math.min(300, v + step))}><Plus /></button>
      </div>
      <button type="button" className="cta" disabled={loading} onClick={() => void save()}>Save weigh-in<Check /></button>
    </>
  );
}

const TIMES = ["06:00", "07:00", "12:30", "17:30", "19:00"];
function ReminderSheet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { plan } = usePlan();
  const [time, setTime] = useState(plan?.profile.reminderTime ?? "");
  const [save, { loading }] = useMutation(SET_REMINDER, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  const before = plan ? localToday() < plan.startDate : false;
  return (
    <>
      <p className="sh-k">Workout reminder</p>
      <h3>When should we nudge you?</h3>
      <p>We'll send it on training days only.</p>
      <ChipGroup options={[...TIMES.map((t) => ({ value: t, label: t })), { value: "", label: "Off" }]} selected={[time]} onPick={setTime} label="Reminder time" />
      <div className="field" style={{ marginTop: 14, maxWidth: 200 }}>
        <label htmlFor="r-time">Or pick a time</label>
        <input className="txt" type="time" id="r-time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {before && <p className="help" style={{ marginTop: 14 }}>We'll also remind you the evening before your plan starts.</p>}
      <button type="button" className="cta" disabled={loading} onClick={async () => {
        try {
          await save({ variables: { time: time || null } });
          toast(time ? `Reminder set for ${time} on training days.` : "Reminders are off.");
          onDone();
        } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
      }}>Save reminder</button>
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

// ── Preview and profile ─────────────────────────────────────────────────

function PreviewSheet({ session, date, onGuide, onDone, onSeen }: {
  session: PlannedSessionDto; date: string; onGuide: (n: string, p: string | null) => void; onDone: () => void; onSeen: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { plan } = usePlan();
  const today = localToday();
  const [setStart] = useMutation(SET_START_DATE, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  if (plan && !readFlags(plan.programId).previewed) { writeFlags(plan.programId, { previewed: true }); queueMicrotask(onSeen); }
  const start = async () => {
    if (plan && today < plan.startDate) {
      try { await setStart({ variables: { date: today } }); toast("Starting early. Your plan now begins today."); }
      catch (e) { toast(e instanceof Error ? e.message : "Couldn't move your start date."); return; }
    }
    onDone();
    navigate(`/session/${session.templateId ?? "x"}?date=${today}`);
  };
  return (
    <>
      <p className="sh-k">{dayLabel(date)}</p>
      <h3>{session.name}</h3>
      <p>{session.warmup.length ? "5 min warm-up, then " : ""}{session.exercises.length} exercises. About {plan?.profile.sessionMinutes ?? 45} minutes. Tap a picture to see how it's done.</p>
      <div className="exlist" style={{ display: "block" }}><ExerciseList warmup={session.warmup} exercises={session.exercises} onGuide={onGuide} /></div>
      <button type="button" className="cta" onClick={() => void start()}>{date === today ? "Start workout" : "Start it today instead"}<Play /></button>
    </>
  );
}

function ProfileSheet({ onReminder, onDone }: { onReminder: () => void; onDone: () => void }) {
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
        <div className="li"><span className="ic"><Bell /></span><span><span className="t">Workout reminder</span><span className="d" style={{ display: "block" }}>{plan.profile.reminderTime ? `${plan.profile.reminderTime} on training days` : "Off"}</span></span><button type="button" className="linkbtn" onClick={onReminder}>Change</button></div>
      </div>
      <div className="btnrow" style={{ marginTop: 18 }}>
        <button type="button" className="ghost" onClick={() => { onDone(); navigate("/start/welcome"); }}><Pencil />Change my answers</button>
        <button type="button" className="ghost" onClick={async () => { onDone(); await signOut(); await client.clearStore(); navigate("/signin", { replace: true }); }}><LogOut />Sign out</button>
      </div>
      <p className="fine" style={{ marginTop: 12 }}>Changing your answers builds a new 6-week plan. Your logged workouts, weigh-ins and activities stay.</p>
    </>
  );
}
