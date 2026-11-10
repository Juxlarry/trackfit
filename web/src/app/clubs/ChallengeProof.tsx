import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { Check, Droplet, Send, Trophy } from "lucide-react";
import { POST_CLUB_CHALLENGE_WIN, SUBMIT_CLUB_CHALLENGE_ENTRY } from "../../graphql/operations";
import type { ClubChallengeDto, MyClubChallengeDto } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import { REFETCH_CHALLENGES } from "../../lib/challengeKinds";
import { useClubUpload, type CheckedFile } from "../../lib/clubMedia";
import { cadenceText, challengeProgress, challengeRule } from "../../lib/clubFormat";
import { useToast } from "../../components/ui/Toast";
import { REFETCH_LOGS } from "../planUtil";
import { MediaPicker } from "./MediaPicker";

/**
 * Proof for a club challenge, and the win post once it's finished. Kept apart
 * from Challenges.tsx so the app's loggers (AppSheets, FoodSheet, Fuel) can use
 * them without importing the rest.
 */

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export interface ProofResult { seconds?: number | null; reps?: number | null; weights?: { exerciseId: string; weightKg: number }[] }

/**
 * "Submit result": a photo or video, and the result where the log doesn't
 * have it. If it finishes the challenge, the win card follows.
 */
export function ChallengeProof({ challenge: c, date, activityId, result, onDone }: {
  challenge: ClubChallengeDto; date: string; activityId?: string; result?: ProofResult; onDone: () => void;
}) {
  const toast = useToast();
  const upload = useClubUpload();
  const imperial = useUnits().unit === "lb";
  const [file, setFile] = useState<CheckedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mins, setMins] = useState(result?.seconds ? String(Math.floor(result.seconds / 60)) : "");
  const [secs, setSecs] = useState(result?.seconds ? String(result.seconds % 60) : "");
  const [reps, setReps] = useState(result?.reps ? String(result.reps) : "");
  const [progress, setProgress] = useState<number | null>(null);
  const [win, setWin] = useState<string | null>(null);
  const [submit] = useMutation<{ submitClubChallengeEntry: { completed: boolean; mine: MyClubChallengeDto | null } }>(SUBMIT_CLUB_CHALLENGE_ENTRY, {
    refetchQueries: [...REFETCH_CHALLENGES, ...(c.kind === "WORKOUT" ? REFETCH_LOGS : [])],
  });
  if (win !== null) return <WinCard challenge={c} draft={win} onDone={onDone} />;

  const seconds = (Number(mins) || 0) * 60 + (Number(secs) || 0);
  const send = async () => {
    setError(null);
    if (!file) { setError("Add a photo or video as proof."); return; }
    if (c.kind === "WORKOUT" && !seconds && !(Number(reps) > 0)) { setError("Add the time it took or the reps you did."); return; }
    try {
      setProgress(0);
      const mediaId = await upload(c.clubId, "PROOF", file, setProgress);
      const res = await submit({ variables: { challengeId: c.id, input: {
        date, mediaId, note: note.trim() || null, activityId: activityId ?? null,
        ...(c.kind === "WORKOUT" ? { resultSeconds: seconds > 0 ? Math.round(seconds) : null, resultReps: Number(reps) > 0 ? Math.round(Number(reps)) : null, weights: result?.weights ?? [] } : {}),
      } } });
      const out = res.data?.submitClubChallengeEntry;
      if (out?.completed && out.mine?.winDraft) { setWin(out.mine.winDraft); return; }
      toast(out?.mine ? `Proof sent: ${challengeProgress(c, out.mine.done, out.mine.total)}.` : "Proof sent.");
      onDone();
    } catch (e) { setError(errText(e, "Couldn't send that. Try again.")); }
    setProgress(null);
  };

  return (
    <>
      <p className="sh-k">Challenge · {c.clubName}</p>
      <h3>{c.title}</h3>
      <p>{challengeRule(c, imperial)}, {cadenceText(c).toLowerCase()}. Add a photo or video as proof. It goes on the challenge's page, not the feed.</p>
      {c.kind === "WORKOUT" && (
        <>
          <p className="rt-label">Your result</p>
          <div className="row2">
            <div className="field"><label htmlFor="ch-min">Time taken</label>
              <span className="time-in">
                <input id="ch-min" className="txt" type="number" inputMode="numeric" min={0} max={600} placeholder="min" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Minutes" />
                <b>:</b>
                <input className="txt" type="number" inputMode="numeric" min={0} max={59} placeholder="sec" value={secs} onChange={(e) => setSecs(e.target.value)} aria-label="Seconds" />
              </span>
            </div>
            <div className="field"><label htmlFor="ch-reps">Or reps <span className="opt-l">Optional</span></label>
              <input id="ch-reps" className="txt" type="number" inputMode="numeric" min={1} value={reps} onChange={(e) => setReps(e.target.value)} /></div>
          </div>
          {c.timeLimitMinutes && <p className="help">The limit is {c.timeLimitMinutes} minutes. Over it doesn't count.</p>}
        </>
      )}
      {c.kind === "ACTIVITY" && activityId && <p className="help"><Check className="inl" />Your logged activity is the result.</p>}
      {c.kind === "WATER" && <p className="help"><Droplet className="inl" />Your water logged for the day is the result.</p>}
      <p className="rt-label">Proof</p>
      <MediaPicker purpose="PROOF" file={file} onFile={(f, err) => { setFile(f); setError(err ?? null); }} />
      <div className="field" style={{ maxWidth: "none", marginTop: 12 }}>
        <label htmlFor="ch-note">Note <span className="opt-l">Optional</span></label>
        <input id="ch-note" className="txt" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Felt strong today" />
      </div>
      {progress !== null && <div className="bar upl" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /></div>}
      {error && <div className="err" role="alert"><span>{error}</span></div>}
      <button type="button" className="cta" style={{ marginTop: 16 }} disabled={progress !== null} onClick={() => void send()}>Send proof<Send /></button>
    </>
  );
}

/** Once every day (or week) has proof: post the win to the club, with the latest proof. */
export function WinCard({ challenge: c, draft, onDone }: { challenge: Pick<ClubChallengeDto, "id" | "clubName" | "title">; draft: string; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(draft);
  const [post, { loading }] = useMutation(POST_CLUB_CHALLENGE_WIN, { refetchQueries: ["ClubFeed", ...REFETCH_CHALLENGES] });
  const go = async () => {
    try {
      await post({ variables: { challengeId: c.id, body: text.trim() || null } });
      toast(`Win posted to ${c.clubName}.`);
      onDone();
    } catch (e) { toast(errText(e, "Couldn't post that. Try again.")); }
  };
  return (
    <>
      <div className="burst"><Trophy /></div>
      <h3 style={{ marginTop: 16 }}>Challenge done</h3>
      <p>You finished {c.title}. Share the win with {c.clubName}? Your latest proof goes with it.</p>
      <div className="field" style={{ maxWidth: "none" }}>
        <label htmlFor="win-text" className="sr-only">Your post</label>
        <textarea id="win-text" className="txt" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="btnrow" style={{ marginTop: 14 }}>
        <button type="button" className="cta small-cta" disabled={loading} onClick={() => void go()}>Post win<Send /></button>
        <button type="button" className="linkbtn" onClick={onDone}>Not now</button>
      </div>
    </>
  );
}

