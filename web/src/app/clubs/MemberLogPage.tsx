import { Link, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft, Dumbbell, Lock } from "lucide-react";
import { CLUB_MEMBER_LOG } from "../../graphql/operations";
import type { ClubActivityDto, ClubWorkoutDto } from "../../graphql/types";
import { dayLabel } from "../../lib/dates";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { ViewHead } from "../AppLayout";
import { localDateOf } from "../planUtil";
import { ActivityStats, WorkoutStats, WorkoutTable } from "./PostBits";

interface LogData {
  clubMemberLog: { member: { userId: string; displayName: string; joinedAt: string | null }; workouts: ClubWorkoutDto[]; activities: ClubActivityDto[] };
}

/** /clubs/:id/members/:userId: what a coach sees of one member (README "What coaches see"). */
export function MemberLogPage() {
  const { id = "", userId = "" } = useParams();
  const q = useQuery<LogData>(CLUB_MEMBER_LOG, { variables: { clubId: id, userId }, fetchPolicy: "cache-and-network" });
  const back = <Link className="back-link" to={`/clubs/${id}?tab=members`}><ArrowLeft />Back to members</Link>;
  if (q.loading && !q.data) return <PulseLoader label="Loading their log" />;
  const log = q.data?.clubMemberLog;
  if (!log) {
    return <div className="view-in">{back}<section className="card"><h3>Not available</h3><p className="help">{q.error?.message ?? "Only the club's coaches can see members' logs, and only while you're both in the club."}</p></section></div>;
  }
  const days = new Map<string, { workouts: ClubWorkoutDto[]; activities: ClubActivityDto[] }>();
  const day = (d: string) => days.get(d) ?? (days.set(d, { workouts: [], activities: [] }), days.get(d)!);
  for (const w of log.workouts) day(localDateOf(w.startedAt)).workouts.push(w);
  for (const a of log.activities) day(a.performedOn).activities.push(a);
  const ordered = [...days].sort((a, b) => b[0].localeCompare(a[0]));
  return (
    <div className="view-in">
      {back}
      <ViewHead kicker="Member log" title={log.member.displayName} />
      <p className="tip" style={{ marginBottom: 18 }}>
        <span className="ic"><Lock /></span>
        <span>Workouts and activities since {log.member.joinedAt ? dayLabel(localDateOf(log.member.joinedAt)) : "they joined"}. Food, water, weight, photos and plan details stay private.</span>
      </p>
      {ordered.length === 0 ? (
        <section className="card"><div className="empty"><Dumbbell /><span>Nothing logged since they joined.</span></div></section>
      ) : ordered.map(([d, e]) => (
        <section key={d} className="card fadein" style={{ marginBottom: 14 }}>
          <div className="card-h"><div><h3>{dayLabel(d)}</h3></div></div>
          {e.workouts.map((w) => <div key={w.id} className="log-entry"><b>{w.name}</b><WorkoutStats w={w} /><WorkoutTable w={w} /></div>)}
          {e.activities.map((a) => <div key={a.id} className="log-entry"><ActivityStats a={a} /></div>)}
        </section>
      ))}
    </div>
  );
}
