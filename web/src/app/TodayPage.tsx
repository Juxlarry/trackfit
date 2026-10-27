import { useMemo, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { ArrowRight, Check, Eye, Lightbulb, Play, Plus, CirclePlus } from "lucide-react";
import { ACTIVITY_TYPES, MEAL_SLOTS, addDaysIso, daysBetween, weekdayOf } from "@engine";
import { ACTIVITY_LOGS, MEAL_DAY, SESSIONS_BETWEEN, WEIGHT_HISTORY } from "../graphql/operations";
import type { ActivityDto, ActivePlanDto, MealDayDto, SessionSummaryDto } from "../graphql/types";
import { usePlan, useUnits } from "../hooks/usePlan";
import { ExerciseFigure } from "../figures/Figures";
import { patOf } from "../figures/figureEngine";
import { Ring } from "../components/ui/Ring";
import { DAYS, DAYS_LONG, dayLabel, dayOfMonth, greeting, localToday } from "../lib/dates";
import { SLOT_LABEL } from "../onboarding/screens";
import { ViewHead } from "./AppLayout";
import { ACT_ICON, useSheets } from "./AppSheets";
import { CYCLE_DAYS, checkinText, cycleWeek, firstSessionFrom, musclesFor, readFlags, sessionOn, sessionsByDate, weekDates } from "./planUtil";

export function Peek({ pattern }: { pattern: string | null }) {
  const p = pattern ?? "squat";
  return <div className="fig-peek" aria-hidden="true"><ExerciseFigure pattern={p} animate /></div>;
}

export function ActivityRow({ a }: { a: ActivityDto }) {
  const Icon = ACT_ICON[a.activityType] ?? ACT_ICON.WALK;
  const parts = [`${a.durationMinutes} min`];
  if (a.distanceKm) parts.push(`${a.distanceKm} km`);
  if (a.avgHeartRate) parts.push(`${a.avgHeartRate} bpm avg`);
  return (
    <div className="li">
      <span className="ic"><Icon /></span>
      <span><span className="t">{ACTIVITY_TYPES[a.activityType]?.label ?? a.activityType}</span><span className="d" style={{ display: "block" }}>{parts.join(", ")}</span></span>
      <span className="r">{a.kcal ? `${a.kcal.toLocaleString("en-GB")} kcal${a.kcalEstimated ? "*" : ""}` : ""}</span>
    </div>
  );
}

function tipFor(plan: ActivePlanDto): [string, string] {
  if (plan.profile.sleepHours < 7) return ["Protect your sleep this week", `You sleep about ${plan.profile.sleepHours} hours. Getting closer to 7 helps recovery more than any supplement, and it keeps hunger in check.`];
  const m = MEAL_SLOTS[plan.profile.mealPattern].length;
  return ["Spread your protein", `Aim for about ${Math.round(plan.targets.proteinG / m)} g of protein in each of your ${m} eating times to reach ${plan.targets.proteinG} g without forcing it.`];
}

export function TodayPage() {
  const { plan, me } = usePlan() as { plan: ActivePlanDto; me: { displayName: string } | null };
  const units = useUnits();
  const sheets = useSheets();
  const navigate = useNavigate();
  const today = useMemo(() => localToday(), []);
  const week = weekDates(today);
  const sessQ = useQuery<{ workoutSessionsBetween: SessionSummaryDto[] }>(SESSIONS_BETWEEN, { variables: { from: week[0], to: week[6] }, fetchPolicy: "cache-and-network" });
  const actQ = useQuery<{ activityLogs: ActivityDto[] }>(ACTIVITY_LOGS, { variables: { from: today, to: today }, fetchPolicy: "cache-and-network" });
  const mealQ = useQuery<{ mealDay: MealDayDto }>(MEAL_DAY, { variables: { date: today } });
  const wQ = useQuery<{ weightHistory: { recordedAt: string }[] }>(WEIGHT_HISTORY, { variables: { limit: 30 }, fetchPolicy: "cache-and-network" });
  const done = sessionsByDate(sessQ.data?.workoutSessionsBetween);
  const flags = readFlags(plan.programId);
  void sheets.flagsVersion;

  const fn = (me?.displayName ?? "").split(/\s+/)[0];
  const s = sessionOn(plan, today);
  const doneToday = done.get(today);
  const before = today < plan.startDate;
  const openSession = (date: string) => { const ss = sessionOn(plan, date); if (ss) navigate(`/session/${ss.templateId ?? "x"}?date=${date}`); };
  const lightGhost = { borderColor: "color-mix(in srgb,var(--hero-fg) 28%,transparent)", color: "var(--hero-fg)" } as CSSProperties;

  let hero;
  if (before) {
    const f = firstSessionFrom(plan, plan.startDate);
    const n = daysBetween(today, plan.startDate);
    hero = (
      <section className="hero-card fadein">
        <div className="hero-pad">
          <p className="k">Your plan starts {n === 1 ? "tomorrow" : `on ${DAYS_LONG[weekdayOf(plan.startDate)]}`}</p>
          <div className="count-big">{n}<span style={{ fontSize: 20, marginLeft: 6 }}>day{n > 1 ? "s" : ""} to go</span></div>
          <p style={{ marginTop: 10 }}>First up: {f.session.name} on {dayLabel(f.date)}. Tick off your Day 1 essentials before then.</p>
          <div className="row"><button type="button" className="cta small-cta" onClick={() => sheets.preview(f.session, f.date)}>Preview {f.session.name}<Eye /></button></div>
        </div>
        <Peek pattern={f.session.exercises[0]?.pattern ?? null} />
      </section>
    );
  } else if (s && !doneToday) {
    hero = (
      <section className="hero-card fadein">
        <div className="hero-pad">
          <p className="k">Today's workout</p>
          <h2>{s.name}</h2>
          <p>{s.warmup.length ? "5 min warm-up, then " : ""}{s.exercises.length} exercises. About {plan.profile.sessionMinutes} minutes.</p>
          <div className="mchips">{musclesFor(s.type).map((m) => <span key={m}>{m}</span>)}</div>
          <div className="row">
            <button type="button" className="cta small-cta pulse" onClick={() => openSession(today)}>Start workout<Play /></button>
            <button type="button" className="ghost" style={lightGhost} onClick={() => sheets.preview(s, today)}>Preview</button>
          </div>
        </div>
        <Peek pattern={s.exercises[0]?.pattern ?? patOf(s.exercises[0]?.name ?? "")} />
      </section>
    );
  } else if (doneToday) {
    hero = (
      <section className="hero-card fadein">
        <div className="hero-pad">
          <p className="k">Done for today</p>
          <h2>{doneToday.templateName ?? s?.name ?? "Workout"} complete.</h2>
          <p>{doneToday.durationMinutes ? `${doneToday.durationMinutes} min long, ` : ""}{doneToday.setCount} sets and {units.toDisplay(doneToday.volumeKg).toLocaleString("en-GB")} {units.unit} lifted.</p>
          <div className="row"><button type="button" className="cta small-cta" onClick={() => sheets.activity()}>Log an extra activity<Plus /></button></div>
        </div>
        <Peek pattern={s?.exercises[0]?.pattern ?? null} />
      </section>
    );
  } else {
    const nx = firstSessionFrom(plan, addDaysIso(today, 1));
    const rest = plan.restDays.find((r) => r.weekday === weekdayOf(today))?.suggestion ?? "A walk or light mobility";
    hero = (
      <section className="hero-card fadein">
        <div className="hero-pad">
          <p className="k">Rest day</p>
          <h2>Recover and move.</h2>
          <p>Suggested: {rest.toLowerCase()}. Easy movement today helps you go harder in {nx.session.name} on {DAYS_LONG[weekdayOf(nx.date)]}.</p>
          <div className="row"><button type="button" className="cta small-cta" onClick={() => sheets.activity("CARDIO")}>Log an activity<Plus /></button></div>
        </div>
        <Peek pattern="lunge" />
      </section>
    );
  }

  const first = firstSessionFrom(plan, plan.startDate);
  const weighed = (wQ.data?.weightHistory ?? []).some((w) => w.recordedAt.slice(0, 10) >= addDaysIso(plan.startDate, -7));
  const ess = [
    { on: weighed, t: "Log today's weigh-in", d: "Your real starting number", go: sheets.weighIn },
    { on: !!plan.profile.reminderTime, t: "Set a workout reminder", d: "Pick a time and we'll nudge you", go: sheets.reminder },
    { on: !!flags.previewed, t: "Preview your first session", d: `${first.session.name} on ${DAYS_LONG[weekdayOf(first.date)]}`, go: () => sheets.preview(first.session, first.date) },
    { on: !!flags.audit, t: "Do your 2-minute meal audit", d: "Tell us what a normal lunch looks like", go: sheets.audit },
  ];
  const essDone = ess.filter((e) => e.on).length;
  const showEss = essDone < 4 && daysBetween(plan.startDate, today) < 7;

  const menu = mealQ.data?.mealDay;
  const eatK = (menu?.items ?? []).filter((m) => m.eaten).reduce((a, m) => a + m.kcal, 0);
  const nextMeal = menu?.items.find((m) => !m.eaten);
  const tip = tipFor(plan);
  const acts = actQ.data?.activityLogs ?? [];
  const elapsed = Math.min(100, Math.max(4, (daysBetween(plan.startDate, today) / CYCLE_DAYS) * 100));

  return (
    <div className="view-in">
      <ViewHead kicker={dayLabel(today)} title={`${greeting()}${fn ? `, ${fn}` : ""}.`} />
      <div className="agrid">
        <div className="acol">
          {hero}
          <section className="card fadein" style={{ "--d": ".08s" } as CSSProperties}>
            <div className="card-h">
              <div><h3>This week</h3><p>Cycle {plan.cycleNumber}, week {cycleWeek(plan, today)} of 6. {plan.splitLabel}.</p></div>
              <Link className="linkbtn" to="/train">Full plan<ArrowRight /></Link>
            </div>
            <div className="wkstrip">
              {week.map((date, k) => {
                const ss = sessionOn(plan, date);
                const dn = done.get(date);
                const missed = ss && !dn && date < today && date >= plan.startDate;
                return (
                  <div key={date} className={`wk${ss ? " train" : ""}${dn ? " done" : ""}${missed ? " missed" : ""}${date === today ? " today" : ""}`}>
                    <span>{DAYS[k]}</span><span className="c">{dn ? <Check /> : dayOfMonth(date)}</span><small>{ss?.name ?? "Rest"}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="card fadein" style={{ "--d": ".14s" } as CSSProperties}>
            <div className="card-h"><div><h3>Also today</h3><p>Cardio, sport or extra work counts toward your week</p></div></div>
            {acts.length ? <div className="list">{acts.map((a) => <ActivityRow key={a.id} a={a} />)}</div>
              : <div className="empty"><CirclePlus /><span>Nothing logged yet. Played football, walked to work or did an abs finisher? Add it so it counts.</span></div>}
            <div className="btnrow" style={{ marginTop: 14 }}><button type="button" className="ghost" onClick={() => sheets.activity()}><Plus />Add activity</button></div>
          </section>
        </div>
        <div className="acol">
          {showEss && (
            <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
              <div className="card-h"><div><h3>Day 1 essentials</h3><p>{essDone} of 4 done. Small steps that set your first week up.</p></div></div>
              <div className="ess">
                <div className="ess-bar"><i style={{ width: `${(essDone / 4) * 100}%` }} /></div>
                {ess.map((e) => (
                  <button key={e.t} type="button" className={e.on ? "on" : ""} aria-pressed={e.on} onClick={e.go}>
                    <span className="bx"><Check /></span><span><span className="et">{e.t}</span><span className="ed">{e.d}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="card fadein" style={{ "--d": ".16s" } as CSSProperties}>
            <div className="card-h">
              <div><h3>Fuel today</h3><p>{menu ? (nextMeal ? `Next: ${SLOT_LABEL[nextMeal.slot]}, ${nextMeal.name.toLowerCase()}` : "All planned meals eaten") : "Loading your menu"}</p></div>
              <Link className="linkbtn" to="/fuel">Open<ArrowRight /></Link>
            </div>
            <div className="fuelrow">
              <Ring value={eatK} max={plan.targets.kcal} big={eatK.toLocaleString("en-GB")} small={`of ${plan.targets.kcal.toLocaleString("en-GB")} kcal`} />
              <div className="mbars">
                {(menu?.items ?? []).map((m) => <div className="mb" key={m.slotIndex}><div className="l"><span>{SLOT_LABEL[m.slot]}</span><b>{m.eaten ? "Eaten" : m.kcal.toLocaleString("en-GB")}</b></div></div>)}
              </div>
            </div>
          </section>
          <div className="tip fadein" style={{ "--d": ".2s" } as CSSProperties}>
            <span className="ic"><Lightbulb /></span><div><b>{tip[0]}</b><p>{tip[1]}</p></div>
          </div>
          <section className="card fadein" style={{ "--d": ".24s" } as CSSProperties}>
            <div className="card-h"><div><h3>Cycle check-in</h3><p>{checkinText(plan, today)}</p></div></div>
            <div className="ess-bar" style={{ margin: 0 }}><i style={{ width: `${elapsed}%` }} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
