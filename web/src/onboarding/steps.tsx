import type { CSSProperties, ReactNode } from "react";
import {
  Activity, Anchor, Armchair, BadgeCheck, Ban, BatteryFull, BatteryLow, Bean, Bike, Bone, Brain, Building2, Cable, CalendarDays,
  Check, CircleHelp, Clock, Columns2, Compass, CupSoda, Dumbbell, Egg, Ellipsis, Fish, Flag, Flame, Footprints, GraduationCap,
  Hand, HardHat, Heart, HeartPulse, House, Image, Info, LayoutGrid, Leaf, ChartLine, Milk, Minus, Moon, Mountain, Music, Nut,
  PersonStanding, Plane, Plus, RefreshCw, Repeat, Ruler, Salad, Shell, ShieldCheck, Shuffle, Smile, Sparkle, Sprout, Store, Sun,
  Sunrise, Sunset, Target, Timer, TrendingDown, Trophy, User, Users, Utensils, WandSparkles, Warehouse, Waves, Wheat, X, Zap,
} from "lucide-react";
import {
  FAVOURITE_DISHES, PACE_RATE, buildWeek, computeProjection, computeTargets, splitLabel, splitTypes, targetWeightIssue,
  type PriorityMuscle,
} from "@engine";
import { ChipGroup, OptionList, toggleIn, type Opt } from "../components/ui/Options";
import { Measure } from "../components/ui/Measure";
import { BodyFigure } from "../figures/Figures";
import { DAYS, dateLong } from "../lib/dates";
import { firstName, toTraining, type Draft } from "./draft";
import { ProjectionChart } from "./ProjectionChart";

export interface StepCtx {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  /** set() then advance after the selection animation (single-choice screens). */
  pick: (patch: Partial<Draft>) => void;
  next: () => void;
  go: (id: string) => void;
  signedIn: boolean;
  today: string;
}

export interface Step {
  id: string;
  /** Progress-rail stage, -1 = rail hidden. */
  stage: number;
  title?: (d: Draft) => ReactNode;
  sub?: (d: Draft) => ReactNode;
  body?: (c: StepCtx) => ReactNode;
  /** Full custom screen (replaces title/sub/body). */
  screen?: (c: StepCtx) => ReactNode;
  valid?: (d: Draft) => boolean;
  cta?: string | ((d: Draft) => string);
  skip?: (d: Draft, signedIn: boolean) => boolean;
  /** Replaces the default "go to next step" action (e.g. submit the plan). */
  onNext?: (c: StepCtx) => void | Promise<void>;
  hideActions?: boolean;
  wide?: boolean;
}

export const STAGES = ["You", "Goal", "Training", "Lifestyle", "Fuel", "Mindset"];
const i = (n: number) => ({ "--i": n }) as CSSProperties;
const M = ({ children }: { children: ReactNode }) => <mark>{children}</mark>;
const Note = ({ icon: Icon = Info, children }: { icon?: typeof Info; children: ReactNode }) => <div className="note"><Icon /><span>{children}</span></div>;
const Q = ({ children }: { children: ReactNode }) => <p style={{ fontWeight: 600, margin: "26px 0 10px" }}>{children}</p>;
const MUSCLE_OPTS: Opt<PriorityMuscle>[] = [
  { value: "CHEST", label: "Chest" }, { value: "BACK", label: "Back" }, { value: "SHOULDERS", label: "Shoulders" },
  { value: "ARMS", label: "Arms" }, { value: "GLUTES", label: "Glutes" }, { value: "LEGS", label: "Legs" },
];
const lossOrGain = (d: Draft) => d.goal === "LOSE_FAT" || d.goal === "BUILD_MUSCLE";

export const kgFmt = (d: Pick<Draft, "weightUnit">) => (kg: number) =>
  d.weightUnit === "lb" ? `${Math.round(kg * 2.20462)} lb` : `${Math.round(kg * 10) / 10} kg`;
export const kgShow = (d: Pick<Draft, "weightUnit">) => (kg: number) =>
  d.weightUnit === "lb" ? Math.round(kg * 2.20462) : Math.round(kg * 10) / 10;

function WeightMeasure({ c, field }: { c: StepCtx; field: "weightKg" | "targetWeightKg" }) {
  const { d, set } = c;
  const kg = (field === "weightKg" ? d.weightKg : d.targetWeightKg) ?? d.weightKg;
  const lb = d.weightUnit === "lb";
  return (
    <Measure label="weight" value={lb ? Math.round(kg * 2.20462 * 2) / 2 : Math.round(kg * 10) / 10}
      min={lb ? 88 : 40} max={lb ? 400 : 180} step={lb ? 0.5 : 0.1} stepButton={lb ? 1 : 0.5} unit={lb ? "lb" : "kg"}
      units={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} activeUnit={d.weightUnit}
      onUnit={(u) => set({ weightUnit: u as Draft["weightUnit"] })}
      onChange={(v) => set({ [field]: Math.round((lb ? v / 2.20462 : v) * 10) / 10 } as Partial<Draft>)} />
  );
}

const BF_LABELS = {
  MALE: [["10-14%", "Lean. Clear muscle lines, abs show in good light."], ["15-19%", "Fit. Some ab outline, little softness at the waist."], ["20-24%", "Average. Soft at the waist, arms and shoulders keep shape."], ["25-29%", "Above average. Noticeable softness at waist and chest."], ["30%+", "Higher. Most weight sits around the middle."]],
  FEMALE: [["18-22%", "Lean. Visible muscle tone in arms, legs and stomach."], ["23-27%", "Fit. Toned with a little softness at hips and thighs."], ["28-32%", "Average. Curves are soft, some tone in arms and legs."], ["33-37%", "Above average. Softness at stomach, hips and arms."], ["38%+", "Higher. Most weight sits at stomach, hips and thighs."]],
} as const;
const BF_NAMES = ["Lean", "Fit", "Average", "Softer", "Higher"];
const BF_FILL = [18, 32, 48, 64, 82];

function BodyShape({ c }: { c: StepCtx }) {
  const { d, set } = c;
  const sex = d.sex || "MALE";
  const fig = d.bodyFatView !== "gauge";
  return (
    <>
      <div className="bf-view">
        <div className="seg" role="group" aria-label="Picture style">
          <button type="button" className={fig ? "on" : ""} aria-pressed={fig} onClick={() => set({ bodyFatView: "figures" })}>Illustrations</button>
          <button type="button" className={fig ? "" : "on"} aria-pressed={!fig} onClick={() => set({ bodyFatView: "gauge" })}>Gauge</button>
        </div>
      </div>
      <div className={`bf${fig ? " figs" : ""} stagger`} role="radiogroup" aria-label="Body shape">
        {BF_LABELS[sex].map(([range, desc], k) => {
          const on = d.bodyFatLevel === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} className={`opt${on ? " on" : ""}`} style={i(k)} onClick={() => set({ bodyFatLevel: k })}>
              {fig ? (
                <><BodyFigure level={k} sex={sex} /><span className="r">{BF_NAMES[k]}</span><span className="d">{desc.replace(/^[^.]+\.\s*/, "")}</span></>
              ) : (
                <><span className="bf-vial" aria-hidden="true"><i style={{ "--h": `${BF_FILL[k]}%` } as CSSProperties} /></span><span className="r">{range}</span><span className="d">{desc}</span></>
              )}
              <span className="tick"><Check /></span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <button type="button" className={`chip${d.bodyFatLevel === "UNSURE" ? " on" : ""}`} aria-pressed={d.bodyFatLevel === "UNSURE"} onClick={() => set({ bodyFatLevel: "UNSURE" })}>
          <CircleHelp />Not sure, skip this
        </button>
      </div>
    </>
  );
}

function DaysStep({ c }: { c: StepCtx }) {
  const { d, set } = c;
  const max = Math.min(6, d.availableDays.length);
  const rec = Math.min(max, d.experience === "NEW" ? 3 : d.experience === "EXPERIENCED" ? 5 : 4);
  const days = d.daysPerWeek || rec;
  if (!d.daysPerWeek) queueMicrotask(() => set({ daysPerWeek: rec }));
  const note = days < rec ? "A good starting point. You can step up once the routine sticks."
    : days > rec ? "Ambitious. Make sure your sleep and schedule can back it up." : "Recommended for your experience level.";
  return (
    <div className="stagger">
      <div className="count" style={i(0)}>
        <button className="stepbtn" type="button" aria-label="One fewer day" disabled={days <= 2} onClick={() => set({ daysPerWeek: days - 1, revealDays: 0 })}><Minus /></button>
        <div><div className="n mono" key={days} aria-live="polite">{days}</div></div>
        <button className="stepbtn" type="button" aria-label="One more day" disabled={days >= max} onClick={() => set({ daysPerWeek: days + 1, revealDays: 0 })}><Plus /></button>
        <div className="count-lbl">days a week<br /><span className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>out of {d.availableDays.length} free</span></div>
      </div>
      <div style={i(1)}><Note>{note}</Note></div>
    </div>
  );
}

function Likert({ c, field, text }: { c: StepCtx; field: "likertConsistency" | "likertGuidance"; text: string }) {
  return (
    <>
      <blockquote className="stmt fadein">{text}</blockquote>
      <div style={{ marginTop: 28 }}>
        <div className="likert stagger" role="radiogroup" aria-label="How much this sounds like you, 1 to 5">
          {[1, 2, 3, 4, 5].map((n, k) => (
            <button key={n} type="button" role="radio" aria-checked={c.d[field] === n} aria-label={`${n} of 5`}
              className={`opt noico${c.d[field] === n ? " on" : ""}`} style={i(k)} onClick={() => c.pick({ [field]: n } as Partial<Draft>)}>{n}</button>
          ))}
        </div>
        <div className="likert-ends"><span>Not like me</span><span>Exactly me</span></div>
      </div>
    </>
  );
}

const single = <T extends string | number>(c: StepCtx, field: keyof Draft, options: Opt<T>[], layout?: "list" | "grid", extra?: (v: T) => Partial<Draft>) => (
  <OptionList options={options} selected={[c.d[field] as T]} layout={layout} onPick={(v) => c.pick({ [field]: v, ...(extra?.(v) ?? {}) } as Partial<Draft>)} />
);
const multi = <T extends string>(c: StepCtx, field: keyof Draft, options: Opt<T>[], o: { none?: T; max?: number; layout?: "list" | "grid"; chips?: boolean } = {}) => {
  const sel = c.d[field] as T[];
  const onPick = (v: T) => c.set({ [field]: toggleIn(sel, v, o) } as Partial<Draft>);
  return o.chips
    ? <ChipGroup multi options={options} selected={sel} onPick={onPick} />
    : <OptionList multi options={options} selected={sel} layout={o.layout} onPick={onPick} />;
};
const chips = <T extends string | number>(c: StepCtx, field: keyof Draft, options: Opt<T>[]) => (
  <ChipGroup options={options} selected={[c.d[field] as T]} onPick={(v) => c.set({ [field]: v } as Partial<Draft>)} />
);

export const STEPS: Step[] = [
  {
    id: "welcome", stage: -1, cta: "Start my plan",
    screen: () => (
      <div className="welcome stagger">
        <h1 style={i(0)}>Let's build a plan that fits your life.</h1>
        <p style={i(1)}>Answer a few questions about your body, your week and how you eat. TrackFit turns them into a 6-week training program and a meal plan built from food you actually like.</p>
        <div className="wlist" style={i(2)}>
          <div><b>6 min</b><span>to answer</span></div>
          <div><b>6 weeks</b><span>per program cycle</span></div>
          <div><b>2 plans</b><span>training and meals, together</span></div>
        </div>
      </div>
    ),
  },
  {
    id: "safety", stage: 0,
    title: () => <>First, a quick <M>safety check</M>.</>,
    sub: () => "Tick anything that applies to you today. If something does, we'll point you to safer next steps instead of generating a plan.",
    body: (c) => multi(c, "safety", [
      { value: "heartCondition", label: "A diagnosed heart condition" }, { value: "highBloodPressure", label: "High or uncontrolled blood pressure" },
      { value: "diabetes", label: "Diabetes" }, { value: "pregnant", label: "Currently pregnant" },
      { value: "recentSurgeryOrInjury", label: "Surgery or a serious injury in the last 3 months" },
      { value: "chestPainOrDizziness", label: "Chest pain or dizziness when exercising" }, { value: "under18", label: "I'm under 18" },
      { value: "NONE", label: "None of these apply to me", icon: ShieldCheck },
    ], { none: "NONE" }),
    valid: (d) => d.safety.length > 0,
  },
  {
    id: "screened", stage: 0, cta: "Change my answers",
    skip: (d) => !d.safety.length || d.safety.includes("NONE"),
    title: () => <>Let's get you <M>cleared</M> first.</>,
    sub: () => "Based on your answers, a generated program could put you at risk. Please speak with a doctor or a qualified trainer before starting one.",
    body: () => <Note>You can still use TrackFit's workout log, weight tracker and templates. Nothing you log is shared.</Note>,
    onNext: (c) => c.go("safety"),
  },
  {
    id: "name", stage: 0,
    title: () => <>What should we <M>call you</M>?</>,
    sub: () => "Your first name is enough. It goes on your plan and nowhere else.",
    body: (c) => (
      <div className="field stagger">
        <label htmlFor="f-name" style={i(0)}>First name</label>
        <input style={i(1)} className="txt" id="f-name" autoComplete="given-name" maxLength={30} placeholder="e.g. Ama" autoFocus
          value={c.d.name} onChange={(e) => c.set({ name: e.target.value })} />
      </div>
    ),
    valid: (d) => d.name.trim().length > 0,
  },
  {
    id: "sex", stage: 0,
    title: (d) => <>{firstName(d) ? `${firstName(d)}, which` : "Which"} <M>sex</M> should we use for your calculations?</>,
    sub: () => "Resting calorie burn differs by sex, so this changes your daily targets.",
    body: (c) => single(c, "sex", [{ value: "MALE", label: "Male", icon: User }, { value: "FEMALE", label: "Female", icon: User }]),
    valid: (d) => !!d.sex,
  },
  {
    id: "age", stage: 0,
    title: () => <>How <M>old</M> are you?</>,
    sub: () => "Age changes how much energy you burn at rest and how fast we progress your weights.",
    body: (c) => <Measure label="age" value={c.d.age} min={18} max={80} step={1} unit="years" onChange={(v) => c.set({ age: v })} />,
    valid: (d) => d.age >= 18 && d.age <= 90,
  },
  {
    id: "height", stage: 0,
    title: () => <>How <M>tall</M> are you?</>,
    sub: () => "Drag the ruler or type it in.",
    body: (c) => {
      const ft = c.d.heightUnit === "ft";
      const units = [{ value: "cm", label: "cm" }, { value: "ft", label: "ft / in" }];
      return ft ? (
        <Measure label="height" value={Math.round(c.d.heightCm / 2.54)} min={55} max={83} step={1} unit="in" units={units} activeUnit="ft"
          onUnit={(u) => c.set({ heightUnit: u as Draft["heightUnit"] })} format={(v) => `${Math.floor(v / 12)}′${v % 12}″`}
          onChange={(v) => c.set({ heightCm: Math.round(v * 2.54) })} />
      ) : (
        <Measure label="height" value={c.d.heightCm} min={140} max={210} step={1} unit="cm" units={units} activeUnit="cm"
          onUnit={(u) => c.set({ heightUnit: u as Draft["heightUnit"] })} onChange={(v) => c.set({ heightCm: v })} />
      );
    },
    valid: (d) => d.heightCm >= 130 && d.heightCm <= 220,
  },
  {
    id: "weight", stage: 0,
    title: () => <>What do you <M>weigh</M> today?</>,
    sub: () => "A morning weigh-in is the most accurate, but a recent guess is fine. You'll log the real number on Day 1.",
    body: (c) => <WeightMeasure c={c} field="weightKg" />,
    valid: (d) => d.weightKg >= 35 && d.weightKg <= 250,
  },
  {
    id: "bodyfat", stage: 0,
    title: () => <>Which feels closest to your <M>body today</M>?</>,
    sub: () => "No right answer. A rough estimate sharpens your protein target and how we read your progress.",
    body: (c) => <BodyShape c={c} />,
    valid: (d) => d.bodyFatLevel !== null,
  },
  {
    id: "i-start", stage: 0, cta: "Set my goal",
    screen: (c) => {
      const t = computeTargets(toTraining(c.d));
      const lvl = typeof c.d.bodyFatLevel === "number" ? c.d.bodyFatLevel : null;
      const bf = lvl == null ? null : (c.d.sex === "FEMALE" ? [20, 25, 30, 35, 40] : [12, 17, 22, 27, 33])[lvl];
      const show = kgShow(c.d);
      return (
        <div className="inter">
          <div className="badge"><Ruler /></div>
          <h1 className="qh">Here's where you're starting{firstName(c.d) ? `, ${firstName(c.d)}` : ""}.</h1>
          <p className="qs">Your body burns energy just keeping you alive. That number is the floor your whole plan is built on.</p>
          <div className="stats">
            <div className="stat fadein" style={{ "--d": ".15s" } as CSSProperties}><div className="v">{t.bmr.toLocaleString("en-GB")}<small>kcal</small></div><div className="k">Resting burn per day</div></div>
            <div className="stat fadein" style={{ "--d": ".25s" } as CSSProperties}><div className="v">{show(c.d.weightKg)}<small>{c.d.weightUnit}</small></div><div className="k">Starting weight</div></div>
            {bf != null && <div className="stat fadein" style={{ "--d": ".35s" } as CSSProperties}><div className="v">{show(c.d.weightKg * (1 - bf / 100))}<small>{c.d.weightUnit}</small></div><div className="k">Estimated lean mass</div></div>}
          </div>
          <Note>Resting burn uses the Mifflin-St Jeor equation. Your plan recalculates it as your weight changes.</Note>
        </div>
      );
    },
  },
  {
    id: "goal", stage: 1,
    title: () => <>What's your <M>main goal</M> for the next 6 weeks?</>,
    sub: () => "Pick one. You can switch goals at the end of each cycle.",
    body: (c) => single(c, "goal", [
      { value: "LOSE_FAT", label: "Lose fat", desc: "Drop weight while keeping your muscle", icon: Flame },
      { value: "BUILD_MUSCLE", label: "Build muscle", desc: "Add size and strength with a small surplus", icon: Dumbbell },
      { value: "RECOMP", label: "Recompose", desc: "Lose fat and build muscle, weight stays similar", icon: RefreshCw },
      { value: "FITNESS", label: "Get fitter and stronger", desc: "Performance first, scale second", icon: Zap },
      { value: "MAINTAIN", label: "Maintain", desc: "Keep your weight, build a routine that sticks", icon: Anchor },
    ], "list", (v) => {
      const d = c.d;
      if (v === "LOSE_FAT" || v === "BUILD_MUSCLE") {
        const ok = d.targetWeightKg != null && (v === "LOSE_FAT" ? d.targetWeightKg < d.weightKg : d.targetWeightKg > d.weightKg);
        return ok ? {} : { targetWeightKg: Math.round(d.weightKg * (v === "LOSE_FAT" ? 0.9 : 1.06) * 10) / 10 };
      }
      return { targetWeightKg: null, pace: "" };
    }),
    valid: (d) => !!d.goal,
  },
  {
    id: "target", stage: 1, skip: (d) => !lossOrGain(d),
    title: () => <>What weight are you <M>aiming for</M>?</>,
    sub: (d) => d.goal === "LOSE_FAT" ? "Pick a number that feels realistic. We'll plan the first step toward it." : "Lean gains are slow. A few kilos over a cycle is a strong result.",
    body: (c) => {
      const issue = targetWeightIssue(toTraining(c.d));
      const diff = (c.d.targetWeightKg ?? c.d.weightKg) - c.d.weightKg;
      return (
        <>
          <WeightMeasure c={c} field="targetWeightKg" />
          {issue && <div className="err" role="alert"><X /><span>{issue}</span></div>}
          <Note icon={Target}>{Math.abs(diff) < 0.05 ? "Same as today." : `That's ${kgFmt(c.d)(Math.abs(diff))} ${diff < 0 ? "down" : "up"} from today.`}</Note>
        </>
      );
    },
    valid: (d) => targetWeightIssue(toTraining(d)) === null,
  },
  {
    id: "pace", stage: 1, skip: (d) => !lossOrGain(d),
    title: () => <>How fast do you want to <M>get there</M>?</>,
    sub: (d) => d.goal === "LOSE_FAT" ? "Faster isn't always better. Above about 1% of body weight a week, you start losing muscle." : "A bigger surplus mostly adds fat, not extra muscle.",
    body: (c) => {
      const g = c.d.goal === "BUILD_MUSCLE" ? "BUILD_MUSCLE" : "LOSE_FAT";
      const r = (k: "STEADY" | "MODERATE" | "AMBITIOUS") => {
        const x = c.d.weightKg * PACE_RATE[g][k];
        return c.d.weightUnit === "lb" ? `${Math.round(x * 2.20462 * 10) / 10} lb a week` : `${Math.round(x * 100) / 100} kg a week`;
      };
      return single(c, "pace", [
        { value: "STEADY", label: "Steady", desc: `${r("STEADY")}. Easiest to stick to.`, icon: Footprints },
        { value: "MODERATE", label: "Moderate", desc: `${r("MODERATE")}. Recommended for most people.`, icon: Activity },
        { value: "AMBITIOUS", label: "Ambitious", desc: `${r("AMBITIOUS")}. Our cap, needs strict consistency.`, icon: Zap },
      ]);
    },
    valid: (d) => !!d.pace,
  },
  {
    id: "why", stage: 1,
    title: () => <>What's <M>driving</M> this for you?</>,
    sub: () => "Pick up to 3. We'll use these to word your check-ins and milestone messages.",
    body: (c) => multi(c, "motivations", [
      { value: "confidence", label: "Feel more confident", icon: Smile }, { value: "health", label: "Improve my health markers", icon: HeartPulse },
      { value: "energy", label: "Have more energy day to day", icon: BatteryFull }, { value: "sport", label: "Perform better at my sport", icon: Trophy },
      { value: "event", label: "Look good for an event", icon: CalendarDays }, { value: "family", label: "Keep up with my kids or family", icon: Users },
      { value: "mind", label: "Clear my head and manage stress", icon: Brain }, { value: "prove", label: "Prove to myself I can", icon: Flag },
    ], { max: 3, layout: "grid" }),
    valid: (d) => d.motivations.length > 0,
  },
  {
    id: "i-proj", stage: 1, cta: "Plan my training",
    screen: (c) => {
      const p = computeProjection(toTraining(c.d), c.today);
      if (p && c.d.targetWeightKg) {
        return (
          <div className="inter">
            <h1 className="qh">You could reach <M>{kgFmt(c.d)(c.d.targetWeightKg)}</M> by {dateLong(p.endDate)}.</h1>
            <p className="qs">That's about {p.weeks} weeks at your chosen pace. Your plan recalibrates every 6 weeks from your check-ins, so the date moves with you.</p>
            <ProjectionChart startKg={c.d.weightKg} targetKg={c.d.targetWeightKg} weeks={p.weeks} fmt={kgFmt(c.d)} toDisplay={kgShow(c.d)} />
          </div>
        );
      }
      return (
        <div className="inter">
          <div className="badge"><Target /></div>
          <h1 className="qh">Your first 6 weeks, mapped out.</h1>
          <p className="qs">{c.d.goal === "RECOMP" ? "With recomposition the scale barely moves. Strength and measurements tell the story, so that's what we'll track." : "We'll track strength and consistency first. Weight is a side note for this goal."}</p>
          <div className="milestones stagger">
            <div className="ms" style={i(0)}><b>Weeks 1-2</b><span>Learn the movements, find your starting weights and lock in the routine.</span></div>
            <div className="ms" style={i(1)}><b>Weeks 3-5</b><span>Weights or reps go up each week, based on what you logged the week before.</span></div>
            <div className="ms" style={i(2)}><b>Week 6</b><span>Check-in. We test your progress and build cycle 2 from the results.</span></div>
          </div>
        </div>
      );
    },
  },
  {
    id: "exp", stage: 2,
    title: () => <>How much <M>gym experience</M> do you have?</>,
    sub: () => "Be honest. Starting a little easy beats getting hurt in week 2.",
    body: (c) => single(c, "experience", [
      { value: "NEW", label: "New to it", desc: "Just starting, or getting back after a long break", icon: Sprout },
      { value: "SOME", label: "Some experience", desc: "I train on and off and know the basic lifts", icon: Dumbbell },
      { value: "EXPERIENCED", label: "Experienced", desc: "I've trained consistently for 2+ years", icon: Trophy },
    ]),
    valid: (d) => !!d.experience,
  },
  {
    id: "lifts", stage: 2,
    title: () => <>How comfortable are you with <M>squats, bench press and deadlifts</M>?</>,
    sub: () => "This decides whether we start with technique work or go straight to loading.",
    body: (c) => single(c, "liftComfort", [
      { value: "NEVER", label: "Never done them", desc: "They look intimidating or unfamiliar", icon: CircleHelp },
      { value: "LEARNING", label: "Still learning", desc: "I've tried them, my form needs work", icon: GraduationCap },
      { value: "SOLID", label: "Confident and consistent", desc: "I do them regularly with good technique", icon: BadgeCheck },
      { value: "AVOID", label: "I avoid them", desc: "Because of an injury or physical limit", icon: Ban },
    ]),
    valid: (d) => !!d.liftComfort,
  },
  {
    id: "equip", stage: 2,
    title: () => <>Where will you <M>train</M> most often?</>,
    sub: () => "Every exercise in your plan will match this setup.",
    body: (c) => single(c, "equipment", [
      { value: "FULL_GYM", label: "Full gym", desc: "Commercial gym with machines, cables and free weights", icon: Building2 },
      { value: "SMALL_GYM", label: "Small gym", desc: "Basic racks, a few machines, limited weights", icon: Warehouse },
      { value: "HOME_GYM", label: "Home gym", desc: "Rack, barbell, dumbbells and a bench", icon: House },
      { value: "DUMBBELLS", label: "Dumbbells only", desc: "A set of dumbbells and maybe a bench", icon: Dumbbell },
      { value: "BANDS", label: "Resistance bands", desc: "Light kit you can take anywhere", icon: Cable },
      { value: "BODYWEIGHT", label: "Bodyweight only", desc: "No equipment, any space", icon: PersonStanding },
    ]),
    valid: (d) => !!d.equipment,
  },
  {
    id: "avail", stage: 2,
    title: () => <>Which days could you <M>realistically</M> train?</>,
    sub: () => "Pick every day that could work. We'll choose the best ones from these next.",
    body: (c) => (
      <>
        <div className="week stagger" role="group" aria-label="Available days">
          {DAYS.map((name, k) => {
            const on = c.d.availableDays.includes(k);
            return (
              <button key={k} type="button" className={`wd${on ? " on" : ""}`} style={i(k)} aria-pressed={on}
                onClick={() => {
                  const next = on ? c.d.availableDays.filter((x) => x !== k) : [...c.d.availableDays, k].sort();
                  c.set({ availableDays: next, daysPerWeek: c.d.daysPerWeek > Math.min(6, next.length) ? 0 : c.d.daysPerWeek, revealDays: 0 });
                }}>
                {name}<small>{on ? "Free" : "Busy"}</small>
              </button>
            );
          })}
        </div>
        <p className="counter">{c.d.availableDays.length} day{c.d.availableDays.length === 1 ? "" : "s"} selected. Pick at least 2.</p>
      </>
    ),
    valid: (d) => d.availableDays.length >= 2,
  },
  {
    id: "days", stage: 2, cta: "Lock it in",
    title: () => <>How many days a week will you <M>commit</M> to?</>,
    sub: () => "Pick what you'll hit on a bad week, not a good one. After your plan starts you can move this up or down by one day.",
    body: (c) => <DaysStep c={c} />,
    valid: (d) => d.daysPerWeek >= 2,
  },
  {
    id: "length", stage: 2,
    title: (d) => <>{firstName(d) ? `${firstName(d)}, how` : "How"} long can a <M>session</M> be?</>,
    sub: () => "Including warm-up. Shorter sessions get supersets so nothing important gets cut.",
    body: (c) => single(c, "sessionMinutes", [
      { value: 30, label: "30 minutes", desc: "Short and dense", icon: Timer }, { value: 45, label: "45 minutes", desc: "Fits a lunch break", icon: Timer },
      { value: 60, label: "60 minutes", desc: "The sweet spot for most plans", icon: Clock }, { value: 75, label: "75 minutes", desc: "Room for extra volume", icon: Clock },
    ]),
    valid: (d) => !!d.sessionMinutes,
  },
  {
    id: "split", stage: 2,
    title: () => <>How do you like your <M>workouts structured</M>?</>,
    sub: (d) => `Based on ${d.daysPerWeek} days and your experience, we'd go with ${splitLabel(splitTypes(d.daysPerWeek || 3, { ...toTraining(d), split: "AUTO", fullBodyDay: false })).toLowerCase()}.`,
    body: (c) => {
      const auto = splitLabel(splitTypes(c.d.daysPerWeek || 3, { ...toTraining(c.d), split: "AUTO", fullBodyDay: false })).toLowerCase();
      return single(c, "split", [
        { value: "AUTO", label: "Let TrackFit choose", desc: `Recommended: ${auto}`, icon: WandSparkles },
        { value: "FULL_BODY", label: "Full body every session", desc: "Train everything, every time", icon: PersonStanding },
        { value: "UPPER_LOWER", label: "Upper / lower", desc: "Alternate upper-body and lower-body days", icon: Columns2 },
        { value: "MUSCLE_FOCUS", label: "Muscle-group focus", desc: "Push, pull and legs days. Needs 4+ days.", icon: LayoutGrid, disabled: c.d.daysPerWeek < 4 },
      ]);
    },
    valid: (d) => !!d.split,
  },
  {
    id: "fullbody", stage: 2, skip: (d) => d.daysPerWeek < 3 || d.split === "FULL_BODY",
    title: () => <>Always include a <M>full-body day</M>?</>,
    sub: () => "One session a week that trains everything. Great insurance for a missed day, whatever split you run.",
    body: (c) => (
      <OptionList options={[
        { value: "yes", label: "Yes, at least one full-body day", desc: "Your last session each week becomes full body", icon: PersonStanding },
        { value: "no", label: "No, keep my split as it is", icon: Columns2 },
      ]} selected={c.d.fullBodyDay === null ? [] : [c.d.fullBodyDay ? "yes" : "no"]} onPick={(v) => c.pick({ fullBodyDay: v === "yes" })} />
    ),
    valid: (d) => d.fullBodyDay !== null,
  },
  {
    id: "priority", stage: 2,
    title: () => <>Any muscles you want to <M>prioritise</M>?</>,
    sub: () => "Pick up to 2. They get extra sets, placed early in the session when you're fresh.",
    body: (c) => multi(c, "priorityMuscles", [
      ...MUSCLE_OPTS, { value: "CORE", label: "Abs & core" }, { value: "EVEN", label: "Everything evenly" },
    ], { max: 2, none: "EVEN", chips: true }),
    valid: (d) => d.priorityMuscles.length > 0,
  },
  {
    id: "low-priority", stage: 2,
    title: () => <>Any muscles you <M>don't</M> want to prioritise?</>,
    sub: () => "Pick up to 2. Your main lifts still train them, with fewer sets and no extra isolation moves. Abs & core stay in every session.",
    body: (c) => multi(c, "lowPriorityMuscles", [
      ...MUSCLE_OPTS.map((o) => ({ ...o, disabled: c.d.priorityMuscles.includes(o.value) })),
      { value: "NONE", label: "No, train everything normally" },
    ], { max: 2, none: "NONE", chips: true }),
    valid: (d) => d.lowPriorityMuscles.some((m) => m === "NONE" || !d.priorityMuscles.includes(m)),
  },
  {
    id: "injuries", stage: 2,
    title: () => <>Anything we should <M>work around</M>?</>,
    sub: () => "Past or current. We'll swap exercises so you keep progressing without aggravating it.",
    body: (c) => (
      <>
        {multi(c, "injuries", [
          { value: "SHOULDER", label: "Shoulder", icon: Bone }, { value: "ELBOW", label: "Elbow", icon: Bone }, { value: "WRIST", label: "Wrist", icon: Hand },
          { value: "LOWER_BACK", label: "Lower back", icon: Bone }, { value: "KNEE", label: "Knee", icon: Bone }, { value: "HIP", label: "Hip", icon: Bone },
          { value: "NONE", label: "Nothing to work around", icon: ShieldCheck },
        ], { none: "NONE", chips: true })}
        <div className="field" style={{ marginTop: 22, maxWidth: 520 }}>
          <label htmlFor="f-inj">Anything else? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>Optional</span></label>
          <textarea className="txt" id="f-inj" maxLength={160} placeholder="e.g. no overhead pressing, flat feet" value={c.d.injuryNote} onChange={(e) => c.set({ injuryNote: e.target.value })} />
        </div>
      </>
    ),
    valid: (d) => d.injuries.length > 0,
  },
  {
    id: "cardio", stage: 2,
    title: () => <>How do you like to <M>move</M> outside the gym?</>,
    sub: () => "We'll put these on your rest days instead of generic cardio.",
    body: (c) => (
      <>
        <p style={{ fontWeight: 600, margin: "0 0 10px" }}>How often now?</p>
        {chips(c, "cardioFrequency", [{ value: "rare", label: "Rarely" }, { value: "some", label: "Once or twice a week" }, { value: "often", label: "3+ times a week" }])}
        <Q>What do you enjoy? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>Pick any</span></Q>
        {multi(c, "cardioLikes", [
          { value: "walk", label: "Walking", icon: Footprints }, { value: "run", label: "Running", icon: Activity }, { value: "football", label: "Football", icon: Trophy },
          { value: "cycle", label: "Cycling", icon: Bike }, { value: "swim", label: "Swimming", icon: Waves }, { value: "dance", label: "Dance", icon: Music },
          { value: "skip", label: "Skipping", icon: Repeat }, { value: "hike", label: "Hiking", icon: Mountain }, { value: "none", label: "None of these", icon: X },
        ], { none: "none", chips: true })}
      </>
    ),
    valid: (d) => !!d.cardioFrequency && d.cardioLikes.length > 0,
  },
  {
    id: "i-week", stage: 2, cta: "Keep going",
    screen: (c) => {
      const w = buildWeek(toTraining(c.d));
      const byDay = new Map(w.sessions.map((s) => [s.weekday, s.name]));
      const rest = w.restDays[0]?.suggestion.split(",")[0].toLowerCase() ?? "recovery";
      return (
        <div className="inter">
          <h1 className="qh">Your week is <M>taking shape</M>.</h1>
          <p className="qs">{w.daysPerWeek} sessions of {c.d.sessionMinutes} minutes, {w.splitLabel.toLowerCase()}. Rest days are kept free for {rest} and recovery.</p>
          <div className="weekstrip stagger">
            {DAYS.map((name, k) => (
              <div key={k} className={`ws${byDay.has(k) ? " train" : ""}`} style={i(k)}><b>{name}</b><span>{byDay.get(k) ?? "Rest"}</span></div>
            ))}
          </div>
          <Note>Days are spaced so each muscle group gets 48 hours or more before it's trained again.</Note>
        </div>
      );
    },
  },
  {
    id: "steps", stage: 3,
    title: () => <>Outside of training, how <M>active</M> is a normal day?</>,
    sub: () => "Your job and commute matter more to your calories than most people think.",
    body: (c) => single(c, "activityLevel", [
      { value: "DESK", label: "Mostly sitting", desc: "Desk job, drive or trotro to work. Under 5,000 steps", icon: Armchair },
      { value: "LIGHT", label: "On my feet a bit", desc: "Some walking around. 5,000 to 8,000 steps", icon: Footprints },
      { value: "ACTIVE", label: "Moving a lot", desc: "Retail, teaching, walking commutes. 8,000 to 12,000", icon: PersonStanding },
      { value: "VERY_ACTIVE", label: "Physical work", desc: "Labour, trades, always moving. 12,000+", icon: HardHat },
    ]),
    valid: (d) => !!d.activityLevel,
  },
  {
    id: "sleep", stage: 3,
    title: () => <>How much do you <M>sleep</M> on a typical night?</>,
    sub: () => "Sleep decides how much training you can recover from. We set week-1 volume with it.",
    body: (c) => (
      <>
        <Measure label="sleep hours" value={c.d.sleepHours} min={4} max={10} step={0.5} unit="hours" onChange={(v) => c.set({ sleepHours: v })} />
        <Q>How do you usually wake up?</Q>
        {chips(c, "sleepQuality", [{ value: "RESTED", label: "Rested" }, { value: "VARIES", label: "It varies" }, { value: "TIRED", label: "Tired most days" }])}
      </>
    ),
    valid: (d) => !!d.sleepQuality,
  },
  {
    id: "schedule", stage: 3,
    title: () => <>When does your day <M>let you train</M>?</>,
    sub: () => "We'll time your bigger meals around your sessions.",
    body: (c) => (
      <>
        <OptionList layout="grid" options={[
          { value: "EARLY", label: "Early morning", desc: "Before 8am", icon: Sunrise }, { value: "MIDDAY", label: "Midday", desc: "Lunch break", icon: Sun },
          { value: "EVENING", label: "Evening", desc: "After work", icon: Sunset }, { value: "VARIES", label: "It changes", desc: "Shift work or unpredictable days", icon: Shuffle },
        ]} selected={[c.d.trainTime]} onPick={(v) => c.set({ trainTime: v as Draft["trainTime"] })} />
        <Q>How full are your days?</Q>
        {chips(c, "busyness", [{ value: "PACKED", label: "Packed" }, { value: "BUSY", label: "Busy but manageable" }, { value: "FLEXIBLE", label: "Fairly flexible" }])}
      </>
    ),
    valid: (d) => !!d.trainTime && !!d.busyness,
  },
  {
    id: "diet", stage: 4,
    title: () => <>Which of these best describes how you <M>eat</M>?</>,
    sub: () => "Every meal in your plan follows this.",
    body: (c) => single(c, "dietPattern", [
      { value: "OMNIVORE", label: "I eat everything", icon: Utensils }, { value: "HALAL", label: "Halal", icon: Utensils },
      { value: "PESCATARIAN", label: "Pescatarian", desc: "Fish, no meat", icon: Fish }, { value: "VEGETARIAN", label: "Vegetarian", icon: Salad },
      { value: "VEGAN", label: "Vegan", icon: Leaf }, { value: "OTHER", label: "Something else", icon: Ellipsis },
    ], "grid"),
    valid: (d) => !!d.dietPattern,
  },
  {
    id: "allergies", stage: 4,
    title: () => <>Any <M>allergies or intolerances</M>?</>,
    sub: () => "We'll keep these out of every recipe.",
    body: (c) => (
      <>
        {multi(c, "allergies", [
          { value: "DAIRY", label: "Dairy", icon: Milk }, { value: "GLUTEN", label: "Gluten", icon: Wheat }, { value: "PEANUTS", label: "Peanuts", icon: Nut },
          { value: "SHELLFISH", label: "Shellfish", icon: Shell }, { value: "EGGS", label: "Eggs", icon: Egg }, { value: "SOY", label: "Soy", icon: Bean },
          { value: "FISH", label: "Fish", icon: Fish }, { value: "NONE", label: "None", icon: ShieldCheck },
        ], { none: "NONE", chips: true })}
        <div className="field" style={{ marginTop: 22, maxWidth: 520 }}>
          <label htmlFor="f-avoid">Foods you just don't like <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>Optional</span></label>
          <input className="txt" id="f-avoid" maxLength={120} placeholder="e.g. okro, mushrooms" value={c.d.dislikes} onChange={(e) => c.set({ dislikes: e.target.value })} />
        </div>
      </>
    ),
    valid: (d) => d.allergies.length > 0,
  },
  {
    id: "local", stage: 4,
    title: () => <>Which meals do you <M>love</M>?</>,
    sub: () => "Pick at least 3. We size your favourites to your targets instead of replacing them with chicken and broccoli.",
    body: (c) => (
      <>
        {multi(c, "favouriteDishes", FAVOURITE_DISHES.map((f) => ({ value: f.dish, label: f.label })), { chips: true })}
        <p className="counter">{c.d.favouriteDishes.length} picked</p>
      </>
    ),
    valid: (d) => d.favouriteDishes.length >= 3,
  },
  {
    id: "meals", stage: 4,
    title: () => <>How many times a day do you <M>like to eat</M>?</>,
    sub: () => "Your calories get split across these. Snacks count.",
    body: (c) => (
      <>
        {chips(c, "mealPattern", [
          { value: "TWO", label: "2 meals" }, { value: "TWO_PLUS_SNACK", label: "2 meals and a snack" }, { value: "THREE", label: "3 meals" },
          { value: "THREE_PLUS_SNACK", label: "3 meals and a snack" }, { value: "THREE_PLUS_TWO_SNACKS", label: "3 meals and 2 snacks" },
        ])}
        <Q>Do you cook ahead?</Q>
        {chips(c, "prep", [
          { value: "DAILY", label: "I cook most days" }, { value: "BATCH_FEW_DAYS", label: "I batch cook for 2 to 3 days" },
          { value: "BATCH_WEEK", label: "I prep the whole work week" }, { value: "BUY", label: "I mostly buy food" },
        ])}
      </>
    ),
    valid: (d) => !!d.mealPattern && !!d.prep,
  },
  {
    id: "fuelcheck", stage: 4,
    title: (d) => {
      const t = computeTargets(toTraining(d));
      return <>For your goal, you need about <M>{t.kcal.toLocaleString("en-GB")} calories</M> and <M>{t.proteinG} g protein</M> a day.</>;
    },
    sub: () => "How close do you think you are right now?",
    body: (c) => {
      const o = [{ value: "noidea", label: "No idea" }, { value: "more", label: "Eating more" }, { value: "less", label: "Eating less" }, { value: "close", label: "Pretty close" }];
      return (
        <>
          <p style={{ fontWeight: 600, margin: "0 0 10px" }}>Calories</p>
          {chips(c, "calorieAwareness", o)}
          <Q>Protein</Q>
          {chips(c, "proteinAwareness", o)}
          <Note>Most people have never tracked either. Week 1 includes a 2-minute meal audit so we start from your real habits.</Note>
        </>
      );
    },
    valid: (d) => !!d.calorieAwareness && !!d.proteinAwareness,
  },
  {
    id: "nutrihard", stage: 4,
    title: () => <>What makes eating well <M>hardest</M>?</>,
    sub: () => "Pick any. We'll plan around these instead of pretending they won't happen.",
    body: (c) => multi(c, "struggles", [
      { value: "FAMILY", label: "I eat what's cooked at home", icon: Users }, { value: "EATING_OUT", label: "I eat out or buy food often", icon: Store },
      { value: "WEEKENDS", label: "Weekends throw me off", icon: CalendarDays }, { value: "EVENINGS", label: "Late-night snacking", icon: Moon },
      { value: "SKIP_BREAKFAST", label: "I skip breakfast, then overeat", icon: Sunrise }, { value: "SUGAR", label: "Soft drinks and sugary snacks", icon: CupSoda },
      { value: "FINE", label: "I'm pretty consistent", icon: BadgeCheck },
    ], { none: "FINE" }),
    valid: (d) => d.struggles.length > 0,
  },
  {
    id: "fasting", stage: 4,
    title: () => <>Interested in <M>intermittent fasting</M>?</>,
    sub: () => "It's optional. It only works if it suits your routine.",
    body: (c) => single(c, "fasting", [
      { value: "YES", label: "Yes, build it in", desc: "We'll fit your meals into an eating window", icon: Clock },
      { value: "CURIOUS", label: "Curious, show me later", desc: "Off for now, we'll offer it at your check-in", icon: CircleHelp },
      { value: "NO", label: "No thanks", desc: "Normal meal timing", icon: X },
    ]),
    valid: (d) => !!d.fasting,
  },
  {
    id: "i-fuel", stage: 4, cta: "Last few questions",
    screen: (c) => {
      const t = computeTargets(toTraining(c.d));
      const tot = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
      return (
        <div className="inter">
          <div className="badge"><Utensils /></div>
          <h1 className="qh">Your fuel, <M>worked out</M>.</h1>
          <p className="qs">Built from your resting burn, your daily movement and {c.d.daysPerWeek} training days a week{c.d.goal === "LOSE_FAT" ? ", minus a deficit sized to your pace" : c.d.goal === "BUILD_MUSCLE" ? ", plus a small surplus for muscle" : ""}.</p>
          <div className="stats">
            <div className="stat fadein" style={{ "--d": ".1s" } as CSSProperties}><div className="v">{t.kcal.toLocaleString("en-GB")}<small>kcal</small></div><div className="k">Daily target</div></div>
            <div className="stat fadein" style={{ "--d": ".2s" } as CSSProperties}><div className="v">{t.proteinG}<small>g</small></div><div className="k">Protein, {Math.round((t.proteinG * 4 / tot) * 100)}% of calories</div></div>
            <div className="stat fadein" style={{ "--d": ".3s" } as CSSProperties}><div className="v">{t.carbsG}<small>g</small></div><div className="k">Carbs</div></div>
            <div className="stat fadein" style={{ "--d": ".4s" } as CSSProperties}><div className="v">{t.fatG}<small>g</small></div><div className="k">Fat</div></div>
          </div>
        </div>
      );
    },
  },
  {
    id: "blockers", stage: 5,
    title: () => <>What usually <M>knocks you off track</M>?</>,
    sub: () => "Pick any. Your plan has a fallback for each one.",
    body: (c) => multi(c, "blockers", [
      { value: "TIME", label: "Not enough time", desc: "Work, family, commute", icon: Clock },
      { value: "MOTIVATION", label: "Motivation fades", desc: "I start strong then drift", icon: BatteryLow },
      { value: "PLATEAU", label: "I stop seeing results", desc: "Progress stalls and I quit", icon: TrendingDown },
      { value: "INJURY", label: "Injuries or pain", desc: "Something flares up", icon: Heart },
      { value: "SWITCH", label: "I keep switching programs", desc: "Always looking for the better one", icon: Shuffle },
      { value: "TRAVEL", label: "Travel or irregular weeks", desc: "Hard to keep a routine", icon: Plane },
    ], { layout: "grid" }),
    valid: (d) => d.blockers.length > 0,
  },
  {
    id: "lk1", stage: 5,
    title: () => <>How much does this <M>sound like you</M>?</>,
    body: (c) => <Likert c={c} field="likertConsistency" text="I know what I should be doing. I just struggle to keep doing it once life gets busy." />,
    valid: (d) => d.likertConsistency > 0,
  },
  {
    id: "lk2", stage: 5,
    title: () => <>And <M>this one</M>?</>,
    body: (c) => <Likert c={c} field="likertGuidance" text="I'd rather someone told me exactly what to do each day than figure it out myself." />,
    valid: (d) => d.likertGuidance > 0,
  },
  {
    id: "tried", stage: 5,
    title: () => <>What have you <M>tried before</M>?</>,
    sub: () => "Pick any. We'll keep what worked and avoid what didn't.",
    body: (c) => multi(c, "tried", [
      { value: "own", label: "My own program" }, { value: "online", label: "An online program" }, { value: "pt", label: "A personal trainer" },
      { value: "count", label: "Calorie counting" }, { value: "mealplan", label: "Meal plans" }, { value: "keto", label: "Keto or low carb" },
      { value: "if", label: "Intermittent fasting" }, { value: "app", label: "Another fitness app" }, { value: "none", label: "Nothing yet" },
    ], { none: "none", chips: true }),
    valid: (d) => d.tried.length > 0,
  },
  {
    id: "motivator", stage: 5,
    title: () => <>Who keeps you <M>accountable</M>?</>,
    sub: () => "People who train with someone stay on plan longer. Later, you'll be able to invite them.",
    body: (c) => single(c, "motivator", [
      { value: "partner", label: "My partner", icon: Heart }, { value: "friend", label: "A friend or gym buddy", icon: Users },
      { value: "family", label: "Family", icon: House }, { value: "team", label: "A team or club", icon: Trophy }, { value: "self", label: "Just me", icon: User },
    ], "grid"),
    valid: (d) => !!d.motivator,
  },
  {
    id: "support", stage: 5,
    title: (d) => <>Last one{firstName(d) ? `, ${firstName(d)}` : ""}. What do you want <M>most from TrackFit</M>?</>,
    body: (c) => single(c, "support", [
      { value: "track", label: "Smart tracking", desc: "Log workouts and meals fast, see real trends", icon: ChartLine },
      { value: "guide", label: "Guidance", desc: "Tell me what to do and adjust it for me", icon: Compass },
      { value: "both", label: "Both", desc: "A plan to follow and the data to prove it works", icon: Sparkle },
    ]),
    valid: (d) => !!d.support,
  },
  // build, plan, start and signup are full screens supplied by OnboardingFlow (see screens.tsx)
  { id: "build", stage: -1, hideActions: true },
  { id: "plan", stage: -1, hideActions: true, wide: true },
  {
    id: "start", stage: -1,
    title: () => <>When do you want to <M>start</M>?</>,
    sub: () => "We'll line up your first session and send a reminder the evening before.",
    valid: (d) => !!d.startChoice && !!d.startDate,
  },
  { id: "signup", stage: -1, hideActions: true, skip: (_d, signedIn) => signedIn },
];

export const STEP_ICONS = { Image, Info };
