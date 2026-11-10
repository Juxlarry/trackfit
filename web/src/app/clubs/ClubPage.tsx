import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Camera, Check, Copy, Link2, LogOut, Mail, MessageSquare, Plus, Send, Settings2, UserMinus, UserPlus, Users } from "lucide-react";
import {
  CLUB, CLUB_COACH_OVERVIEW, CLUB_FEED, CREATE_JOIN_LINK, INVITE_TO_CLUB, SET_CLUB_PHOTO, SET_CLUB_SHARE_SETTING, LEAVE_CLUB, MY_CLUBS, MY_PLAN, REMOVE_CLUB_MEMBER, RESPOND_TO_JOIN_REQUEST, REVOKE_CLUB_INVITE,
  SET_CLUB_MEMBER_ROLES, TURN_OFF_JOIN_LINK,
} from "../../graphql/operations";
import type { ClubDto, ClubFeedFilter, ClubMemberDto, ClubMemberOverviewDto, ClubPostDto } from "../../graphql/types";
import { checkClubFile, useClubUpload } from "../../lib/clubMedia";
import { timeAgo } from "../../lib/clubFormat";
import { Composer } from "./Composer";
import { PostCard } from "./PostBits";
import { RoutinesTab } from "./Routines";
import { ChallengesTab } from "./Challenges";
import { ChipGroup, OptionList } from "../../components/ui/Options";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";
import { PulseLoader } from "../../components/ui/PulseLoader";

const roleText = (m: { isAdmin: boolean; isCoach: boolean }) =>
  m.isAdmin && m.isCoach ? "Admin and Coach" : m.isAdmin ? "Admin" : m.isCoach ? "Coach" : "Member";
const YOU_ARE: Record<string, string> = {
  Member: "You're a member", Admin: "You're an Admin", Coach: "You're a Coach", "Admin and Coach": "You're an Admin and Coach",
};
/** A server timestamp as a local date, e.g. "10 November 2026". */
const onDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** Emails typed or pasted with commas, spaces or new lines between them. */
const splitEmails = (raw: string) => raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

/** /clubs/:id: the feed, the members (with coaches' view) and the club settings. Admins also run invites, join links and requests. */
export function ClubPage() {
  const { id = "" } = useParams();
  const q = useQuery<{ club: ClubDto | null }>(CLUB, { variables: { id }, fetchPolicy: "cache-and-network" });
  if (q.loading && !q.data) return <PulseLoader label="Loading the club" />;
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

type Tab = "feed" | "challenges" | "routines" | "members" | "club";
const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "Feed" }, { id: "challenges", label: "Challenges" }, { id: "routines", label: "Routines" }, { id: "members", label: "Members" }, { id: "club", label: "Club" },
];

function ClubView({ club }: { club: ClubDto }) {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "feed") as Tab;
  const setTab = (t: Tab) => setParams(t === "feed" ? {} : { tab: t }, { replace: true });
  const [manage, setManage] = useState<ClubMemberDto | null>(null);

  return (
    <div className="view-in">
      <Link className="back-link" to="/clubs"><ArrowLeft />Back to Clubs</Link>
      <div className="club-head">
        {club.photoUrl ? <img className="club-photo" src={club.photoUrl} alt="" /> : <span className="club-photo none" aria-hidden="true"><Users /></span>}
        <ViewHead kicker={YOU_ARE[roleText(club.me)]} title={club.name} />
      </div>
      {club.description && <p className="qs" style={{ marginTop: -12, marginBottom: 18 }}>{club.description}</p>}
      <div className="seg club-tabs" role="tablist" aria-label="Club sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "members" && club.me.isAdmin && club.joinRequests.length > 0 && <span className="dot" aria-label={`${club.joinRequests.length} waiting`} />}
          </button>
        ))}
      </div>

      {tab === "feed" && <Feed club={club} />}
      {tab === "challenges" && <ChallengesTab club={club} />}
      {tab === "routines" && <RoutinesTab club={club} />}
      {tab === "members" && <MembersTab club={club} onManage={setManage} />}
      {tab === "club" && <ClubTab club={club} />}

      <Sheet open={!!manage} onClose={() => setManage(null)} label="Manage member">
        {manage && <ManageMember club={club} member={manage} onDone={() => setManage(null)} />}
      </Sheet>
    </div>
  );
}

const FILTERS: { value: ClubFeedFilter; label: string }[] = [
  { value: "ALL", label: "All" }, { value: "WINS", label: "Wins" }, { value: "COACH_VIDEOS", label: "Coach videos" }, { value: "CHALLENGES", label: "Challenges" },
];

function Feed({ club }: { club: ClubDto }) {
  const [filter, setFilter] = useState<ClubFeedFilter>("ALL");
  const [composing, setComposing] = useState(false);
  const q = useQuery<{ club: { id: string; feed: { nextCursor: string | null; posts: ClubPostDto[] } } | null }>(CLUB_FEED, {
    variables: { id: club.id, filter }, fetchPolicy: "cache-and-network", notifyOnNetworkStatusChange: true,
  });
  const feed = q.data?.club?.feed;
  const more = () => q.fetchMore({
    variables: { after: feed?.nextCursor },
    updateQuery: (prev, { fetchMoreResult }) => {
      if (!prev.club || !fetchMoreResult?.club) return prev;
      const seen = new Set(prev.club.feed.posts.map((p) => p.id));
      return { club: { ...prev.club, feed: { nextCursor: fetchMoreResult.club.feed.nextCursor, posts: [...prev.club.feed.posts, ...fetchMoreResult.club.feed.posts.filter((p) => !seen.has(p.id))] } } };
    },
  });
  return (
    <div className="feed">
      <div className="feed-top">
        <ChipGroup label="Show" options={FILTERS} selected={[filter]} onPick={setFilter} />
        <button type="button" className="cta small-cta" onClick={() => setComposing(true)}>New post<Plus /></button>
      </div>
      {!feed ? <PulseLoader label="Loading the feed" /> : feed.posts.length === 0 ? (
        <section className="card"><div className="empty"><MessageSquare /><span>{filter === "ALL"
          ? "Nothing here yet. Finish a workout or log a run and you'll be asked if you want to share it, or tap New post."
          : filter === "CHALLENGES" ? "Challenge wins will show here once coaches start setting challenges." : "Nothing in this view yet."}</span></div></section>
      ) : (
        <>
          {feed.posts.map((p) => <PostCard key={p.id} post={p} clubName={club.name} />)}
          {feed.nextCursor && (
            <button type="button" className="ghost" style={{ alignSelf: "center" }} disabled={q.loading} onClick={() => void more()}>
              {q.loading ? <PulseLoader small label="Loading more" /> : "Show older posts"}
            </button>
          )}
        </>
      )}
      <Sheet open={composing} onClose={() => setComposing(false)} label="New post">
        {composing && <Composer clubs={[{ id: club.id, name: club.name }]} isCoach={club.me.isCoach} limits={club.feedLimits} onDone={() => setComposing(false)} />}
      </Sheet>
    </div>
  );
}

function MembersTab({ club, onManage }: { club: ClubDto; onManage: (m: ClubMemberDto) => void }) {
  const admin = club.me.isAdmin;
  const coach = club.me.isCoach;
  const adminCount = club.members.filter((m) => m.isAdmin).length;
  const ov = useQuery<{ club: { id: string; coachOverview: ClubMemberOverviewDto[] } | null }>(CLUB_COACH_OVERVIEW, { variables: { id: club.id }, skip: !coach, fetchPolicy: "cache-and-network" });
  const stats = new Map((ov.data?.club?.coachOverview ?? []).map((o) => [o.member.userId, o]));
  return (
    <div className="agrid">
      <div className="acol">
        {admin && <JoinRequests club={club} />}
        <section className="card fadein">
          <div className="card-h">
            <div><h3>Members</h3><p>{club.members.length} of {club.limits.maxMembers} · {adminCount} of {club.limits.maxAdmins} Admins</p></div>
          </div>
          {coach && ov.loading && !ov.data && <PulseLoader small label="Loading members' weeks" />}
          <div className="list">
            {club.members.map((m) => {
              const o = stats.get(m.userId);
              const row = (
                <>
                  <span className="ic"><Users /></span>
                  <div>
                    <div className="t">{m.displayName}{m.isMe && <span className="tag">You</span>}</div>
                    <div className="d">
                      {roleText(m)}{m.joinedAt ? ` · joined ${onDay(m.joinedAt)}` : ""}
                      {o && <><br />{o.sessionsPerWeek} workout{o.sessionsPerWeek === 1 ? "" : "s"} a week · {o.activities} activit{o.activities === 1 ? "y" : "ies"}{o.prs ? ` · ${o.prs} PR${o.prs === 1 ? "" : "s"}` : ""} · last workout {o.lastWorkoutAt ? timeAgo(o.lastWorkoutAt) : "none yet"}{o.challengesTaken ? ` · ${o.challengesTaken} challenge${o.challengesTaken === 1 ? "" : "s"} taken, ${o.challengesCompleted} finished` : ""}</>}
                    </div>
                  </div>
                </>
              );
              return (
                <div key={m.userId} className="li">
                  {o ? <Link to={`/clubs/${club.id}/members/${m.userId}`} className="li-link">{row}</Link> : <span className="li-link">{row}</span>}
                  {admin && <button type="button" className="linkbtn" aria-label={`Manage ${m.displayName}`} onClick={() => onManage(m)}><Settings2 />Manage</button>}
                </div>
              );
            })}
          </div>
          <p className="help" style={{ marginTop: 12 }}>
            {coach ? "As a coach you see each member's workouts and activities from the day they joined. Tap someone for their full log. Food, water, weight and photos stay private." : "Coaches see every member's logged workouts and activities. Food, water, weight and photos stay private unless you post them."}
          </p>
        </section>
      </div>
      <div className="acol">
        {admin && <InvitePeople club={club} />}
        {admin && <JoinLinks club={club} />}
      </div>
    </div>
  );
}

function ClubTab({ club }: { club: ClubDto }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [deleteMine, setDeleteMine] = useState(false);
  const [setShare, sharing] = useMutation(SET_CLUB_SHARE_SETTING);
  const [leave, leaveState] = useMutation(LEAVE_CLUB, { refetchQueries: [{ query: MY_CLUBS }, { query: MY_PLAN }], awaitRefetchQueries: true });
  const doLeave = async () => {
    try {
      await leave({ variables: { clubId: club.id, deleteMyPosts: deleteMine } });
      toast(`You left ${club.name}.`);
      navigate("/clubs", { replace: true });
    } catch (e) { setLeaving(false); toast(e instanceof Error ? e.message : "Couldn't leave. Try again."); }
  };
  const ask = club.me.askToShare !== false;
  return (
    <div className="agrid">
      <div className="acol">
        <section className="card fadein">
          <div className="card-h"><div><h3>Sharing</h3><p>Nothing is posted unless you tap Post.</p></div></div>
          <OptionList<"on">
            multi
            label="Sharing"
            selected={ask ? ["on"] : []}
            onPick={() => { setShare({ variables: { clubId: club.id, askToShare: !ask } }).then(() => toast(ask ? "You won't be asked to share here." : "You'll be asked to share after workouts."), (e: Error) => toast(e.message)); }}
            options={[{ value: "on", label: "Ask me to share after workouts", desc: `After a workout or run, offer a drafted post for ${club.name}.`, disabled: sharing.loading }]}
          />
        </section>
        {club.me.isAdmin && <ClubPhoto club={club} />}
      </div>
      <div className="acol">
        <section className="card fadein">
          <div className="card-h"><div><h3>Leave club</h3><p>Coaches stop seeing your logs straight away.</p></div></div>
          <button type="button" className="ghost" onClick={() => setLeaving(true)}><LogOut />Leave {club.name}</button>
        </section>
      </div>
      <Sheet open={leaving} onClose={() => setLeaving(false)} label="Leave club">
        <p className="sh-k">{club.name}</p>
        <h3>Leave this club?</h3>
        <p>You'll need a new invite or join link to come back. Your own logs and plan aren't affected.</p>
        <OptionList<"del"> multi label="Your posts" selected={deleteMine ? ["del"] : []} onPick={() => setDeleteMine(!deleteMine)}
          options={[{ value: "del", label: "Also delete my posts", desc: "Otherwise they stay in the feed, marked as from someone who left." }]} />
        <button type="button" className="cta" style={{ marginTop: 14 }} disabled={leaveState.loading} onClick={() => void doLeave()}>Leave the club<LogOut /></button>
      </Sheet>
    </div>
  );
}

function ClubPhoto({ club }: { club: ClubDto }) {
  const toast = useToast();
  const upload = useClubUpload();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [setPhoto] = useMutation(SET_CLUB_PHOTO);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const checked = await checkClubFile(f, "CLUB_PHOTO", club.feedLimits, club.me.isCoach);
    if ("error" in checked) { toast(checked.error); return; }
    setBusy(true);
    try {
      const mediaId = await upload(club.id, "CLUB_PHOTO", checked);
      await setPhoto({ variables: { clubId: club.id, mediaId } });
      toast("Club photo updated.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't change the photo. Try again."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Club photo</h3><p>Shown at the top of the club. Only members see it.</p></div></div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="btnrow">
        <button type="button" className="ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? <PulseLoader small label="Uploading" /> : <><Camera />{club.photoUrl ? "Change photo" : "Add a photo"}</>}</button>
        {club.photoUrl && !busy && <button type="button" className="linkbtn" onClick={() => { setPhoto({ variables: { clubId: club.id, mediaId: null } }).then(() => toast("Photo removed."), (e: Error) => toast(e.message)); }}>Remove</button>}
      </div>
    </section>
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
