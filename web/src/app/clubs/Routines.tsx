import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { CalendarCheck, Check, ChevronRight, Dumbbell, Plus, Repeat } from "lucide-react";
import { ACTIVITY_TYPES } from "@engine";
import { CLUB_ROUTINES, LOG_CLUB_ROUTINE_WORKOUT, MY_CLUB_ROUTINES } from "../../graphql/operations";
import type { ClubDto, ClubRoutineDto } from "../../graphql/types";
import { usePlan, useUnits } from "../../hooks/usePlan";
import { routineDays, routineRule } from "../../lib/clubFormat";
import { localToday } from "../../lib/dates";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { useSheets } from "../AppSheets";
import { REFETCH_LOGS } from "../planUtil";
import { RoutineForm } from "./RoutineForm";

/** The Routines tab on a club page. */
export function RoutinesTab({ club }: { club: ClubDto }) {
  const imperial = useUnits().unit === "lb";
  const [adding, setAdding] = useState(false);
  const q = useQuery<{ club: { id: string; routineLimit: number; routines: ClubRoutineDto[] } | null }>(CLUB_ROUTINES, { variables: { id: club.id }, fetchPolicy: "cache-and-network" });
  const data = q.data?.club;
  if (!data) return <PulseLoader label="Loading routines" />;
  const full = data.routines.length >= data.routineLimit;
  return (
    <div className="feed">
      <div className="feed-top">
        <p className="help" style={{ margin: 0, maxWidth: "44ch" }}>Regular club sessions anyone can join in on. Optional, no proof needed, and your plan stays as it is.</p>
        {club.me.isAdmin && <button type="button" className="cta small-cta" disabled={full} onClick={() => setAdding(true)}>New routine<Plus /></button>}
      </div>
      {club.me.isAdmin && full && <p className="help">This club has {data.routineLimit} routines, the most it can have. End one to add another.</p>}
      {data.routines.length === 0 ? (
        <section className="card"><div className="empty"><Repeat /><span>{club.me.isAdmin ? "No routines yet. Try one like “Tuesday is run day: at least 5 km”." : "No routines yet. The club's Admins can set some up."}</span></div></section>
      ) : (
        <section className="card fadein">
          <div className="list">
            {data.routines.map((r) => (
              <Link key={r.id} to={`/clubs/${club.id}/routines/${r.id}`} className="li">
                <span className="ic">{r.kind === "WORKOUT" ? <Dumbbell /> : <CalendarCheck />}</span>
                <span><span className="t">{r.title}</span><span className="d" style={{ display: "block" }}>{routineDays(r.weekdays)} · {routineRule(r, imperial)}</span></span>
                <ChevronRight />
              </Link>
            ))}
          </div>
        </section>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} label="New routine">
        {adding && <RoutineForm clubId={club.id} clubName={club.name} onDone={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}

/** Logging a workout routine: its exercises, optional weights and time, then one tap. */
export function RoutineWorkoutSheet({ routine, date, onDone }: { routine: ClubRoutineDto; date: string; onDone: () => void }) {
  const toast = useToast();
  const units = useUnits();
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState("");
  const [log, { loading }] = useMutation(LOG_CLUB_ROUTINE_WORKOUT, { refetchQueries: [...REFETCH_LOGS, "ClubRoutineProgress"] });
  const save = async () => {
    try {
      await log({ variables: {
        routineId: routine.id, date,
        durationMinutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null,
        weights: routine.exercises.filter((e) => Number(weights[e.exerciseId]) > 0).map((e) => ({ exerciseId: e.exerciseId, weightKg: Math.round(units.fromDisplay(Number(weights[e.exerciseId])) * 100) / 100 })),
      } });
      toast(`${routine.title} logged. It's in your workout history too.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't log it. Try again."); }
  };
  return (
    <>
      <p className="sh-k">Club routine · {routine.clubName}</p>
      <h3>{routine.title}</h3>
      {routine.description && <p>{routine.description}</p>}
      <div className="rt-log">
        {routine.exercises.map((e) => (
          <div key={e.exerciseId} className="rt-log-row">
            <span><b>{e.name}</b><small>{e.sets} × {e.reps}</small></span>
            <label className="sr-only" htmlFor={`w-${e.exerciseId}`}>{e.name} weight ({units.unit})</label>
            <input id={`w-${e.exerciseId}`} className="txt" type="number" inputMode="decimal" min={0} placeholder={`${units.unit}, optional`} value={weights[e.exerciseId] ?? ""} onChange={(ev) => setWeights((w) => ({ ...w, [e.exerciseId]: ev.target.value }))} />
          </div>
        ))}
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="rt-dur">How long did it take? <span className="opt-l">Minutes, optional</span></label>
        <input id="rt-dur" className="txt" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <p className="help">Leave a weight empty for bodyweight. Every set is logged as done, at the reps shown.</p>
      <button type="button" className="cta" style={{ marginTop: 14 }} disabled={loading} onClick={() => void save()}>Log as done<Check /></button>
    </>
  );
}

/** Today: "Club routine: …" for each routine on today, with a button to log it. */
export function TodayRoutines() {
  const { me } = usePlan();
  const imperial = useUnits().unit === "lb";
  const sheets = useSheets();
  const today = localToday();
  const [logging, setLogging] = useState<ClubRoutineDto | null>(null);
  const q = useQuery<{ myClubRoutines: { done: boolean; routine: ClubRoutineDto }[] }>(MY_CLUB_ROUTINES, { variables: { date: today }, skip: !me?.showClubs, fetchPolicy: "cache-and-network" });
  const list = q.data?.myClubRoutines ?? [];
  if (!list.length) return null;
  const go = (r: ClubRoutineDto) => {
    if (r.kind === "WORKOUT") { setLogging(r); return; }
    const kind = r.activityType ? ACTIVITY_TYPES[r.activityType]?.kind : "CARDIO";
    sheets.activity(kind === "SPORT" ? "SPORT" : "CARDIO", today, r.activityType ?? undefined);
  };
  return (
    <section className="card fadein today-rt">
      <div className="card-h"><div><h3>Club routines today</h3><p>Optional. Join in if you can.</p></div></div>
      <div className="list">
        {list.map(({ routine: r, done }) => (
          <div key={r.id} className="li">
            <span className={`ic${done ? " done" : ""}`}>{done ? <Check /> : r.kind === "WORKOUT" ? <Dumbbell /> : <CalendarCheck />}</span>
            <span>
              <span className="t">Club routine: {r.title}</span>
              <span className="d" style={{ display: "block" }}>{r.clubName} · {routineRule(r, imperial)}</span>
            </span>
            {done ? <span className="tag">Done</span> : <button type="button" className="ghost" onClick={() => go(r)}>{r.kind === "WORKOUT" ? "Log it" : "Log activity"}</button>}
          </div>
        ))}
      </div>
      <Sheet open={!!logging} onClose={() => setLogging(null)} label="Log club routine">
        {logging && <RoutineWorkoutSheet routine={logging} date={today} onDone={() => setLogging(null)} />}
      </Sheet>
    </section>
  );
}
