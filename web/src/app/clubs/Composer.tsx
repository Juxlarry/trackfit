import { useEffect, useRef, useState } from "react";
import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { Activity, Camera, Check, Dumbbell, ImagePlus, Salad, Send, TrendingUp, Video, X } from "lucide-react";
import { ACTIVITY_LOGS, CLUB_SHARE_DRAFT, CREATE_CLUB_POST, SESSIONS_BETWEEN } from "../../graphql/operations";
import type { ActivityDto, ClubFeedLimitsDto, ClubShareDraftDto, SessionSummaryDto } from "../../graphql/types";
import { addDaysIso, dayShort, localToday } from "../../lib/dates";
import { DEFAULT_FEED_LIMITS, checkClubFile, useClubUpload, type CheckedFile } from "../../lib/clubMedia";
import { localDateOf } from "../planUtil";
import { OptionList } from "../../components/ui/Options";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { useToast } from "../../components/ui/Toast";

type FreeKind = "PROGRESS" | "MEAL" | "COACH_VIDEO";
export type ShareLink = { sessionId: string } | { activityId: string };

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Writing a post. From a club page it offers progress, a meal, a coach video
 * (coaches) or one of your recent logs; from the share prompt it's that log,
 * with the drafted text to edit and the clubs to post to.
 */
export function Composer({ clubs, isCoach, limits = DEFAULT_FEED_LIMITS, link: givenLink, draft: givenDraft, onDone }: {
  clubs: { id: string; name: string }[];
  /** Coach in every club offered (coach videos and 60-second clips). */
  isCoach: boolean;
  limits?: ClubFeedLimitsDto;
  link?: ShareLink;
  draft?: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const client = useApolloClient();
  const upload = useClubUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FreeKind | "LOG" | null>(givenLink ? "LOG" : null);
  const [link, setLink] = useState<ShareLink | null>(givenLink ?? null);
  const [body, setBody] = useState(givenDraft ?? "");
  const [clubIds, setClubIds] = useState(clubs.map((c) => c.id));
  const [weight, setWeight] = useState(true);
  const [file, setFile] = useState<CheckedFile | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [create] = useMutation(CREATE_CLUB_POST, { refetchQueries: ["ClubFeed"] });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const checked = await checkClubFile(f, "POST", limits, isCoach);
    if ("error" in checked) { setError(checked.error); return; }
    setFile(checked);
    setPreview(URL.createObjectURL(f));
  };
  const clearFile = () => { setFile(null); setPreview(null); if (fileInput.current) fileInput.current.value = ""; };

  const chooseLog = async (l: ShareLink) => {
    setLink(l);
    try {
      const { data } = await client.query<{ clubShareDraft: ClubShareDraftDto }>({ query: CLUB_SHARE_DRAFT, variables: l, fetchPolicy: "network-only" });
      setBody(data?.clubShareDraft.text ?? "");
    } catch { setBody(""); }
  };

  const busy = progress !== null;
  const canPost = !busy && clubIds.length > 0 && (
    kind === "LOG" ? !!link : kind === "COACH_VIDEO" ? file?.kind === "VIDEO" : kind !== null && (body.trim().length > 0 || !!file)
  );

  const submit = async () => {
    setError(null);
    try {
      let mediaId: string | null = null;
      if (file) {
        setProgress(0);
        mediaId = await upload(clubIds[0], "POST", file, setProgress);
      }
      setProgress(1);
      await create({ variables: { input: {
        clubIds, body, mediaId,
        ...(kind === "LOG" ? link : { kind }),
        ...(kind === "PROGRESS" ? { includeWeightChange: weight } : {}),
      } } });
      const names = clubs.filter((c) => clubIds.includes(c.id)).map((c) => c.name);
      toast(`Posted to ${names.join(" and ")}.`);
      onDone();
    } catch (e) {
      setError(errText(e, "Couldn't post that. Try again."));
    } finally {
      setProgress(null);
    }
  };

  if (kind === null) {
    return (
      <>
        <p className="sh-k">{clubs.map((c) => c.name).join(", ")}</p>
        <h3>New post</h3>
        <OptionList<FreeKind | "LOG">
          label="What are you posting?"
          selected={[]}
          onPick={setKind}
          options={[
            { value: "LOG", label: "A workout or activity", desc: "Share one you've logged, with its stats", icon: Dumbbell },
            { value: "PROGRESS", label: "Progress", desc: "A photo and a few words, and your weight change if you like", icon: TrendingUp },
            { value: "MEAL", label: "A meal", desc: "What you ate, with a photo", icon: Salad },
            ...(isCoach ? [{ value: "COACH_VIDEO" as const, label: "Coach video", desc: `Form tips or a demo, up to ${limits.coachVideoSeconds} seconds`, icon: Video }] : []),
          ]}
        />
      </>
    );
  }

  return (
    <>
      <p className="sh-k">{kind === "LOG" ? "Share a log" : kind === "COACH_VIDEO" ? "Coach video" : kind === "PROGRESS" ? "Progress" : "Meal"}</p>
      <h3>{givenLink ? "Edit and post" : "New post"}</h3>
      {kind === "LOG" && !givenLink && <RecentLogs selected={link} onPick={(l) => void chooseLog(l)} />}
      <div className="field" style={{ maxWidth: "none" }}>
        <label htmlFor="post-body">{kind === "COACH_VIDEO" ? "Caption" : "Say something"} <span className="opt-l">{body.length}/{limits.postChars}</span></label>
        <textarea id="post-body" className="txt" value={body} maxLength={limits.postChars} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "MEAL" ? "Jollof with grilled chicken, half the usual rice" : kind === "PROGRESS" ? "Two weeks in and my jeans fit better" : kind === "COACH_VIDEO" ? "Keep your ribs down on the press" : ""} />
      </div>

      <div className="post-attach">
        <input ref={fileInput} type="file" hidden accept={kind === "COACH_VIDEO" ? "video/*" : "image/*,video/*"} onChange={(e) => void pickFile(e.target.files?.[0])} />
        {file && preview ? (
          <div className="attach-preview">
            {file.kind === "VIDEO" ? <video src={preview} muted playsInline /> : <img src={preview} alt="Your photo" />}
            <button type="button" className="iconbtn" aria-label="Remove" disabled={busy} onClick={clearFile}><X /></button>
          </div>
        ) : (
          <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>
            {kind === "COACH_VIDEO" ? <><Video />Add the video</> : <><ImagePlus />Add a photo or video</>}
          </button>
        )}
        <p className="help">
          Photos up to {limits.imageMb} MB. Videos up to {isCoach ? limits.coachVideoSeconds : limits.videoSeconds} seconds. Only people in the club can see them.
        </p>
      </div>

      {kind === "PROGRESS" && (
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={weight} onChange={(e) => setWeight(e.target.checked)} />
          <span>Add my weight change since Day 1, from my latest weigh-in</span>
        </label>
      )}

      {clubs.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <OptionList<string> multi label="Post to" selected={clubIds} onPick={(id) => setClubIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
            options={clubs.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      )}

      {error && <div className="err" role="alert" style={{ marginTop: 14 }}><span>{error}</span></div>}
      <button type="button" className="cta" style={{ marginTop: 16 }} disabled={!canPost} onClick={() => void submit()}>
        {busy ? (progress! < 1 ? `Uploading ${Math.round(progress! * 100)}%` : "Posting…") : <>Post<Send /></>}
      </button>
    </>
  );
}

/** The last two weeks of workouts and activities, to pick one to share. */
function RecentLogs({ selected, onPick }: { selected: ShareLink | null; onPick: (l: ShareLink) => void }) {
  const today = localToday();
  const from = addDaysIso(today, -13);
  const s = useQuery<{ workoutSessionsBetween: SessionSummaryDto[] }>(SESSIONS_BETWEEN, { variables: { from, to: today }, fetchPolicy: "cache-and-network" });
  const a = useQuery<{ activityLogs: ActivityDto[] }>(ACTIVITY_LOGS, { variables: { from, to: today }, fetchPolicy: "cache-and-network" });
  if ((s.loading && !s.data) || (a.loading && !a.data)) return <PulseLoader small label="Loading your logs" />;
  const rows = [
    ...(s.data?.workoutSessionsBetween ?? []).map((w) => ({ key: `s:${w.id}`, link: { sessionId: w.id } as ShareLink, date: localDateOf(w.startedAt), title: w.templateName ?? "Workout", d: `${w.setCount} sets${w.durationMinutes ? `, ${w.durationMinutes} min` : ""}`, icon: Dumbbell })),
    ...(a.data?.activityLogs ?? []).filter((x) => x.kind === "CARDIO" || x.kind === "SPORT").map((x) => ({ key: `a:${x.id}`, link: { activityId: x.id } as ShareLink, date: x.performedOn, title: x.activityType[0] + x.activityType.slice(1).toLowerCase(), d: `${x.durationMinutes} min${x.distanceKm ? `, ${x.distanceKm} km` : ""}`, icon: Activity })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  if (!rows.length) return <div className="empty" style={{ marginBottom: 14 }}><Camera /><span>Nothing logged in the last two weeks. After your next workout or run, you'll be asked if you want to share it.</span></div>;
  const on = (l: ShareLink) => !!selected && JSON.stringify(selected) === JSON.stringify(l);
  return (
    <div className="opts" style={{ marginBottom: 16 }} role="radiogroup" aria-label="Pick a log">
      {rows.slice(0, 8).map((r) => (
        <button key={r.key} type="button" role="radio" aria-checked={on(r.link)} className={`opt${on(r.link) ? " on" : ""}`} onClick={() => onPick(r.link)}>
          <span className="ico"><r.icon /></span>
          <span><span className="t">{r.title}</span><span className="d" style={{ display: "block" }}>{dayShort(r.date)} · {r.d}</span></span>
          <span className="tick"><Check /></span>
        </button>
      ))}
    </div>
  );
}
