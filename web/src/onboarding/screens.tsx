import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation } from "@apollo/client/react";
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Circle, CircleAlert, Mail, Pencil, Play, Sunrise, Zap,
} from "lucide-react";
import { MEAL_SLOTS, buildWeek, generatePlan, startSentence, type MealSlot } from "@engine";
import { useAuth } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS, authErrorMessage, signInWithGoogle, signUpWithEmail } from "../firebase";
import { DEV_CREATE_USER } from "../graphql/operations";
import { AdaptationList, DaysControl, ExerciseList, RangeNote, useGuide } from "../components/plan/PlanBits";
import { OptionList } from "../components/ui/Options";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { DAYS, DAYS_LONG, addDaysIso, dateLong, dayLabel, weekdayOf } from "../lib/dates";
import { firstName, toDiet, toTraining, type Draft } from "./draft";
import { ProjectionChart } from "./ProjectionChart";
import { kgFmt, kgShow, type StepCtx } from "./steps";

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n: number) => n.toLocaleString("en-GB");
export const SLOT_LABEL: Record<MealSlot, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" };

// ── Build loader ──────────────────────────────────────────────────────────

const BSTEPS: [string, string][] = [
  ["Reading your starting point", "Resting burn, body composition and daily movement"],
  ["Setting your targets", "Calories, protein and a pace you can hold"],
  ["Designing your sessions", "Exercises for your setup, with swaps for anything sore"],
  ["Planning your meals", "Your favourite dishes, sized to your numbers"],
  ["Scheduling your 6 weeks", "Progression, rest days and your first check-in"],
];

type LoaderQ = { field: "energy" | "warmup"; title: string; sub: string; options: { value: string; label: string }[] };
const LOADER_QS: Record<number, LoaderQ> = {
  2: { field: "energy", title: "How's your energy when it's time to train?", sub: "We'll set your first-week loads with this.",
    options: [{ value: "high", label: "High, I'm usually ready" }, { value: "depends", label: "Depends on the day" }, { value: "low", label: "Low, I'm often drained" }] },
  4: { field: "warmup", title: "Add a 5-minute warm-up to each session?", sub: "Takes time from your session length, protects your joints.",
    options: [{ value: "yes", label: "Yes, include it" }, { value: "no", label: "No, I'll warm up myself" }] },
};

export function BuildLoader({ c }: { c: StepCtx }) {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [question, setQuestion] = useState<LoaderQ | null>(null);
  const asked = useRef<Set<number>>(new Set());
  const { d, set, next } = c;

  useEffect(() => {
    if (question) return;
    if (step >= BSTEPS.length) {
      const t = window.setTimeout(next, 500);
      return () => window.clearTimeout(t);
    }
    if (LOADER_QS[step] && pct >= 40 && !asked.current.has(step)) {
      asked.current.add(step);
      setQuestion(LOADER_QS[step]);
      return;
    }
    const spd = reduce() ? 25 : 2.2;
    const t = window.setTimeout(() => {
      const p = Math.min(100, pct + spd + Math.random() * spd);
      if (p >= 100) { setStep(step + 1); setPct(0); } else setPct(p);
    }, step === 0 && pct === 0 ? 500 : 40);
    return () => window.clearTimeout(t);
  }, [step, pct, question, next]);

  const answer = (v: string) => {
    if (!question) return;
    set(question.field === "warmup" ? { warmup: v === "yes" } : { energy: v });
    window.setTimeout(() => setQuestion(null), reduce() ? 50 : 320);
  };
  const current = question?.field === "warmup" ? (d.warmup === null ? "" : d.warmup ? "yes" : "no") : d.energy;

  return (
    <div className="build">
      <h1 className="qh">Building {firstName(d) ? `${firstName(d)}'s` : "your"} <mark>plan</mark>.</h1>
      <p className="qs">Usually takes about ten seconds.</p>
      <div style={{ marginTop: 28 }}>
        {BSTEPS.map(([h, p], k) => {
          const w = k < step ? 100 : k === step ? pct : 0;
          return (
            <div key={h} className={`bstep${k < step ? " done" : ""}`}>
              <div className="bstep-h"><span className="st"><Check /></span>{h}<span className="pct mono">{Math.round(w)}%</span></div>
              <p>{p}</p>
              <div className="bbar"><i style={{ width: `${w}%` }} /></div>
            </div>
          );
        })}
      </div>
      <Sheet open={!!question} onClose={() => answer(question?.options[0].value ?? "")} label={question?.title ?? ""}>
        {question && (
          <>
            <h3>{question.title}</h3>
            <p>{question.sub}</p>
            <OptionList options={question.options} selected={[current]} onPick={answer} />
          </>
        )}
      </Sheet>
    </div>
  );
}

// ── Plan reveal ───────────────────────────────────────────────────────────

export function PlanReveal({ c }: { c: StepCtx }) {
  const { d, set, next, go } = c;
  const toast = useToast();
  const guide = useGuide();
  const base = d.daysPerWeek;
  const n = d.revealDays || base;
  const training = useMemo(() => toTraining(d), [d]);
  const plan = useMemo(() => generatePlan(training, toDiet(d), d.startDate || c.today, n), [training, d, c.today, n]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const kcal = useCountTo(plan.targets.kcal);
  const t = plan.targets;
  const bySession = new Map(plan.week.sessions.map((s) => [s.weekday, s]));
  const restBy = new Map(plan.week.restDays.map((r) => [r.weekday, r.suggestion]));
  const first = plan.week.sessions[0];

  const change = (nv: number) => {
    const before = buildWeek(training, n).sessions;
    const after = buildWeek(training, nv).sessions;
    const name = (list: typeof before, k: number) => list.find((s) => s.weekday === k)?.name ?? "";
    setChanged(new Set([0, 1, 2, 3, 4, 5, 6].filter((k) => name(before, k) !== name(after, k))));
    set({ revealDays: nv === base ? 0 : nv });
    toast(`${nv > n ? "Added" : "Removed"} a training day. Your week is now ${buildWeek(training, nv).splitLabel.toLowerCase()}.`);
  };

  return (
    <div className="plan">
      <div className="plan-hero">
        <div className="fadein">
          <h1>{firstName(d) ? `${firstName(d)}, your` : "Your"} plan is ready.</h1>
          <p>
            {plan.projection && d.targetWeightKg != null && <>On track for <b>{kgFmt(d)(d.targetWeightKg)}</b> by {dateLong(plan.projection.endDate)}. </>}
            Cycle 1 runs 6 weeks, then a short check-in builds cycle 2 from your results.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button className="cta pulse" type="button" onClick={next}>Save my plan and start<ArrowRight /></button>
          </div>
        </div>
        <div className="fadein" style={{ "--d": ".15s" } as CSSProperties}>
          {plan.projection && d.targetWeightKg != null ? (
            <ProjectionChart compact startKg={d.weightKg} targetKg={d.targetWeightKg} weeks={plan.projection.weeks} fmt={kgFmt(d)} toDisplay={kgShow(d)} />
          ) : (
            <div className="stats" style={{ marginTop: 0 }}>
              <div className="stat"><div className="v">6<small>weeks</small></div><div className="k">Cycle 1</div></div>
              <div className="stat"><div className="v">{n}<small>days</small></div><div className="k">Per week</div></div>
            </div>
          )}
        </div>
      </div>

      <div className="pgrid">
        <div className="pcol">
          <section className="card c-week fadein" style={{ "--d": ".2s" } as CSSProperties} aria-labelledby="wk-h">
            <div className="card-h">
              <div><h3 id="wk-h">This week</h3><p>{plan.week.splitLabel}, {training.sessionMinutes} min sessions</p></div>
              <DaysControl value={n} min={plan.dayRange.min} max={plan.dayRange.max} onChange={change} />
            </div>
            <RangeNote value={n} min={plan.dayRange.min} max={plan.dayRange.max} base={base} />
            <div className="sched">
              {DAYS.map((day, k) => {
                const s = bySession.get(k);
                const cls = changed.has(k) ? " changed" : "";
                if (!s) {
                  return (
                    <div key={`${k}-${n}`} className={`srow rest${cls}`}>
                      <div className="day">{day}<b>{k + 1}</b></div>
                      <div><div className="nm">{restBy.get(k) ?? "Rest"}</div><div className="meta">Recovery day</div></div><span />
                    </div>
                  );
                }
                const swaps = s.exercises.filter((e) => e.swapped).length;
                const x = open.has(k);
                return (
                  <div key={`${k}-${n}`} className={`srow${cls}${x ? " x" : ""}`}>
                    <div className="day">{day}<b>{k + 1}</b></div>
                    <div>
                      <div className="nm">{s.name}{swaps > 0 && <span className="tag swap">{swaps} swap{swaps > 1 ? "s" : ""}</span>}</div>
                      <div className="meta">{s.warmup.length ? "Warm-up, " : ""}{s.exercises.length} exercises, {training.sessionMinutes} min</div>
                    </div>
                    <button className="open" type="button" aria-label={`Show exercises for ${s.name}`} aria-expanded={x}
                      onClick={() => setOpen((o) => { const nx = new Set(o); if (nx.has(k)) nx.delete(k); else nx.add(k); return nx; })}><ChevronDown /></button>
                    <div className="exlist">{x && <ExerciseList warmup={s.warmup} exercises={s.exercises} onGuide={guide.open} />}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="card c-adapt fadein" style={{ "--d": ".3s" } as CSSProperties} aria-labelledby="ad-h">
            <div className="card-h"><div><h3 id="ad-h">Built around your answers</h3><p>What changed because of what you told us</p></div></div>
            <AdaptationList items={plan.adaptations} />
          </section>
        </div>
        <div className="pcol">
          <section className="card c-fuel fadein" style={{ "--d": ".25s" } as CSSProperties} aria-labelledby="fu-h">
            <div className="card-h"><div><h3 id="fu-h">Daily fuel</h3><p>Updates when your training days change</p></div></div>
            <div className="kcal"><span className="v">{fmt(kcal)}</span><span className="u">kcal a day</span></div>
            <div className="macro-bar" aria-hidden="true">
              <i className="m-p" style={{ flexGrow: t.proteinG * 4 }} /><i className="m-c" style={{ flexGrow: t.carbsG * 4 }} /><i className="m-f" style={{ flexGrow: t.fatG * 9 }} />
            </div>
            <div className="macros">
              <div><i className="m-p" />Protein<b>{t.proteinG} g</b></div><div><i className="m-c" />Carbs<b>{t.carbsG} g</b></div><div><i className="m-f" />Fat<b>{t.fatG} g</b></div>
            </div>
            <div style={{ marginTop: 22 }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px", fontSize: 14 }}>Sample day <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>portions scaled to your target</span></p>
              {plan.sampleMenu.items.map((m) => (
                <div className="meal" key={m.slotIndex}><span className="slot">{SLOT_LABEL[m.slot]}</span><span className="nm">{m.name}</span><span className="kc">{fmt(m.kcal)} kcal<br />{m.proteinG} g P</span></div>
              ))}
              {plan.sampleMenu.proteinShortfallG > 15 && (
                <div className="meal"><span className="slot">Top-up</span><span className="nm">{d.dietPattern === "VEGAN" ? "Soy milk or a plant protein shake" : "Greek yogurt or a protein shake"}</span><span className="kc">+{plan.sampleMenu.proteinShortfallG} g P</span></div>
              )}
              <p className="help" style={{ marginTop: 10 }}>{MEAL_SLOTS[toDiet(d).mealPattern].length} eating times a day. Swap any meal from the Fuel tab.</p>
            </div>
          </section>
          <section className="card c-ess fadein" style={{ "--d": ".35s" } as CSSProperties} aria-labelledby="es-h">
            <div className="card-h"><div><h3 id="es-h">What happens next</h3><p>Three quick steps to your first session</p></div></div>
            <div className="list">
              {([[CalendarDays, "Pick your start day", "Today, tomorrow or a date that suits you"], [Mail, "Save your plan", "With Google or your email, so it syncs to your phone"],
                [Play, "Start training", first ? `${first.name} first. Warm-ups, form guides and a rest timer built in` : "Warm-ups, form guides and a rest timer built in"]] as const).map(([Icon, h, p]) => (
                <div className="li" key={h}><span className="ic"><Icon /></span><span><span className="t">{h}</span><span className="d" style={{ display: "block" }}>{p}</span></span><span /></div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="plan-foot">
        <button className="ghost" type="button" onClick={() => go("goal")}><Pencil />Change my answers</button>
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Changing answers regenerates both plans. Nothing is saved until you create your account.</span>
      </div>
      {guide.element}
    </div>
  );
}

function useCountTo(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduce() || from.current === target) { from.current = target; setV(target); return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(start + (target - start) * e));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

// ── Start date ────────────────────────────────────────────────────────────

export function startLineFor(d: Draft, today: string): string {
  const w = buildWeek(toTraining(d), d.revealDays || d.daysPerWeek);
  return startSentence(today, d.startDate, w.sessions);
}

export function StartDateBody({ c }: { c: StepCtx }) {
  const { d, set, today } = c;
  const w = buildWeek(toTraining(d), d.revealDays || d.daysPerWeek);
  const firstLine = (from: string) => {
    for (let k = 0; k < 7; k++) {
      const s = w.sessions.find((x) => x.weekday === weekdayOf(addDaysIso(from, k)));
      if (s) return k === 0 ? `${s.name} that day` : `${s.name} on ${DAYS_LONG[s.weekday]}`;
    }
    return "Full body";
  };
  const tomorrow = addDaysIso(today, 1);
  const pick = (v: string) => {
    const choice = v as Draft["startChoice"];
    set({ startChoice: choice, startDate: choice === "TODAY" ? today : choice === "TOMORROW" ? tomorrow : d.startChoice === "DATE" ? d.startDate : "" });
  };
  return (
    <>
      <OptionList options={[
        { value: "TODAY", label: "Today", desc: `${dayLabel(today)}. First session: ${firstLine(today)}.`, icon: Zap },
        { value: "TOMORROW", label: "Tomorrow", desc: `${dayLabel(tomorrow)}. First session: ${firstLine(tomorrow)}.`, icon: Sunrise },
        { value: "DATE", label: "Pick a date", desc: "Any day in the next 4 weeks", icon: CalendarDays },
      ]} selected={[d.startChoice]} onPick={pick} />
      {d.startChoice === "DATE" && (
        <div className="field" style={{ marginTop: 16, maxWidth: 300 }}>
          <label htmlFor="f-date">Start date</label>
          <input className="txt" type="date" id="f-date" min={addDaysIso(today, 2)} max={addDaysIso(today, 28)} value={d.startDate}
            onChange={(e) => set({ startDate: e.target.value })} />
        </div>
      )}
      {d.startChoice && d.startDate && <div className="note"><CalendarDays /><span>{startLineFor(d, today)}</span></div>}
    </>
  );
}

// ── Sign-up ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const TYPO: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gamil.com": "gmail.com", "gmal.com": "gmail.com",
  "yaho.com": "yahoo.com", "hotmial.com": "hotmail.com", "outlok.com": "outlook.com", "iclod.com": "icloud.com",
};
const pwRules = (p: string) => [p.length >= 8, /\d/.test(p), /[a-z]/i.test(p)];

/** Sign-up at the peak: after the plan reveal, before anything is saved. */
export function SignUp({ c, submit }: { c: StepCtx; submit: (email: string | null, method: "google" | "email") => Promise<void> }) {
  const { d, set } = c;
  const { setDevUserId } = useAuth();
  const [devCreateUser] = useMutation<{ devCreateUser: { id: string } }>(DEV_CREATE_USER);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [busy, setBusy] = useState<"" | "google" | "email">("");
  const [error, setError] = useState<string | null>(null);
  const email = d.email.trim();
  const dom = (email.split("@")[1] ?? "").toLowerCase();
  const fix = TYPO[dom] ? `${email.split("@")[0]}@${TYPO[dom]}` : null;
  const rules = pwRules(pw);
  const ok = EMAIL_RE.test(email) && rules.every(Boolean);

  const devAccount = async () => {
    const res = await devCreateUser({ variables: { displayName: firstName(d) || "TrackFit athlete" } });
    const id = res.data?.devCreateUser.id;
    if (!id) throw new Error("Couldn't create a dev account.");
    setDevUserId(id);
  };

  const google = async () => {
    setError(null);
    setBusy("google");
    try {
      let mail: string | null;
      if (DEV_AUTH_BYPASS) {
        await devAccount();
        mail = EMAIL_RE.test(email) ? email : `${(firstName(d) || "you").toLowerCase().replace(/[^a-z0-9]/g, "")}@gmail.com`;
      } else {
        mail = (await signInWithGoogle()).email;
      }
      set({ email: mail ?? "" });
      await submit(mail, "google");
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy("");
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBlurred(true);
    if (!ok || busy) return;
    setError(null);
    setBusy("email");
    try {
      if (DEV_AUTH_BYPASS) await devAccount();
      else await signUpWithEmail(email, pw);
      await submit(email, "email");
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy("");
    }
  };

  return (
    <form onSubmit={create} noValidate>
      <h1 className="qh">Save <mark>your plan</mark>{firstName(d) ? `, ${firstName(d)}` : ""}.</h1>
      <p className="qs">A free account keeps your plan, workouts and progress safe, and syncs them to your phone.</p>
      <div className="qb">
        <div className="auth stagger">
          <button type="button" className="gbtn" style={{ "--i": 0 } as CSSProperties} onClick={google} disabled={!!busy}>
            {busy === "google" ? <span className="spin" aria-hidden="true" /> : <span className="g" aria-hidden="true">G</span>}Continue with Google
          </button>
          <div className="or" style={{ "--i": 1 } as CSSProperties}>or sign up with email</div>
          <div className="field" style={{ "--i": 2 } as CSSProperties}>
            <label htmlFor="f-email">Email address</label>
            <input className="txt" id="f-email" type="email" autoComplete="email" inputMode="email" placeholder="ama@gmail.com"
              value={d.email} onChange={(e) => set({ email: e.target.value })} onBlur={() => setBlurred(true)} />
            {fix ? (
              <p className="suggest">Did you mean <button type="button" onClick={() => set({ email: fix })}>{fix}</button>?</p>
            ) : blurred && email && !EMAIL_RE.test(email) ? (
              <div className="err" role="alert"><CircleAlert /><span>That doesn't look like a full email address, for example ama@gmail.com.</span></div>
            ) : null}
            <p className="help">Use a <b>real inbox you can open now</b>. We'll send a link to confirm it, and it's how you get back to your plan on any device.</p>
          </div>
          <div className="field" style={{ "--i": 3 } as CSSProperties}>
            <label htmlFor="f-pw">Create a password</label>
            <div className="pw">
              <input className="txt" id="f-pw" type={showPw ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(!showPw)}>{showPw ? "Hide" : "Show"}</button>
            </div>
            <div className="rules">
              {(["8+ characters", "A number", "A letter"] as const).map((r, k) => (
                <span key={r} className={rules[k] ? "ok" : ""}>{rules[k] ? <Check /> : <Circle />}{r}</span>
              ))}
            </div>
          </div>
          {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
          <p className="fine" style={{ "--i": 4 } as CSSProperties}>By creating an account you agree to the Terms and Privacy Policy. Your health answers stay private and are never shared.</p>
        </div>
      </div>
      <div className="actions inline">
        <button className="cta" type="submit" disabled={!ok || !!busy}>
          {busy === "email" ? <><span className="spin" aria-hidden="true" />Creating your account</> : <>Create my account<ArrowRight /></>}
        </button>
        {DEV_AUTH_BYPASS && <span className="hint">Dev mode: no real account is created</span>}
      </div>
    </form>
  );
}
