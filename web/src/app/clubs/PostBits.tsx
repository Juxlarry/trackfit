import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@apollo/client/react";
import { Clock, Dumbbell, Flag, MessageCircle, MoreHorizontal, Pencil, Scale, Trash2, Trophy } from "lucide-react";
import { DELETE_CLUB_POST, EDIT_CLUB_POST, REACT_TO_CLUB_POST, REPORT_CLUB_POST } from "../../graphql/operations";
import type { ClubActivityDto, ClubMediaDto, ClubPersonDto, ClubPostDto, ClubReaction, ClubWorkoutDto } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import {
  KIND_LABEL, REACTIONS, REACTION_EMOJI, REACTION_LABEL, distanceText, initials, minutesText, paceText, personLabel, speedText, timeAgo,
} from "../../lib/clubFormat";
import { ChipGroup } from "../../components/ui/Options";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function Author({ person, at, kind, edited }: { person: ClubPersonDto; at: string; kind?: string; edited?: boolean }) {
  const role = personLabel(person);
  return (
    <div className="post-who">
      <span className="avatar sm" aria-hidden="true">{initials(person.displayName)}</span>
      <div>
        <div className="t">{person.displayName}{person.isMe && <span className="tag">You</span>}{role && <span className={`tag${person.inClub ? "" : " gone"}`}>{role}</span>}</div>
        <div className="d">{kind ? `${kind} · ` : ""}<time dateTime={at}>{timeAgo(at)}</time>{edited ? " · edited" : ""}</div>
      </div>
    </div>
  );
}

export function MediaView({ media, alt }: { media: ClubMediaDto; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <div className="post-media gone">This photo or video link has expired. Pull to refresh, or reopen the post.</div>;
  return media.kind === "VIDEO"
    ? <video className="post-media" src={media.url} controls playsInline preload="metadata" onError={() => setBroken(true)} />
    : <img className="post-media" src={media.url} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

/** Duration, sets, volume and PRs, in the viewer's units. */
export function WorkoutStats({ w }: { w: ClubWorkoutDto }) {
  const units = useUnits();
  // One chip per lift: the API lists the heaviest set before the estimated 1RM.
  const headline = w.prs.filter((p, i) => p.type !== "MOST_REPS_AT_WEIGHT" && w.prs.findIndex((x) => x.exerciseName === p.exerciseName && x.type !== "MOST_REPS_AT_WEIGHT") === i);
  return (
    <div className="post-stats">
      <div className="stat-row">
        {w.durationMinutes != null && <span><Clock />{minutesText(w.durationMinutes)}</span>}
        <span><Dumbbell />{w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}, {w.setCount} set{w.setCount === 1 ? "" : "s"}</span>
        {w.volumeKg > 0 && <span>{Math.round(units.toDisplay(w.volumeKg)).toLocaleString("en-GB")} {units.unit} moved</span>}
      </div>
      {headline.length > 0 && (
        <div className="pr-list">
          {headline.map((p) => <span key={`${p.exerciseName}${p.type}`} className="prchip"><Trophy />{p.exerciseName} {units.fmt(p.weightKg)} × {p.reps}</span>)}
        </div>
      )}
    </div>
  );
}

/** Every exercise with its sets: what opening a workout post shows. */
export function WorkoutTable({ w }: { w: ClubWorkoutDto }) {
  const units = useUnits();
  return (
    <div className="wtable">
      {w.exercises.map((e) => (
        <div key={e.name} className="wrow">
          <b>{e.name}{e.swappedFor && <small className="wswap">swapped for {e.swappedFor}</small>}</b>
          <span>{e.sets.map((s, i) => <span key={i} className="wset">{s.weightKg > 0 ? `${units.toDisplay(s.weightKg)} ${units.unit}` : "BW"} × {s.reps}</span>)}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityStats({ a }: { a: ClubActivityDto }) {
  const imperial = useUnits().unit === "lb";
  const km = a.distanceKm && a.distanceKm > 0 ? a.distanceKm : null;
  return (
    <div className="post-stats">
      <div className="stat-row">
        <span><b>{a.label}</b></span>
        {km && <span>{distanceText(km, imperial)}</span>}
        <span><Clock />{minutesText(a.durationMinutes)}</span>
        {km && (a.activityType === "CYCLE" ? <span>{speedText(a.durationMinutes, km, imperial)}</span> : ["RUN", "WALK", "HIKE"].includes(a.activityType) && <span>{paceText(a.durationMinutes, km, imperial)}</span>)}
        {a.avgHeartRate && <span>{a.avgHeartRate} bpm</span>}
        {a.effort && <span>{a.effort[0] + a.effort.slice(1).toLowerCase()}</span>}
      </div>
    </div>
  );
}

export function WeightChange({ kg }: { kg: number }) {
  const units = useUnits();
  const sign = kg > 0 ? "+" : kg < 0 ? "−" : "±";
  return <div className="wchange"><Scale />{sign}{units.fmt(Math.abs(kg))} since Day 1</div>;
}

export function ReactionBar({ post }: { post: Pick<ClubPostDto, "id" | "myReaction" | "reactions"> }) {
  const toast = useToast();
  const [react] = useMutation(REACT_TO_CLUB_POST);
  const pick = (r: ClubReaction) => {
    const next = post.myReaction === r ? null : r;
    // Shown straight away; the server's answer replaces it.
    const counts = new Map(post.reactions.map((x) => [x.reaction, x.count]));
    if (post.myReaction) counts.set(post.myReaction, (counts.get(post.myReaction) ?? 1) - 1);
    if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
    react({
      variables: { postId: post.id, reaction: next },
      optimisticResponse: {
        reactToClubPost: {
          __typename: "ClubPost", id: post.id, myReaction: next,
          reactions: [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([reaction, count]) => ({ __typename: "ClubReactionCount", reaction, count })),
        },
      },
    }).catch((e: unknown) => toast(errText(e, "Couldn't react. Try again.")));
  };
  return (
    <div className="rx" role="group" aria-label="Reactions">
      {REACTIONS.map((r) => {
        const n = post.reactions.find((x) => x.reaction === r)?.count ?? 0;
        return (
          <button key={r} type="button" className={post.myReaction === r ? "on" : ""} aria-pressed={post.myReaction === r} aria-label={`${REACTION_LABEL[r]}${n ? `, ${n}` : ""}`} onClick={() => pick(r)}>
            <span aria-hidden="true">{REACTION_EMOJI[r]}</span>{n > 0 && <b>{n}</b>}
          </button>
        );
      })}
    </div>
  );
}

/** One post in the feed, or in full on its own page (`full`). */
export function PostCard({ post, clubName, full }: { post: ClubPostDto; clubName: string; full?: boolean }) {
  const [menu, setMenu] = useState(false);
  const open = `/clubs/${post.clubId}/posts/${post.id}`;
  return (
    <article className="card post fadein" aria-label={`${post.author.displayName}: ${KIND_LABEL[post.kind]}`}>
      <header className="post-h">
        <Author person={post.author} at={post.createdAt} kind={KIND_LABEL[post.kind]} edited={!!post.editedAt} />
        <button type="button" className="iconbtn" aria-label="Post options" onClick={() => setMenu(true)}><MoreHorizontal /></button>
      </header>
      {post.body && <p className="post-b">{post.body}</p>}
      {post.challenge && <Link to={`/clubs/${post.clubId}/challenges/${post.challenge.id}`} className="post-ch"><Trophy />Challenge: {post.challenge.title}</Link>}
      {post.workout && (full ? <><WorkoutStats w={post.workout} /><WorkoutTable w={post.workout} /></> : <Link to={open} className="post-link"><WorkoutStats w={post.workout} /><span className="more">See the full workout</span></Link>)}
      {post.activity && <ActivityStats a={post.activity} />}
      {(post.kind === "WORKOUT" && !post.workout) && <p className="help">The workout itself was deleted.</p>}
      {post.weightChangeKg != null && <WeightChange kg={post.weightChangeKg} />}
      {post.media && <MediaView media={post.media} alt={post.body ? `Photo: ${post.body.slice(0, 80)}` : `${post.author.displayName}'s photo`} />}
      <footer className="post-f">
        <ReactionBar post={post} />
        {!full && <Link to={open} className="linkbtn"><MessageCircle />{post.commentCount > 0 ? post.commentCount : "Comment"}</Link>}
      </footer>
      <Sheet open={menu} onClose={() => setMenu(false)} label="Post options">
        {menu && <PostActions post={post} clubName={clubName} onDone={() => setMenu(false)} />}
      </Sheet>
    </article>
  );
}

const REPORT_REASONS = ["Spam", "Unkind or harassing", "Unsafe advice", "Not appropriate", "Something else"];

function PostActions({ post, clubName, onDone }: { post: ClubPostDto; clubName: string; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"menu" | "edit" | "delete" | "report">("menu");
  const [body, setBody] = useState(post.body);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [edit, editing] = useMutation(EDIT_CLUB_POST);
  const [del, deleting] = useMutation(DELETE_CLUB_POST, { refetchQueries: ["ClubFeed"], update: (cache) => { cache.evict({ id: cache.identify({ __typename: "ClubPost", id: post.id }) }); cache.gc(); } });
  const [report, reporting] = useMutation(REPORT_CLUB_POST);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast(done); onDone(); } catch (e) { toast(errText(e, "Couldn't do that. Try again.")); }
  };

  if (mode === "edit") {
    return (
      <>
        <p className="sh-k">{clubName}</p>
        <h3>Edit your post</h3>
        <div className="field" style={{ maxWidth: "none" }}>
          <label htmlFor="edit-body">Text</label>
          <textarea id="edit-body" className="txt" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
        </div>
        <button type="button" className="cta" style={{ marginTop: 14 }} disabled={editing.loading || body.trim() === post.body.trim()} onClick={() => void run(() => edit({ variables: { id: post.id, body } }), "Post updated.")}>Save<Pencil /></button>
      </>
    );
  }
  if (mode === "delete") {
    return (
      <>
        <p className="sh-k">{clubName}</p>
        <h3>Delete this post?</h3>
        <p>{post.author.isMe ? "It's removed for everyone in the club, with its photo or video and comments. Your logged workout stays in your history." : `It's removed for everyone. ${post.author.displayName} isn't told who deleted it.`}</p>
        <button type="button" className="cta" disabled={deleting.loading} onClick={() => void run(() => del({ variables: { id: post.id } }), "Post deleted.")}>Delete post<Trash2 /></button>
      </>
    );
  }
  if (mode === "report") {
    return (
      <>
        <p className="sh-k">{clubName}</p>
        <h3>Report this post</h3>
        <p>It goes to TrackFit's App Admins, not to the club. {post.author.displayName} isn't told who reported it.</p>
        <ChipGroup label="Reason" options={REPORT_REASONS.map((r) => ({ value: r, label: r }))} selected={[reason]} onPick={setReason} />
        <div className="field" style={{ maxWidth: "none", marginTop: 14 }}>
          <label htmlFor="report-detail">Anything else? <span className="opt-l">Optional</span></label>
          <textarea id="report-detail" className="txt" value={detail} maxLength={400} onChange={(e) => setDetail(e.target.value)} />
        </div>
        <button type="button" className="cta" style={{ marginTop: 14 }} disabled={reporting.loading}
          onClick={() => void run(() => report({ variables: { postId: post.id, reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason } }), "Thanks. The App Admins will take a look.")}>Send report<Flag /></button>
      </>
    );
  }
  return (
    <>
      <p className="sh-k">{KIND_LABEL[post.kind]} by {post.author.isMe ? "you" : post.author.displayName}</p>
      <h3>Post options</h3>
      <div className="opts">
        {post.canEdit && <button type="button" className="opt noico" onClick={() => setMode("edit")}><span className="t">Edit the text</span><span className="tick"><Pencil /></span></button>}
        {post.canDelete && <button type="button" className="opt noico" onClick={() => setMode("delete")}><span className="t">Delete post</span><span className="tick"><Trash2 /></span></button>}
        {!post.author.isMe && <button type="button" className="opt noico" onClick={() => setMode("report")}><span className="t">Report to TrackFit</span><span className="tick"><Flag /></span></button>}
      </div>
    </>
  );
}
