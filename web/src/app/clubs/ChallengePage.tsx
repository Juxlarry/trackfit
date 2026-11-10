import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Check, Send, Trash2, Trophy } from "lucide-react";
import { CLUB_CHALLENGE, COMMENT_ON_CLUB_CHALLENGE, DELETE_CLUB_CHALLENGE_COMMENT, END_CLUB_CHALLENGE } from "../../graphql/operations";
import type { ClubChallengePageDto } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import { REFETCH_CHALLENGES, entryText } from "../../lib/challengeKinds";
import { challengeProgress, dateSpan, timeAgo } from "../../lib/clubFormat";
import { localToday } from "../../lib/dates";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { Sheet } from "../../components/ui/Sheet";
import { useToast } from "../../components/ui/Toast";
import { ViewHead } from "../AppLayout";
import { ChallengeDetails, useChallengeAction } from "./Challenges";
import { useRespond } from "./challengeHooks";
import { Author, MediaView } from "./PostBits";

const STATE_TEXT = { UPCOMING: "Coming up", RUNNING: "On now", FINISHED: "Finished", ENDED: "Ended early" } as const;

/** /clubs/:id/challenges/:challengeId: details and video, who's in, each day's proof, comments. */
export function ChallengePage() {
  const { id = "", challengeId = "" } = useParams();
  const toast = useToast();
  const imperial = useUnits().unit === "lb";
  const today = localToday();
  const q = useQuery<{ clubChallenge: ClubChallengePageDto | null }>(CLUB_CHALLENGE, { variables: { id: challengeId }, fetchPolicy: "cache-and-network" });
  const { answer, loading: answering } = useRespond();
  const action = useChallengeAction(today);
  const [body, setBody] = useState("");
  const [ending, setEnding] = useState(false);
  const [comment, commenting] = useMutation(COMMENT_ON_CLUB_CHALLENGE, { refetchQueries: ["ClubChallenge"] });
  const [delComment] = useMutation(DELETE_CLUB_CHALLENGE_COMMENT, { refetchQueries: ["ClubChallenge"] });
  const [end, endingQ] = useMutation(END_CLUB_CHALLENGE, { refetchQueries: REFETCH_CHALLENGES });

  if (q.loading && !q.data) return <PulseLoader label="Loading the challenge" />;
  const page = q.data?.clubChallenge;
  const back = <Link className="back-link" to={`/clubs/${id}?tab=challenges`}><ArrowLeft />Back to challenges</Link>;
  if (!page) {
    return <div className="view-in">{back}<section className="card"><h3>Challenge not found</h3><p className="help">It may be in a club you've left.</p></section></div>;
  }
  const c = page.challenge;
  const mine = page.mine;
  const open = c.state === "RUNNING" || c.state === "UPCOMING";

  const send = async () => {
    try { await comment({ variables: { id: c.id, body } }); setBody(""); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't post that."); }
  };

  return (
    <div className="view-in">
      {back}
      <ViewHead kicker={`${c.clubName} · ${STATE_TEXT[c.state]}`} title={c.title} />
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <ChallengeDetails c={c} imperial={imperial} />
            {mine ? (
              <div className="ch-mine">
                <div className="mb">
                  <div className="l"><span>Your progress</span><b>{challengeProgress(c, mine.done, mine.total)}</b></div>
                  <div className="bar"><i style={{ width: `${mine.total ? (mine.done / mine.total) * 100 : 0}%` }} /></div>
                </div>
                {mine.completed && mine.winDraft ? (
                  <button type="button" className="cta small-cta" onClick={() => action.win(c, mine.winDraft!)}>Post your win<Trophy /></button>
                ) : mine.completed ? (
                  <p className="help"><Check className="inl" />Finished. Well done.</p>
                ) : c.state !== "RUNNING" ? (
                  <p className="help">{c.state === "UPCOMING" ? `Starts ${dateSpan(c.startsOn, c.startsOn)}.` : "This challenge is over."}</p>
                ) : mine.doneForPeriod ? (
                  <p className="help"><Check className="inl" />Proof sent for {c.cadence === "DAILY" ? "today" : "this week"}.</p>
                ) : (
                  <div className="btnrow">
                    <button type="button" className="cta small-cta" onClick={() => action.go(c)}>{action.label(c)}</button>
                    {c.kind !== "ACTIVITY" && c.kind !== "WORKOUT" && <button type="button" className="ghost" onClick={() => action.proof(c)}>Send proof</button>}
                  </div>
                )}
              </div>
            ) : open && !c.coach.isMe ? (
              <div className="btnrow" style={{ marginTop: 16 }}>
                <button type="button" className="cta small-cta" disabled={answering} onClick={() => void answer(c, true)}>Take on challenge<Check /></button>
                {c.myAnswer !== "DECLINED" && <button type="button" className="ghost" disabled={answering} onClick={() => void answer(c, false)}>Not for me</button>}
              </div>
            ) : null}
            {c.myAnswer === "DECLINED" && open && <p className="help">You said not for me. You can still take it on.</p>}
            {c.canEnd && <button type="button" className="linkbtn" style={{ marginTop: 14 }} onClick={() => setEnding(true)}><Trash2 />End challenge</button>}
          </section>

          <section className="card fadein">
            <div className="card-h"><div><h3>Comments</h3></div></div>
            {page.comments.length === 0 && <p className="help">No comments yet.</p>}
            {page.comments.length > 0 && (
              <div className="comments">
                {page.comments.map((k) => (
                  <div key={k.id} className="comment">
                    <Author person={k.author} at={k.createdAt} />
                    <p className="post-b">{k.body}</p>
                    {k.canDelete && <div className="btnrow"><button type="button" className="linkbtn" onClick={() => void delComment({ variables: { id: k.id } })}><Trash2 />Delete</button></div>}
                  </div>
                ))}
              </div>
            )}
            <div className="add-comment">
              <label htmlFor="chc" className="sr-only">Add a comment</label>
              <textarea id="chc" className="txt" rows={2} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" />
              <div className="btnrow"><button type="button" className="cta small-cta" disabled={!body.trim() || commenting.loading} onClick={() => void send()}>Send<Send /></button></div>
            </div>
          </section>
        </div>

        <div className="acol">
          <section className="card fadein">
            <div className="card-h"><div><h3>Taking part</h3><p>{page.participants.length ? `${page.participants.length} ${page.participants.length === 1 ? "person" : "people"}` : "Nobody yet"}</p></div></div>
            {page.participants.map((p) => (
              <div key={p.person.userId} className="ch-person">
                <div className="ch-person-h">
                  <b>{p.person.displayName}{p.person.isMe ? " (you)" : ""}</b>
                  <span className={`tag${p.completed ? " ok" : ""}`}>{p.completed ? "Finished" : challengeProgress(c, p.done, p.total)}</span>
                </div>
                {p.entries.length > 0 && (
                  <div className="ch-entries">
                    {p.entries.map((e) => (
                      <figure key={e.id} className="ch-entry">
                        {e.proof && <MediaView media={e.proof} alt={`${p.person.displayName}'s proof for ${e.onDate}`} />}
                        <figcaption>
                          <b>{new Date(`${e.onDate}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</b>
                          {entryText(c, e, imperial) && <span>{entryText(c, e, imperial)}</span>}
                          {e.note && <span>{e.note}</span>}
                          <i>{timeAgo(e.createdAt)}</i>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
      {action.sheets}
      <Sheet open={ending} onClose={() => setEnding(false)} label="End this challenge?">
        <h3>End {c.title}?</h3>
        <p>It comes off everyone's Today and the pop-up. Proof already sent stays here.{c.coach.isMe ? " It still counts toward your 3 this week." : ""}</p>
        <button type="button" className="cta" disabled={endingQ.loading} onClick={async () => {
          try { await end({ variables: { id: c.id } }); toast("Challenge ended."); setEnding(false); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't end it."); }
        }}>End challenge</button>
      </Sheet>
    </div>
  );
}
