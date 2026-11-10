import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ChevronRight, Clock, Mail, ShieldCheck, Users } from "lucide-react";
import { DECLINE_CLUB_INVITE, LEAVE_CLUB, MY_CLUBS, MY_PLAN } from "../../graphql/operations";
import type { MyClubsData } from "../../graphql/types";
import { usePlan } from "../../hooks/usePlan";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";
import { PulseLoader } from "../../components/ui/PulseLoader";

/** /clubs: the clubs you're in or waiting for, and invites sent to you. */
export function ClubsPage() {
  const { me } = usePlan();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery<MyClubsData>(MY_CLUBS, { fetchPolicy: "cache-and-network", skip: !me?.showClubs });
  const refetch = { refetchQueries: [{ query: MY_CLUBS }, { query: MY_PLAN }], awaitRefetchQueries: true };
  const [decline] = useMutation(DECLINE_CLUB_INVITE, refetch);
  const [withdraw] = useMutation(LEAVE_CLUB, refetch);

  if (!me?.showClubs) return <Navigate to="/today" replace />;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast(done); } catch (e) { toast(e instanceof Error ? e.message : "Something went wrong. Try again."); }
  };

  const clubs = q.data?.myClubs ?? [];
  const invites = q.data?.myClubInvites ?? [];
  const active = clubs.filter((c) => c.status === "ACTIVE");
  const waiting = clubs.filter((c) => c.status === "WAITING");

  return (
    <div className="view-in">
      <ViewHead kicker="Train together" title="Clubs" />
      <div className="agrid">
        <div className="acol">
          {invites.length > 0 && (
            <section className="card fadein">
              <div className="card-h"><div><h3>Invites</h3><p>Sent to your email address.</p></div></div>
              <div className="list">
                {invites.map((i) => (
                  <div key={i.id} className="li">
                    <span className="ic"><Mail /></span>
                    <div><div className="t">{i.clubName}</div><div className="d">{i.asAdmin ? "You're invited to run this club as its Admin" : "You're invited to join"}</div></div>
                    <span className="btnrow">
                      <button type="button" className="linkbtn" onClick={() => void run(() => decline({ variables: { id: i.id } }), "Invite declined.")}>Decline</button>
                      <button type="button" className="cta small-cta" onClick={() => navigate(`/join/${i.token}`)}>Open</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card fadein">
            <div className="card-h"><div><h3>Your clubs</h3><p>{active.length ? `${active.length} club${active.length === 1 ? "" : "s"}` : "Clubs are invite-only for now."}</p></div></div>
            {q.loading && !q.data ? <PulseLoader small /> : active.length === 0 && waiting.length === 0 ? (
              <p className="help">You're not in a club yet. When someone invites you, the invite shows up here and in your email.</p>
            ) : (
              <div className="list">
                {active.map((c) => (
                  <Link key={c.id} to={`/clubs/${c.id}`} className="li">
                    <span className="ic"><Users /></span>
                    <div><div className="t">{c.name}</div>{c.description && <div className="d">{c.description}</div>}</div>
                    <ChevronRight />
                  </Link>
                ))}
                {waiting.map((c) => (
                  <div key={c.id} className="li">
                    <span className="ic"><Clock /></span>
                    <div><div className="t">{c.name}</div><div className="d">Waiting for an Admin to approve you</div></div>
                    <button type="button" className="linkbtn" onClick={() => void run(() => withdraw({ variables: { clubId: c.id } }), "Request withdrawn.")}>Withdraw</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="acol">
          {me.appRole && (
            <section className="tip fadein">
              <span className="ic"><ShieldCheck /></span>
              <div>
                <b>{me.appRole === "OWNER" ? "You're the App Owner" : "You're an App Admin"}</b>
                <p>Create clubs and manage App Admins in the console.</p>
                <Link className="ghost" style={{ marginTop: 12 }} to="/console">Open the console<ChevronRight /></Link>
              </div>
            </section>
          )}
          <section className="tip fadein">
            <span className="ic"><Users /></span>
            <div>
              <b>What's in a club</b>
              <p>Coaches see the workouts and activities you log, so they can keep you on track. Posts, challenges and club routines are on the way.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
