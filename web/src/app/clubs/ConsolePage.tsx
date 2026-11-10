import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, CircleAlert, Flag, Plus, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import {
  ADD_APP_ADMIN, ADD_CLUB_ADMIN_FROM_CONSOLE, CLOSE_CLUB, CONSOLE, CONSOLE_REPORTS, CREATE_CLUB, MY_CLUBS, MY_PLAN, REMOVE_APP_ADMIN, RESOLVE_CLUB_REPORT,
} from "../../graphql/operations";
import type { AppStaffDto, ConsoleClubDto, ConsoleReportDto } from "../../graphql/types";
import { KIND_LABEL, timeAgo } from "../../lib/clubFormat";
import { usePlan } from "../../hooks/usePlan";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";
import { PulseLoader } from "../../components/ui/PulseLoader";

interface ConsoleData { consoleClubs: ConsoleClubDto[]; appStaff: AppStaffDto[] }
const onDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * /console: App Owner and App Admins create clubs and look after stuck ones.
 * It never shows a club's members or posts. The API checks the role on every
 * call; hiding this page is only for tidiness.
 */
export function ConsolePage() {
  const { me } = usePlan();
  const q = useQuery<ConsoleData>(CONSOLE, { skip: !me?.appRole, fetchPolicy: "cache-and-network" });
  const [addAdminTo, setAddAdminTo] = useState<ConsoleClubDto | null>(null);
  const [closing, setClosing] = useState<ConsoleClubDto | null>(null);
  if (!me?.appRole) return <Navigate to="/clubs" replace />;
  const clubs = q.data?.consoleClubs ?? [];

  return (
    <div className="view-in">
      <Link className="back-link" to="/clubs"><ArrowLeft />Back to Clubs</Link>
      <ViewHead kicker={me.appRole === "OWNER" ? "App Owner" : "App Admin"} title="Console" />
      <div className="agrid">
        <div className="acol">
          <CreateClub myEmail={me.email} />
          <section className="card fadein">
            <div className="card-h"><div><h3>Clubs</h3><p>{clubs.filter((c) => !c.closedAt).length} open</p></div></div>
            {q.loading && !q.data ? <PulseLoader small /> : clubs.length === 0 ? <p className="help">No clubs yet. Create the first one above.</p> : (
              <div className="list">
                {clubs.map((c) => (
                  <div key={c.id} className="li" style={c.closedAt ? { opacity: 0.55 } : undefined}>
                    <span className="ic"><Users /></span>
                    <div>
                      <div className="t">{c.name}{c.closedAt && <span className="tag">Closed</span>}</div>
                      <div className="d">
                        {c.memberCount} member{c.memberCount === 1 ? "" : "s"} · {c.adminCount} Admin{c.adminCount === 1 ? "" : "s"} · created {onDay(c.createdAt)}
                        {c.pendingAdminEmails.length > 0 && <><br />Admin invite waiting: {c.pendingAdminEmails.join(", ")}</>}
                      </div>
                    </div>
                    {!c.closedAt && (
                      <span className="btnrow">
                        <button type="button" className="linkbtn" onClick={() => setAddAdminTo(c)}><UserPlus />Admin</button>
                        <button type="button" className="linkbtn" onClick={() => setClosing(c)}><X />Close</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="acol">
          <Reports />
          <AppStaff staff={q.data?.appStaff ?? []} isOwner={me.appRole === "OWNER"} />
          <section className="tip fadein">
            <span className="ic"><ShieldCheck /></span>
            <div>
              <b>What the console can't see</b>
              <p>Members' logs, posts and media stay inside each club. The one exception is a post or comment someone reports: it shows under Reports until you deal with it. If you're also a member of a club, you see what your club role allows there, and nothing more.</p>
            </div>
          </section>
        </div>
      </div>

      <Sheet open={!!addAdminTo} onClose={() => setAddAdminTo(null)} label="Add a club Admin">
        {addAdminTo && <AddClubAdmin club={addAdminTo} onDone={() => setAddAdminTo(null)} />}
      </Sheet>
      <Sheet open={!!closing} onClose={() => setClosing(null)} label="Close club">
        {closing && <CloseClub club={closing} onDone={() => setClosing(null)} />}
      </Sheet>
    </div>
  );
}

function CreateClub({ myEmail }: { myEmail: string | null }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [create, { loading }] = useMutation(CREATE_CLUB, {
    refetchQueries: [{ query: CONSOLE }, { query: MY_CLUBS }, { query: MY_PLAN }],
    awaitRefetchQueries: true,
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create({ variables: { input: { name, description: description || null, firstAdminEmail: email } } });
      const self = !!myEmail && email.trim().toLowerCase() === myEmail.toLowerCase();
      toast(self ? `${name.trim()} is ready. Accept your Admin invite under Clubs.` : `${name.trim()} is ready. The Admin invite is on its way.`);
      setName(""); setDescription(""); setEmail("");
    } catch (err) { setError(errText(err, "Couldn't create the club. Try again.")); }
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Create a club</h3><p>The person you name becomes its first Admin when they join.</p></div></div>
      <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 16 }}>
        <div className="field" style={{ maxWidth: "none" }}>
          <label htmlFor="cc-name">Club name</label>
          <input id="cc-name" className="txt" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Gym Crew" />
        </div>
        <div className="field" style={{ maxWidth: "none" }}>
          <label htmlFor="cc-desc">Description <span className="help">(optional)</span></label>
          <textarea id="cc-desc" className="txt" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Who it's for and how you train" />
        </div>
        <div className="field" style={{ maxWidth: "none" }}>
          <label htmlFor="cc-admin">First Admin's email</label>
          <input id="cc-admin" className="txt" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="the person who'll run it" />
          {myEmail && <p className="help">Running it yourself? <button type="button" className="linkbtn" onClick={() => setEmail(myEmail)}>Use {myEmail}</button></p>}
        </div>
        <button type="submit" className="cta small-cta" style={{ justifySelf: "start" }} disabled={loading || name.trim().length < 2 || !email.trim()}>Create club<Plus /></button>
        {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
      </form>
    </section>
  );
}

function AddClubAdmin({ club, onDone }: { club: ConsoleClubDto; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [add, { loading }] = useMutation(ADD_CLUB_ADMIN_FROM_CONSOLE, { refetchQueries: [{ query: MY_PLAN }] });
  const submit = async () => {
    try {
      await add({ variables: { clubId: club.id, email } });
      toast("Done. A member is made Admin at once; anyone else gets an Admin invite.");
      onDone();
    } catch (e) { toast(errText(e, "Couldn't add that Admin. Try again.")); }
  };
  return (
    <>
      <p className="sh-k">{club.name}</p>
      <h3>Add an Admin</h3>
      <p>For a club whose Admins have gone quiet. If this email belongs to a member, they become an Admin straight away. Otherwise they get an Admin invite. A club can have at most 3 Admins.</p>
      <div className="field">
        <label htmlFor="ca-email">Email</label>
        <input id="ca-email" className="txt" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="button" className="cta" disabled={loading || !email.trim()} onClick={() => void submit()}>Add Admin<UserPlus /></button>
    </>
  );
}

function CloseClub({ club, onDone }: { club: ConsoleClubDto; onDone: () => void }) {
  const toast = useToast();
  const [close, { loading }] = useMutation(CLOSE_CLUB, { refetchQueries: [{ query: MY_CLUBS }, { query: MY_PLAN }] });
  const submit = async () => {
    try {
      await close({ variables: { id: club.id } });
      toast(`${club.name} is closed.`);
      onDone();
    } catch (e) { toast(errText(e, "Couldn't close the club. Try again.")); }
  };
  return (
    <>
      <p className="sh-k">{club.name}</p>
      <h3>Close this club?</h3>
      <p>Members can no longer open it, and its invites and join links stop working. This can't be undone from the app.</p>
      <button type="button" className="cta" disabled={loading} onClick={() => void submit()}>Close the club<X /></button>
    </>
  );
}

function AppStaff({ staff, isOwner }: { staff: AppStaffDto[]; isOwner: boolean }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [add, adding] = useMutation(ADD_APP_ADMIN, { refetchQueries: [{ query: CONSOLE }] });
  const [remove] = useMutation(REMOVE_APP_ADMIN, { refetchQueries: [{ query: CONSOLE }] });
  const submit = async () => {
    try {
      await add({ variables: { email } });
      toast("App Admin added.");
      setEmail("");
    } catch (e) { toast(errText(e, "Couldn't add them. Try again.")); }
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>App Admins</h3><p>{isOwner ? "They can create and close clubs. Only you can add or remove them." : "Only the App Owner can change this list."}</p></div></div>
      <div className="list">
        {staff.map((s) => (
          <div key={s.userId} className="li">
            <span className="ic"><ShieldCheck /></span>
            <div><div className="t">{s.displayName}{s.role === "OWNER" && <span className="tag">Owner</span>}</div><div className="d">{s.email ?? "No email"} · since {onDay(s.grantedAt)}</div></div>
            {isOwner && s.role === "ADMIN" && (
              <button type="button" className="linkbtn" onClick={() => {
                remove({ variables: { userId: s.userId } }).then(() => toast(`${s.displayName} is no longer an App Admin.`), (e: Error) => toast(e.message));
              }}>Remove</button>
            )}
          </div>
        ))}
      </div>
      {isOwner && (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div className="field" style={{ maxWidth: "none" }}>
            <label htmlFor="staff-email">Add an App Admin</label>
            <input id="staff-email" className="txt" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their TrackFit email" />
            <p className="help">They need to have signed in to TrackFit once.</p>
          </div>
          <button type="button" className="ghost" style={{ justifySelf: "start" }} disabled={adding.loading || !email.trim()} onClick={() => void submit()}><UserPlus />Add</button>
        </div>
      )}
    </section>
  );
}

function Reports() {
  const toast = useToast();
  const q = useQuery<{ consoleReports: ConsoleReportDto[] }>(CONSOLE_REPORTS, { fetchPolicy: "cache-and-network" });
  const [resolve, { loading }] = useMutation(RESOLVE_CLUB_REPORT, { refetchQueries: [{ query: CONSOLE_REPORTS }], awaitRefetchQueries: true });
  const reports = q.data?.consoleReports ?? [];
  // One row per reported post or comment; the rest are counted.
  const items = reports.filter((r, i) => reports.findIndex((x) => x.item.postId === r.item.postId && x.item.commentId === r.item.commentId) === i);
  const act = (r: ConsoleReportDto, remove: boolean) => {
    resolve({ variables: { id: r.id, remove } }).then(() => toast(remove ? "Removed." : "Left up. The reports are closed."), (e: Error) => toast(e.message));
  };
  return (
    <section className="card fadein">
      <div className="card-h"><div><h3>Reports</h3><p>{items.length ? `${items.length} waiting` : "Nothing reported"}</p></div></div>
      {q.loading && !q.data ? <PulseLoader small /> : items.length === 0 ? <p className="help">When someone reports a post or comment, it shows here and App staff get a notification.</p> : (
        <div className="list">
          {items.map((r) => (
            <div key={r.id} className="li" style={{ gridTemplateColumns: "36px minmax(0,1fr)", alignItems: "start" }}>
              <span className="ic"><Flag /></span>
              <div>
                <div className="t">{r.item.commentId ? "Comment" : KIND_LABEL[r.item.kind]} by {r.item.authorName} in {r.clubName}{r.item.deleted && <span className="tag">Already deleted</span>}</div>
                <div className="d">“{r.reason}” · {r.reporterName}{r.reportCount > 1 ? ` and ${r.reportCount - 1} other${r.reportCount > 2 ? "s" : ""}` : ""} · {timeAgo(r.createdAt)}</div>
                {r.item.body && <p className="report-body">{r.item.body}</p>}
                {r.item.media && (r.item.media.kind === "VIDEO" ? <video className="post-media" src={r.item.media.url} controls playsInline preload="metadata" /> : <img className="post-media" src={r.item.media.url} alt="Reported" />)}
                <div className="btnrow" style={{ marginTop: 10 }}>
                  {!r.item.deleted && <button type="button" className="ghost" disabled={loading} onClick={() => act(r, true)}><X />Remove it</button>}
                  <button type="button" className="linkbtn" disabled={loading} onClick={() => act(r, false)}>{r.item.deleted ? "Close report" : "Leave it up"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
