import { useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { Check, ChevronDown, ClipboardList, History, Plus } from "lucide-react";
import { MY_PLAN, SESSIONS_BETWEEN, SET_TRAINING_DAYS } from "../graphql/operations";
import type { SessionSummaryDto } from "../graphql/types";
import { usePlan } from "../hooks/usePlan";
import { ExerciseFigure } from "../figures/Figures";
import { DaysControl, ExerciseList, RangeNote } from "../components/plan/PlanBits";
import { useToast } from "../components/ui/Toast";
import { DAYS, dayOfMonth, localToday } from "../lib/dates";
import { ViewHead } from "./AppLayout";
import { ACT_TILES, useSheets } from "./AppSheets";
import { cycleWeek, sessionOn, sessionsByDate, weekDates } from "./planUtil";

const PROG: [string, string][] = [
  ["Week 1", "Find your working weights. Stop each set with 2 to 3 reps left."], ["Week 2", "Same weights, add 1 to 2 reps per set."],
  ["Week 3", "Add 2.5 kg to main lifts, 1 kg to dumbbells."], ["Week 4", "One extra set for your priority muscles."],
  ["Week 5", "Hardest week. Last sets close to failure."], ["Week 6", "Lighter week, then your check-in."],
];

export function TrainPage() {
  const plan = usePlan().plan!;
  const sheets = useSheets();
  const toast = useToast();
  const navigate = useNavigate();
  const today = useMemo(() => localToday(), []);
  const week = weekDates(today);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sessQ = useQuery<{ workoutSessionsBetween: SessionSummaryDto[] }>(SESSIONS_BETWEEN, { variables: { from: week[0], to: week[6] }, fetchPolicy: "cache-and-network" });
  const done = sessionsByDate(sessQ.data?.workoutSessionsBetween);
  const [setDays, { loading }] = useMutation(SET_TRAINING_DAYS, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  const cw = cycleWeek(plan, today);

  const change = async (n: number) => {
    try {
      await setDays({ variables: { days: n } });
      toast(`${n > plan.daysPerWeek ? "Added" : "Removed"} a training day. Your week is now ${n} days.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't change your days."); }
  };

  const guides = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of plan.sessions) for (const e of s.exercises) if (e.pattern && !seen.has(e.name)) seen.set(e.name, e.pattern);
    return [...seen];
  }, [plan.sessions]);

  return (
    <div className="view-in">
      <ViewHead kicker={`Cycle ${plan.cycleNumber}, week ${cw} of 6`} title="Train" />
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <div className="card-h">
              <div><h3>This week</h3><p>{plan.splitLabel}, {plan.profile.sessionMinutes} min sessions</p></div>
              <DaysControl value={plan.daysPerWeek} min={plan.dayRange.min} max={plan.dayRange.max} onChange={(n) => void change(n)} busy={loading} />
            </div>
            <RangeNote value={plan.daysPerWeek} min={plan.dayRange.min} max={plan.dayRange.max} base={plan.onboardingDays} />
            <div className="sched">
              {week.map((date, k) => {
                const s = sessionOn(plan, date);
                if (!s) {
                  const rest = plan.restDays.find((r) => r.weekday === k)?.suggestion ?? "Rest";
                  return (
                    <div key={date} className="srow rest">
                      <div className="day">{DAYS[k]}<b>{dayOfMonth(date)}</b></div>
                      <div><div className="nm">{rest}</div><div className="meta">Recovery day</div></div>
                      <span className="acts-r"><button type="button" className="linkbtn" onClick={() => sheets.activity("CARDIO", date)}><Plus />Log</button></span>
                    </div>
                  );
                }
                const dn = done.get(date);
                const isT = date === today;
                const swaps = s.exercises.filter((e) => e.swapped).length;
                const x = open.has(date);
                const go = () => navigate(`/session/${s.templateId ?? "x"}?date=${date}`);
                let act;
                if (dn) act = <span className="donec"><Check />Done</span>;
                else if (date < plan.startDate) act = <span className="meta" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Before start</span>;
                else if (date < today) act = <button type="button" className="linkbtn" onClick={go}>Log it</button>;
                else if (isT) act = <button type="button" className="startb" onClick={go}>Start</button>;
                else act = <button type="button" className="linkbtn" onClick={() => sheets.preview(s, date)}>Preview</button>;
                return (
                  <div key={date} className={`srow${isT ? " today-row" : ""}${x ? " x" : ""}`}>
                    <div className="day">{DAYS[k]}<b>{dayOfMonth(date)}</b></div>
                    <div>
                      <div className="nm">{s.name}{swaps > 0 && <span className="tag swap">{swaps} swap{swaps > 1 ? "s" : ""}</span>}</div>
                      <div className="meta">{s.warmup.length ? "Warm-up, " : ""}{s.exercises.length} exercises, {plan.profile.sessionMinutes} min</div>
                    </div>
                    <span className="acts-r">
                      {act}
                      <button className="open" type="button" aria-label={`Show exercises for ${s.name}`} aria-expanded={x}
                        onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(date)) n.delete(date); else n.add(date); return n; })}><ChevronDown /></button>
                    </span>
                    <div className="exlist">{x && <ExerciseList warmup={s.warmup} exercises={s.exercises} onGuide={sheets.guide} />}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
            <div className="card-h"><div><h3>Exercise guides</h3><p>Tap any exercise for form, execution and the mistake to avoid</p></div></div>
            <div className="guides">
              {guides.map(([name, pat]) => <GuideTile key={name} name={name} pattern={pat} onOpen={() => sheets.guide(name, pat)} />)}
            </div>
          </section>
        </div>
        <div className="acol">
          <section className="card fadein" style={{ "--d": ".06s" } as CSSProperties}>
            <div className="card-h"><div><h3>Add an activity</h3><p>Counts toward your week and your progress</p></div></div>
            <div className="acts">
              {ACT_TILES.map(([k, Icon, t, s]) => (
                <button key={k} type="button" className="act-tile" onClick={() => sheets.activity(k)}><span className="ic"><Icon /></span><span>{t}<br /><small>{s}</small></span></button>
              ))}
            </div>
          </section>
          <section className="card fadein" style={{ "--d": ".12s" } as CSSProperties}>
            <div className="card-h"><div><h3>How your 6 weeks progress</h3><p>Weights and reps rise from what you log, not from guesses</p></div></div>
            <div className="prog-w">
              {PROG.map(([w, t], k) => <div key={w} className={`pw-c${k + 1 === cw ? " now" : k + 1 < cw ? " past" : ""}`}><b>{w}</b>{t}</div>)}
            </div>
          </section>
          <section className="card fadein" style={{ "--d": ".18s" } as CSSProperties}>
            <div className="card-h"><div><h3>Your own workouts</h3><p>Build custom templates and see every session you've logged</p></div></div>
            <div className="list">
              <Link className="li" to="/templates"><span className="ic"><ClipboardList /></span><span className="t">Custom templates</span><span /></Link>
              <Link className="li" to="/workouts"><span className="ic"><History /></span><span className="t">Workout history</span><span /></Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function GuideTile({ name, pattern, onOpen }: { name: string; pattern: string; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" className="gtile" onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className="thumb"><ExerciseFigure pattern={pattern} animate={hover} /></span>{name}
    </button>
  );
}
