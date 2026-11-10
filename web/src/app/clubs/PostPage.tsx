import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Flag, Send, Trash2, Video, X } from "lucide-react";
import { CLUB, COMMENT_ON_CLUB_POST, CLUB_POST, DELETE_CLUB_COMMENT, REPORT_CLUB_POST } from "../../graphql/operations";
import type { ClubCommentDto, ClubDto, ClubPostDto } from "../../graphql/types";
import { DEFAULT_FEED_LIMITS, checkClubFile, useClubUpload, type CheckedFile } from "../../lib/clubMedia";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { useToast } from "../../components/ui/Toast";
import { Author, MediaView, PostCard } from "./PostBits";

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** /clubs/:id/posts/:postId: one post in full, with its comments. */
export function PostPage() {
  const { id = "", postId = "" } = useParams();
  const q = useQuery<{ clubPost: ClubPostDto | null }>(CLUB_POST, { variables: { id: postId }, fetchPolicy: "cache-and-network" });
  const c = useQuery<{ club: ClubDto | null }>(CLUB, { variables: { id }, fetchPolicy: "cache-first" });
  const back = <Link className="back-link" to={`/clubs/${id}`}><ArrowLeft />Back to {c.data?.club?.name ?? "the club"}</Link>;
  if (q.loading && !q.data) return <PulseLoader label="Loading the post" />;
  const post = q.data?.clubPost;
  if (!post) return <div className="view-in">{back}<section className="card"><h3>Post not found</h3><p className="help">It may have been deleted, or you're no longer in this club.</p></section></div>;
  const club = c.data?.club;
  return (
    <div className="view-in post-page">
      {back}
      <PostCard post={post} clubName={club?.name ?? ""} full />
      <section className="card fadein">
        <div className="card-h"><div><h3>Comments</h3><p>{post.commentCount ? `${post.commentCount} so far` : "Be the first"}</p></div></div>
        {(post.comments ?? []).length > 0 && <div className="comments">{post.comments!.map((cm) => <Comment key={cm.id} c={cm} postId={post.id} />)}</div>}
        <AddComment postId={post.id} clubId={post.clubId} isCoach={!!club?.me.isCoach} limits={club?.feedLimits ?? DEFAULT_FEED_LIMITS} />
      </section>
    </div>
  );
}

function Comment({ c, postId }: { c: ClubCommentDto; postId: string }) {
  const toast = useToast();
  const [del, deleting] = useMutation(DELETE_CLUB_COMMENT);
  const [report] = useMutation(REPORT_CLUB_POST);
  return (
    <div className="comment">
      <Author person={c.author} at={c.createdAt} />
      {c.body && <p className="post-b">{c.body}</p>}
      {c.media && <MediaView media={c.media} alt={`Video reply from ${c.author.displayName}`} />}
      <div className="btnrow">
        {c.canDelete && <button type="button" className="linkbtn" disabled={deleting.loading} onClick={() => { del({ variables: { id: c.id } }).then(() => toast("Comment deleted."), (e: Error) => toast(e.message)); }}><Trash2 />Delete</button>}
        {!c.author.isMe && <button type="button" className="linkbtn" onClick={() => {
          report({ variables: { postId, commentId: c.id, reason: "Comment reported from the post page" } }).then(() => toast("Thanks. The App Admins will take a look."), (e: Error) => toast(e.message));
        }}><Flag />Report</button>}
      </div>
    </div>
  );
}

function AddComment({ postId, clubId, isCoach, limits }: { postId: string; clubId: string; isCoach: boolean; limits: typeof DEFAULT_FEED_LIMITS }) {
  const toast = useToast();
  const upload = useClubUpload();
  const input = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [video, setVideo] = useState<CheckedFile | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [comment] = useMutation(COMMENT_ON_CLUB_POST);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const checked = await checkClubFile(f, "COMMENT", limits, isCoach);
    if ("error" in checked) toast(checked.error); else setVideo(checked);
  };
  const send = async () => {
    try {
      let mediaId: string | null = null;
      if (video) { setProgress(0); mediaId = await upload(clubId, "COMMENT", video, setProgress); }
      setProgress(1);
      await comment({ variables: { postId, body, mediaId } });
      setBody(""); setVideo(null);
      if (input.current) input.current.value = "";
    } catch (e) { toast(errText(e, "Couldn't post your comment. Try again.")); }
    finally { setProgress(null); }
  };
  const busy = progress !== null;
  return (
    <div className="add-comment">
      <label htmlFor="comment" className="sr-only">Add a comment</label>
      <textarea id="comment" className="txt" rows={2} value={body} maxLength={limits.commentChars} placeholder="Add a comment" onChange={(e) => setBody(e.target.value)} />
      {video && <div className="chiprow"><span className="chip on"><Video />Video, {Math.round(video.seconds ?? 0)} s</span><button type="button" className="iconbtn" aria-label="Remove video" onClick={() => setVideo(null)}><X /></button></div>}
      <div className="btnrow">
        {isCoach && (
          <>
            <input ref={input} type="file" accept="video/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
            {!video && <button type="button" className="ghost" disabled={busy} onClick={() => input.current?.click()}><Video />Reply with a video</button>}
          </>
        )}
        <button type="button" className="cta small-cta" disabled={busy || (!body.trim() && !video)} onClick={() => void send()}>
          {busy ? (progress! < 1 ? `Uploading ${Math.round(progress! * 100)}%` : "Sending…") : <>Send<Send /></>}
        </button>
      </div>
      {isCoach && <p className="help">Coaches can reply with a video of up to {limits.videoSeconds} seconds, for example a form correction.</p>}
    </div>
  );
}
