import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { Check, ChevronRight, Clock, Dumbbell, Play, Plus, Square, Trophy } from "lucide-react";
import { ACTIVITY_TYPES } from "@engine";
import { CLUB_CHALLENGES, PENDING_CLUB_CHALLENGES } from "../../graphql/operations";
import type { ClubChallengeDto, ClubDto, MyClubChallengeDto } from "../../graphql/types";
import { usePlan, useUnits } from "../../hooks/usePlan";
import { KIND_ICON, KIND_NAME } from "../../lib/challengeKinds";
import { cadenceText, challengeProgress, challengeRule, clockText, dateSpan } from "../../lib/clubFormat";
import { localToday } from "../../lib/dates";
import { readJson, writeJson } from "../../lib/storage";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { Sheet } from "../../components/ui/Sheet";
import { useSheets } from "../AppSheets";
import { ChallengeProof, WinCard } from "./ChallengeProof";
import { useMyChallenges, useRespond } from "./challengeHooks";
import { MediaView } from "./PostBits";
import { ChallengeForm } from "./ChallengeForm";

/**
 * Coach challenges on the web (README "Clubs v1", "Coach challenges"):
 * the club's Challenges tab, the daily pop-up, Today's card, proof and the
 * win post. The challenge page is ChallengePage.tsx; the form is ChallengeForm.tsx.
 */

// ── Workout challenges: the clock, then proof ──────────────────────────

/** A workout challenge: its exercises, a countdown (or a stopwatch), then proof. */
export function ChallengeWorkoutSheet({ challenge: c, date, onDone }: { challenge: ClubChallengeDto; date: string; onDone: () => void }) {
  const units = useUnits();
  const [phase, setPhase] = useState<"ready" | "going" | "proof">("ready");
  const [t0, setT0] = useState(0);
  const [now, setNow] = useState(0);
  const [taken, setTaken] = useState<number | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  useEffect(() => {
    if (phase !== "going") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  if (phase === "proof") {
    const w = c.exercises.filter((e) => Number(weights[e.exerciseId]) > 0)
      .map((e) => ({ exerciseId: e.exerciseId, weightKg: Math.round(units.fromDisplay(Number(weights[e.exerciseId])) * 100) / 100 }));
    return <ChallengeProof challenge={c} date={date} result={{ seconds: taken, weights: w }} onDone={onDone} />;
  }
  const elapsed = phase === "going" ? Math.max(0, (now - t0) / 1000) : 0;
  const limit = c.timeLimitMinutes ? c.timeLimitMinutes * 60 : null;
  const left = limit != null ? limit - elapsed : null;
  return (
    <>
      <p className="sh-k">Challenge · {c.clubName}</p>
      <h3>{c.title}</h3>
      {c.description && <p>{c.description}</p>}
      <div className="rt-log">
        {c.exercises.map((e) => (
          <div key={e.exerciseId} className="rt-log-row">
            <span><b>{e.name}</b><small>{e.sets} × {e.reps}</small></span>
            <label className="sr-only" htmlFor={`cw-${e.exerciseId}`}>{e.name} weight ({units.unit})</label>
            <input id={`cw-${e.exerciseId}`} className="txt" type="number" inputMode="decimal" min={0} placeholder={`${units.unit}, optional`} value={weights[e.exerciseId] ?? ""} onChange={(ev) => setWeights((w) => ({ ...w, [e.exerciseId]: ev.target.value }))} />
          </div>
        ))}
      </div>
      <div className={`ch-clock${left != null && left < 0 ? " over" : ""}`} role="timer" aria-live="off">
        <Clock />
        {phase === "ready"
          ? <span>{limit ? `${c.timeLimitMinutes} minutes on the clock` : "A stopwatch times you"}</span>
          : <b>{left != null ? (left >= 0 ? `${clockText(left)} left` : `${clockText(-left)} over`) : clockText(elapsed)}</b>}
      </div>
      {phase === "ready" ? (
        <>
          <button type="button" className="cta" style={{ marginTop: 14 }} onClick={() => { const t = Date.now(); setT0(t); setNow(t); setPhase("going"); }}>Start the clock<Play /></button>
          <button type="button" className="linkbtn" style={{ marginTop: 10 }} onClick={() => { setTaken(null); setPhase("proof"); }}>Already done it? Add your result</button>
        </>
      ) : (
        <button type="button" className="cta" style={{ marginTop: 14 }} onClick={() => { setTaken(Math.max(1, Math.round(elapsed))); setPhase("proof"); }}>Done<Square /></button>
      )}
      <p className="help">It's logged as a workout too, with every set at the reps shown. Leave a weight empty for bodyweight.</p>
    </>
  );
}

// ── Doing a challenge from Today, the club, or its page ─────────────────

/** Where a challenge is done: the workout sheet, the activity logger, Fuel, or straight to proof. */
export function useChallengeAction(date: string) {
  const sheets = useSheets();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<ClubChallengeDto | null>(null);
  const [proof, setProof] = useState<ClubChallengeDto | null>(null);
  const [win, setWin] = useState<{ c: ClubChallengeDto; draft: string } | null>(null);
  const label = (c: ClubChallengeDto) => (c.kind === "WORKOUT" ? "Start" : c.kind === "ACTIVITY" ? "Log activity" : c.kind === "FOOD" && c.foodKey ? "Log it" : c.kind === "WATER" ? "Log water" : "Send proof");
  const go = (c: ClubChallengeDto) => {
    if (c.kind === "WORKOUT") setWorkout(c);
    else if (c.kind === "ACTIVITY") {
      const kind = c.activityType ? ACTIVITY_TYPES[c.activityType]?.kind : "CARDIO";
      sheets.activity(kind === "SPORT" ? "SPORT" : "CARDIO", date, c.activityType ?? undefined, c.id);
    } else if (c.kind === "FOOD" && c.foodKey) navigate(`/fuel?log=${c.id}`);
    else if (c.kind === "WATER") navigate("/fuel");
    else setProof(c);
  };
  const sheetsEl = (
    <>
      <Sheet open={!!workout} onClose={() => setWorkout(null)} label="Challenge workout">
        {workout && <ChallengeWorkoutSheet challenge={workout} date={date} onDone={() => setWorkout(null)} />}
      </Sheet>
      <Sheet open={!!proof} onClose={() => setProof(null)} label="Send proof">
        {proof && <ChallengeProof challenge={proof} date={date} onDone={() => setProof(null)} />}
      </Sheet>
      <Sheet open={!!win} onClose={() => setWin(null)} label="Post your win">
        {win && <WinCard challenge={win.c} draft={win.draft} onDone={() => setWin(null)} />}
      </Sheet>
    </>
  );
  return { label, go, proof: setProof, win: (c: ClubChallengeDto, draft: string) => setWin({ c, draft }), sheets: sheetsEl };
}

/** One joined challenge: what's next for it. */
function ChallengeStatus({ m, action }: { m: MyClubChallengeDto; action: ReturnType<typeof useChallengeAction> }) {
  const c = m.challenge;
  if (m.completed && m.winDraft) return <button type="button" className="ghost" onClick={() => action.win(c, m.winDraft!)}><Trophy />Post win</button>;
  if (m.completed) return <span className="tag">Finished</span>;
  if (m.doneForPeriod) return <span className="tag">Proof sent</span>;
  return <button type="button" className="ghost" onClick={() => action.go(c)}>{action.label(c)}</button>;
}

/** Today: the challenges you've taken on, with what to do next. */
export function TodayChallenges() {
  const today = localToday();
  const imperial = useUnits().unit === "lb";
  const list = useMyChallenges(today);
  const action = useChallengeAction(today);
  if (!list.length) return null;
  return (
    <section className="card fadein today-rt">
      <div className="card-h"><div><h3>Your challenges</h3><p>Proof each {list.every((m) => m.challenge.cadence === "WEEKLY") ? "week" : "day"}, a photo or video</p></div></div>
      <div className="list">
        {list.map((m) => {
          const c = m.challenge;
          const Icon = KIND_ICON[c.kind];
          return (
            <div key={c.id} className="li">
              <span className={`ic${m.doneForPeriod || m.completed ? " done" : ""}`}>{m.doneForPeriod || m.completed ? <Check /> : <Icon />}</span>
              <span>
                <Link to={`/clubs/${c.clubId}/challenges/${c.id}`} className="t">{c.title}</Link>
                <span className="d" style={{ display: "block" }}>{c.clubName} · {challengeRule(c, imperial)} · {challengeProgress(c, m.done, m.total)}</span>
              </span>
              <ChallengeStatus m={m} action={action} />
            </div>
          );
        })}
      </div>
      {action.sheets}
    </section>
  );
}

// ── The daily pop-up ────────────────────────────────────────────────────

const POPUP_KEY = "trackfit.challengePopup";

/** The details, the video, and "Take on challenge" or "Not for me". */
export function ChallengeDetails({ c, imperial }: { c: ClubChallengeDto; imperial: boolean }) {
  const Icon = KIND_ICON[c.kind];
  return (
    <>
      {c.video && <MediaView media={c.video} alt={`${c.coach.displayName} explains ${c.title}`} />}
      {c.description && <p className="post-b">{c.description}</p>}
      <div className="list ch-facts">
        <div className="li"><span className="ic"><Icon /></span><span><span className="t">{challengeRule(c, imperial)}</span><span className="d" style={{ display: "block" }}>{KIND_NAME[c.kind]} challenge, {cadenceText(c).toLowerCase()}</span></span><span /></div>
        <div className="li"><span className="ic"><Clock /></span><span><span className="t">{dateSpan(c.startsOn, c.endsOn)}</span><span className="d" style={{ display: "block" }}>{c.totalPeriods} {c.cadence === "DAILY" ? "day" : "week"}{c.totalPeriods === 1 ? "" : "s"} with proof to finish</span></span><span /></div>
        {c.kind === "WORKOUT" && c.exercises.map((e) => (
          <div key={e.exerciseId} className="li"><span className="ic"><Dumbbell /></span><span className="t">{e.name}</span><span className="d">{e.sets} × {e.reps}</span></div>
        ))}
      </div>
      <p className="help">Set by {c.coach.displayName}{c.joinedCount ? ` · ${c.joinedCount} taking part` : ""}</p>
    </>
  );
}

/**
 * The first time a member opens the app each day: challenges they haven't
 * answered. Closing it brings them back tomorrow; "Not for me" stops one.
 */
export function ChallengePopup() {
  const { me } = usePlan();
  const today = localToday();
  const imperial = useUnits().unit === "lb";
  const [seen] = useState(() => readJson<string>(POPUP_KEY, ""));
  const [open, setOpen] = useState(true);
  const [detail, setDetail] = useState<ClubChallengeDto | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const { answer, loading } = useRespond();
  const q = useQuery<{ pendingClubChallenges: ClubChallengeDto[] }>(PENDING_CLUB_CHALLENGES, { variables: { date: today }, skip: !me?.showClubs || seen === today });
  const list = (q.data?.pendingClubChallenges ?? []).filter((c) => !answered.includes(c.id));
  const close = () => { writeJson(POPUP_KEY, today); setOpen(false); };
  const pick = async (c: ClubChallengeDto, join: boolean) => {
    if (!(await answer(c, join))) return;
    setAnswered((a) => [...a, c.id]);
    setDetail(null);
    if (list.length <= 1) close();
  };
  return (
    <Sheet open={open && list.length > 0} onClose={close} label="New club challenges">
      {detail ? (
        <>
          <button type="button" className="linkbtn" onClick={() => setDetail(null)}>All challenges</button>
          <p className="sh-k" style={{ marginTop: 8 }}>{detail.clubName}</p>
          <h3>{detail.title}</h3>
          <ChallengeDetails c={detail} imperial={imperial} />
          <div className="btnrow" style={{ marginTop: 16 }}>
            <button type="button" className="cta small-cta" disabled={loading} onClick={() => void pick(detail, true)}>Take on challenge<Check /></button>
            <button type="button" className="ghost" disabled={loading} onClick={() => void pick(detail, false)}>Not for me</button>
          </div>
        </>
      ) : (
        <>
          <p className="sh-k">From your clubs</p>
          <h3>{list.length === 1 ? "A new challenge" : `${list.length} new challenges`}</h3>
          <p>Take one on and it shows up where you log it. Close this and we'll ask again tomorrow.</p>
          <div className="list">
            {list.map((c) => {
              const Icon = KIND_ICON[c.kind];
              return (
                <button key={c.id} type="button" className="li" onClick={() => setDetail(c)}>
                  <span className="ic"><Icon /></span>
                  <span><span className="t">{c.title}</span><span className="d" style={{ display: "block" }}>{c.coach.displayName} · {c.clubName} · {challengeRule(c, imperial)}</span></span>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ── The club's Challenges tab ───────────────────────────────────────────

const STATE_TAG = (c: ClubChallengeDto) =>
  c.state === "ENDED" ? "Ended" : c.state === "FINISHED" ? "Finished"
  : c.myAnswer === "JOINED" ? "Taking part" : c.myAnswer === "DECLINED" ? "Not for me"
  : c.state === "UPCOMING" ? "Coming up" : null;

export function ChallengeRow({ c, imperial }: { c: ClubChallengeDto; imperial: boolean }) {
  const Icon = KIND_ICON[c.kind];
  const tag = STATE_TAG(c);
  return (
    <Link to={`/clubs/${c.clubId}/challenges/${c.id}`} className="li">
      <span className="ic"><Icon /></span>
      <span>
        <span className="t">{c.title}</span>
        <span className="d" style={{ display: "block" }}>{challengeRule(c, imperial)} · {cadenceText(c)} · {dateSpan(c.startsOn, c.endsOn)}</span>
        <span className="d" style={{ display: "block" }}>{c.coach.displayName}{c.joinedCount ? ` · ${c.joinedCount} taking part` : ""}</span>
      </span>
      {tag ? <span className="tag">{tag}</span> : <ChevronRight />}
    </Link>
  );
}

export function ChallengesTab({ club }: { club: ClubDto }) {
  const imperial = useUnits().unit === "lb";
  const [adding, setAdding] = useState(false);
  const q = useQuery<{ club: { id: string; challengeQuota: { limit: number; usedThisWeek: number } | null; challenges: ClubChallengeDto[] } | null }>(CLUB_CHALLENGES, { variables: { id: club.id }, fetchPolicy: "cache-and-network" });
  const data = q.data?.club;
  if (!data) return <PulseLoader label="Loading challenges" />;
  const quota = data.challengeQuota;
  const full = !!quota && quota.usedThisWeek >= quota.limit;
  const live = data.challenges.filter((c) => c.state === "RUNNING" || c.state === "UPCOMING");
  const past = data.challenges.filter((c) => c.state === "FINISHED" || c.state === "ENDED");
  return (
    <div className="feed">
      <div className="feed-top">
        <p className="help" style={{ margin: 0, maxWidth: "44ch" }}>Set by the club's coaches. Take one on, send a photo or video as proof, and post the win when you finish.</p>
        {quota && <button type="button" className="cta small-cta" disabled={full} onClick={() => setAdding(true)}>New challenge<Plus /></button>}
      </div>
      {quota && <p className="help">{full ? `You've set ${quota.limit} challenges this week, the most a coach can. You can set more from Monday.` : `You can set ${quota.limit - quota.usedThisWeek} more this week.`}</p>}
      {!quota && club.me.isAdmin && <p className="help">Only coaches set challenges. To set one, give yourself the Coach role under Members.</p>}
      {live.length === 0 ? (
        <section className="card"><div className="empty"><Trophy /><span>{quota ? "No challenges running. Try one like “Run 3 km this week” or “Drink 2 litres a day”." : "No challenges running. The club's coaches can set some."}</span></div></section>
      ) : (
        <section className="card fadein"><div className="card-h"><div><h3>Now</h3></div></div><div className="list">{live.map((c) => <ChallengeRow key={c.id} c={c} imperial={imperial} />)}</div></section>
      )}
      {past.length > 0 && (
        <section className="card fadein"><div className="card-h"><div><h3>Past</h3></div></div><div className="list">{past.map((c) => <ChallengeRow key={c.id} c={c} imperial={imperial} />)}</div></section>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} label="New challenge">
        {adding && <ChallengeForm clubId={club.id} clubName={club.name} onDone={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}
