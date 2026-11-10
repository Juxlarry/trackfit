import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Check, Flame, Pencil, X } from "lucide-react";
import { ARCHIVE_CLUB_ROUTINE, CLUB, CLUB_ROUTINE_PROGRESS } from "../../graphql/operations";
import type { ClubDto, ClubRoutineProgressDto } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import { routineDays, routineRule } from "../../lib/clubFormat";
import { localToday } from "../../lib/dates";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";
import { RoutineForm } from "./RoutineForm";
import { RoutineWorkoutSheet } from "./Routines";

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** /clubs/:id/routines/:routineId: who did it each week, and everyone's streak. */
export function RoutinePage() {
  const { id = "", routineId = "" } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const imperial = useUnits().unit === "lb";
  const today = localToday();
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [logging, setLogging] = useState(false);
  const q = useQuery<{ clubRoutineProgress: ClubRoutineProgressDto | null }>(CLUB_ROUTINE_PROGRESS, { variables: { id: routineId, today }, fetchPolicy: "cache-and-network" });
  const c = useQuery<{ club: ClubDto | null }>(CLUB, { variables: { id }, fetchPolicy: "cache-first" });
  const [archive, archiving] = useMutation(ARCHIVE_CLUB_ROUTINE, { refetchQueries: ["ClubRoutines", "MyClubRoutines"] });
  const back = <Link className="back-link" to={`/clubs/${id}?tab=routines`}><ArrowLeft />Back to routines</Link>;
  if (q.loading && !q.data) return <PulseLoader label="Loading the routine" />;
  const p = q.data?.clubRoutineProgress;
  if (!p) return <div className="view-in">{back}<section className="card"><h3>Routine not found</h3><p className="help">It may have ended, or you're no longer in this club.</p></section></div>;
  const r = p.routine;
  const club = c.data?.club;
  const me = p.members.find((m) => m.isMe);
  const onToday = r.weekdays.includes((new Date(`${today}T12:00:00`).getDay() + 6) % 7);

  return (
    <div className="view-in">
      {back}
      <ViewHead kicker={`Club routine · ${r.clubName}`} title={r.title} />
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <div className="card-h">
              <div><h3>{routineDays(r.weekdays)}</h3><p>{routineRule(r, imperial)}</p></div>
              {club?.me.isAdmin && <button type="button" className="linkbtn" onClick={() => setEditing(true)}><Pencil />Edit</button>}
            </div>
            {r.description && <p className="post-b">{r.description}</p>}
            {r.kind === "WORKOUT" && (
              <div className="wtable" style={{ marginTop: 10 }}>
                {r.exercises.map((e) => <div key={e.exerciseId} className="wrow"><b>{e.name}</b><span><span className="wset">{e.sets} × {e.reps}</span></span></div>)}
              </div>
            )}
            <p className="help" style={{ marginTop: 12 }}>
              {r.kind === "ACTIVITY" ? "Ticks itself when you log a matching activity on the day." : "Log it from Today on its days, or here. It goes into your workout history."}
            </p>
            {me && onToday && (me.doneToday
              ? <p className="rt-done"><Check />Done today</p>
              : r.kind === "WORKOUT" && <button type="button" className="cta small-cta" style={{ marginTop: 6 }} onClick={() => setLogging(true)}>Log it for today<Check /></button>)}
          </section>
          {club?.me.isAdmin && (
            <section className="card fadein">
              <div className="card-h"><div><h3>End this routine</h3><p>It leaves Today and the club. Logged sessions stay in people's history.</p></div></div>
              <button type="button" className="ghost" onClick={() => setEnding(true)}><X />End routine</button>
            </section>
          )}
        </div>
        <div className="acol">
          <section className="card fadein">
            <div className="card-h"><div><h3>Who did it</h3><p>This week first, then the five before. Counted from when each person joined.</p></div></div>
            <div className="rt-grid" role="table" aria-label="Routine done each week">
              <div className="rt-grid-row head" role="row">
                <span role="columnheader">Member</span>
                <span role="columnheader" className="rt-c">Streak</span>
                {[...p.weekStarts].reverse().map((w, i) => <span key={w} role="columnheader" className="rt-c">{i === 0 ? "This week" : weekLabel(w)}</span>)}
              </div>
              {p.members.map((m) => (
                <div key={m.userId} className={`rt-grid-row${m.isMe ? " me" : ""}`} role="row">
                  <span role="cell" className="nm">{m.displayName}{m.isMe && <span className="tag">You</span>}</span>
                  <span role="cell" className="rt-c streak">{m.streak > 0 ? <><Flame />{m.streak}</> : "0"}</span>
                  {[...m.weeks].reverse().map((w) => (
                    <span key={w.weekStart} role="cell" className={`rt-c${w.scheduled === 0 ? " na" : w.done >= w.scheduled ? " full" : w.done > 0 ? " part" : ""}`}
                      aria-label={w.scheduled ? `${w.done} of ${w.scheduled}` : "Not on yet"}>{w.scheduled ? `${w.done}/${w.scheduled}` : "–"}</span>
                  ))}
                </div>
              ))}
            </div>
            <p className="help" style={{ marginTop: 12 }}>A streak counts the routine's days in a row that were done. Today counts once it's done.</p>
          </section>
        </div>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} label="Edit routine">
        {editing && <RoutineForm clubId={id} clubName={r.clubName} routine={r} onDone={() => setEditing(false)} />}
      </Sheet>
      <Sheet open={logging} onClose={() => setLogging(false)} label="Log club routine">
        {logging && <RoutineWorkoutSheet routine={r} date={today} onDone={() => setLogging(false)} />}
      </Sheet>
      <Sheet open={ending} onClose={() => setEnding(false)} label="End routine">
        <p className="sh-k">{r.clubName}</p>
        <h3>End {r.title}?</h3>
        <p>It stops showing on Today and in the club, and frees a routine slot. This can't be undone, but you can make it again.</p>
        <button type="button" className="cta" disabled={archiving.loading} onClick={() => {
          archive({ variables: { id: r.id } }).then(() => { toast(`${r.title} has ended.`); navigate(`/clubs/${id}?tab=routines`, { replace: true }); }, (e: Error) => toast(e.message));
        }}>End routine<X /></button>
      </Sheet>
    </div>
  );
}
