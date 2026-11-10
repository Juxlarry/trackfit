import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Check, Copy, Link2, LogOut, Mail, MessageSquare, Send, Settings2, UserMinus, UserPlus, Users } from "lucide-react";
import {
  CLUB, CREATE_JOIN_LINK, INVITE_TO_CLUB, LEAVE_CLUB, MY_CLUBS, MY_PLAN, REMOVE_CLUB_MEMBER, RESPOND_TO_JOIN_REQUEST, REVOKE_CLUB_INVITE,
  SET_CLUB_MEMBER_ROLES, TURN_OFF_JOIN_LINK,
} from "../../graphql/operations";
import type { ClubDto, ClubMemberDto } from "../../graphql/types";
import { OptionList } from "../../components/ui/Options";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";

const roleText = (m: { isAdmin: boolean; isCoach: boolean }) =>
  m.isAdmin && m.isCoach ? "Admin and Coach" : m.isAdmin ? "Admin" : m.isCoach ? "Coach" : "Member";
const YOU_ARE: Record<string, string> = {
  Member: "You're a member", Admin: "You're an Admin", Coach: "You're a Coach", "Admin and Coach": "You're an Admin and Coach",
};
/** A server timestamp as a local date, e.g. "10 November 2026". */
const onDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** Emails typed or pasted with commas, spaces or new lines between them. */
const splitEmails = (raw: string) => raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

/** /clubs/:id. Everyone sees the members; Admins also run invites, join links and requests. */
export function ClubPage() {
  const { id = "" } = useParams();
  const q = useQuery<{ club: ClubDto | null }>(CLUB, { variables: { id }, fetchPolicy: "cache-and-network" });
  if (q.loading && !q.data) return <p className="boot">Loading…</p>;
  const club = q.data?.club;
  if (!club) {
    return (
      <div className="view-in">
        <Link className="back-link" to="/clubs"><ArrowLeft />Back to Clubs</Link>
        <section className="card"><h3>Club not found</h3><p className="help">You may have left it, been removed, or it has closed.</p></section>
      </div>
    );
  }
  return <ClubView club={club} />;
}

function ClubView({ club }: { club: ClubDto }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [manage, setManage] = useState<ClubMemberDto | null>(null);
  const [leaving, setLeaving] = useState(false);
  const admin = club.me.isAdmin;
  const adminCount = club.members.filter((m) => m.isAdmin).length;
  const [leave, leaveState] = useMutation(LEAVE_CLUB, { refetchQueries: [{ query: MY_CLUBS }, { query: MY_PLAN }], awaitRefetchQueries: true });

  const doLeave = async () => {
    try {
      await leave({ variables: { clubId: club.id } });
      toast(`You left ${club.name}.`);
      navigate("/clubs", { replace: true });
    } catch (e) { setLeaving(false); toast(e instanceof Error ? e.message : "Couldn't leave. Try again."); }
  };

  return (
    <div className="view-in">
      <Link className="back-link" to="/clubs"><ArrowLeft />Back to Clubs</Link>
      <ViewHead kicker={YOU_ARE[roleText(club.me)]} title={club.name} />
      {club.description && <p className="qs" style={{ marginTop: -12, marginBottom: 22 }}>{club.description}</p>}
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <div className="card-h"><div><h3>Club feed</h3><p>Coming in the next update</p></div></div>
            <div className="empty"><MessageSquare /><span>Posts after workouts and runs, coach videos, challenges and club routines will show here. For now, this page is for getting everyone in and setting roles.</span></div>
          </section>
          <section className="card fadein">
            <div className="card-h">
              <div><h3>Members</h3><p>{club.members.length} of {club.limits.maxMembers} · {adminCount} of {club.limits.maxAdmins} Admins</p></div>
            </div>
            <div className="list">
              {club.members.map((m) => (
                <div key={m.userId} className="li">
                  <span className="ic"><Users /></span>
                  <div>
                    <div className="t">{m.displayName}{m.isMe && <span className="tag">You</span>}</div>
                    <div className="d">{roleText(m)}{m.joinedAt ? ` · joined ${onDay(m.joinedAt)}` : ""}</div>
                  </div>
                  {admin && <button type="button" className="linkbtn" aria-label={`Manage ${m.displayName}`} onClick={() => setManage(m)}><Settings2 />Manage</button>}
                </div>
              ))}
            </div>
            <p className="help" style={{ marginTop: 12 }}>Coaches see every member's logged workouts and activities. Food, water, weight and photos stay private.</p>
          </section>
        </div>

        <div className="acol">
          {admin && <JoinRequests club={club} />}
          {admin && <InvitePeople club={club} />}
          {admin && <JoinLinks club={club} />}
          <section className="card fadein">
            <div className="card-h"><div><h3>Leave club</h3><p>Coaches stop seeing your logs straight away.</p></div></div>
            <button type="button" className="ghost" onClick={() => setLeaving(true)}><LogOut />Leave {club.name}</button>
          </section>
        </div>
      </div>

      <Sheet open={!!manage} onClose={() => setManage(null)} label="Manage member">
        {manage && <ManageMember club={club} member={manage} onDone={() => setManage(null)} />}
      </Sheet>
      <Sheet open={leaving} onClose={() => setLeaving(false)} label="Leave club">
        <p className="sh-k">{club.name}</p>
        <h3>Leave this club?</h3>
        <p>You'll need a new invite or join link to come back. Your own logs and plan aren't affected.</p>
        <button type="button" className="cta" disabled={leaveState.loading} onClick={() => void doLeave()}>Leave the club<LogOut /></button>
      </Sheet>
    </div>
  );
}

function ManageMember({ club, member, onDone }: { club: ClubDto; member: ClubMemberDto; onDone: () => void }) {
  const toast = useToast();
  const [roles, setRolesState] = useState({ isAdmin: member.isAdmin, isCoach: member.isCoach });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [save, saving] = useMutation(SET_CLUB_MEMBER_ROLES);
  const [remove, removing] = useMutation(REMOVE_CLUB_MEMBER);
  const adminCount = club.members.filter((m) => m.isAdmin).length;
  const adminFull = !member.isAdmin && adminCount >= club.limits.maxAdmins;
  const lastAdmin = member.isAdmin && adminCount <= 1;
  const changed = roles.isAdmin !== member.isAdmin || roles.isCoach !== member.isCoach;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast(done); onDone(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); }
  };
  type Role = "ADMIN" | "COACH";
  return (
    <>
      <p className="sh-k">{club.name}</p>
      <h3>{member.displayName}{member.isMe ? " (you)" : ""}</h3>
      <p>Everyone in the club is a member. Admin and Coach are roles on top, and one person can have both.</p>
      <OptionList<Role>
        multi
        label="Roles"
        selected={[...(roles.isAdmin ? ["ADMIN" as const] : []), ...(roles.isCoach ? ["COACH" as const] : [])]}
        onPick={(r) => setRolesState((s) => (r === "ADMIN" ? { ...s, isAdmin: !s.isAdmin } : { ...s, isCoach: !s.isCoach }))}
        options={[
          {
            value: "ADMIN", label: "Admin",
            desc: adminFull ? `This club already has ${club.limits.maxAdmins} Admins.` : lastAdmin ? "The last Admin. Make someone else an Admin before removing this." : "Invites people, approves requests, sets roles and club routines.",
            disabled: adminFull || lastAdmin,
          },
          { value: "COACH", label: "Coach", desc: "Sees members' workouts and activities, and sets challenges." },
        ]}
      />
      <button type="button" className="cta" disabled={!changed || saving.loading} onClick={() => void run(() => save({ variables: { clubId: club.id, userId: member.userId, ...roles } }), "Roles saved.")}>
        Save roles<Check />
      </button>
      {!member.isMe && (confirmRemove ? (
        <div className="tip" style={{ marginTop: 16 }}>
          <span className="ic"><UserMinus /></span>
          <div>
            <b>Remove {member.displayName}?</b>
            <p>They leave the club at once and need a new invite to come back.</p>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button type="button" className="ghost" disabled={removing.loading} onClick={() => void run(() => remove({ variables: { clubId: club.id, userId: member.userId } }), `${member.displayName} was removed.`)}>Remove</button>
              <button type="button" className="linkbtn" onClick={() => setConfirmRemove(false)}>Keep them</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="linkbtn" style={{ marginTop: 14 }} onClick={() => setConfirmRemove(true)}><UserMinus />Remove from the club</button>
      ))}
    </>
  );
}

function JoinRequests({ club }: { club: ClubDto }) {
  const toast = useToast();
  const [respond, { loading }] = useMutation(RESPOND_TO_JOIN_REQUEST);
  if (!club.joinRequests.length) return null;
  const answer = async (userId: string, name: string, approve: boolean) => {
    try {
      await respond({ variables: { clubId: club.id, userId, approve } });
      toast(approve ? `${name} is in.` : `${name}'s request was declined.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't answer that. Try again."); }
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Waiting to join</h3><p>Asked with a join link</p></div></div>
      <div className="list">
        {club.joinRequests.map((r) => (
          <div key={r.userId} className="li">
            <span className="ic"><UserPlus /></span>
            <div><div className="t">{r.displayName}</div><div className="d">Asked on {onDay(r.requestedAt)}</div></div>
            <span className="btnrow">
              <button type="button" className="linkbtn" disabled={loading} onClick={() => void answer(r.userId, r.displayName, false)}>Decline</button>
              <button type="button" className="cta small-cta" disabled={loading} onClick={() => void answer(r.userId, r.displayName, true)}>Approve</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function InvitePeople({ club }: { club: ClubDto }) {
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [invite, { loading }] = useMutation(INVITE_TO_CLUB);
  const [revoke] = useMutation(REVOKE_CLUB_INVITE);
  const emails = splitEmails(raw);
  const send = async () => {
    try {
      await invite({ variables: { clubId: club.id, emails } });
      toast(emails.length === 1 ? "Invite sent." : `${emails.length} invites sent.`);
      setRaw("");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't send the invites. Try again."); }
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Invite by email</h3><p>They join straight away, using that address.</p></div></div>
      <div className="field" style={{ maxWidth: "none" }}>
        <label htmlFor="club-emails">Email addresses</label>
        <textarea id="club-emails" className="txt" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="ama@example.com, kofi@example.com" />
        <p className="help">Separate them with commas or new lines.</p>
      </div>
      <button type="button" className="cta small-cta" style={{ marginTop: 12 }} disabled={!emails.length || loading} onClick={() => void send()}>
        {emails.length > 1 ? `Send ${emails.length} invites` : "Send invite"}<Send />
      </button>
      {club.invites.length > 0 && (
        <div className="list" style={{ marginTop: 16 }}>
          {club.invites.map((i) => (
            <div key={i.id} className="li">
              <span className="ic"><Mail /></span>
              <div><div className="t">{i.email}</div><div className="d">{i.asAdmin ? "Invited as Admin" : "Invited"} on {onDay(i.createdAt)}</div></div>
              <button type="button" className="linkbtn" onClick={() => {
                revoke({ variables: { id: i.id } }).then(() => toast("Invite withdrawn."), (e: Error) => toast(e.message));
              }}>Withdraw</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function JoinLinks({ club }: { club: ClubDto }) {
  const toast = useToast();
  const [create, { loading }] = useMutation(CREATE_JOIN_LINK);
  const [turnOff] = useMutation(TURN_OFF_JOIN_LINK);
  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast("Link copied."), () => toast("Couldn't copy. Select the link and copy it instead."));
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Join link</h3><p>Share it anywhere. You approve each person who uses it.</p></div></div>
      {club.joinLinks.length === 0 ? (
        <button type="button" className="ghost" disabled={loading} onClick={() => {
          create({ variables: { clubId: club.id } }).then(() => toast("Join link ready."), (e: Error) => toast(e.message));
        }}><Link2 />Create a join link</button>
      ) : (
        <div className="list">
          {club.joinLinks.map((l) => (
            <div key={l.id} className="li" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
              <div>
                <div className="t" style={{ overflowWrap: "anywhere", fontFamily: "var(--f-mono)", fontSize: 13, background: "var(--sunk)", borderRadius: 10, padding: "10px 12px" }}>{l.url}</div>
                <div className="d" style={{ marginTop: 6 }}>Used {l.uses} of {l.maxUses} · expires {onDay(l.expiresAt)}</div>
              </div>
              <span className="btnrow">
                <button type="button" className="linkbtn" onClick={() => copy(l.url)}><Copy />Copy</button>
                <button type="button" className="linkbtn" onClick={() => {
                  turnOff({ variables: { id: l.id } }).then(() => toast("Link turned off."), (e: Error) => toast(e.message));
                }}>Turn off</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="help" style={{ marginTop: 12 }}>Links last {club.limits.linkDays} days and can be used {club.limits.maxLinkUses} times.</p>
    </section>
  );
}
