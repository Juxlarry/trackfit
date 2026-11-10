import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { Check, Footprints, Search, X } from "lucide-react";
import { ACTIVITY_TYPES, addDaysIso, weekdayOf } from "@engine";
import { FOODS, searchFoods, type Food } from "@engine/foods";
import { CREATE_CLUB_CHALLENGE } from "../../graphql/operations";
import type { ClubChallengeCadence, ClubChallengeKind } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import { useClubUpload, type CheckedFile } from "../../lib/clubMedia";
import { localToday } from "../../lib/dates";
import { ChipGroup } from "../../components/ui/Options";
import { useToast } from "../../components/ui/Toast";
import { ACT_ICON } from "../AppSheets";
import { KIND_NAME, REFETCH_CHALLENGES } from "../../lib/challengeKinds";
import { MediaPicker } from "./MediaPicker";
import { ExercisePicker } from "./RoutineForm";

const MI = 1.609344;
const KINDS: ClubChallengeKind[] = ["WORKOUT", "ACTIVITY", "FOOD", "WATER"];
const WATER_PRESETS = [500, 1000, 1500, 2000];
interface Ex { exerciseId: string; name: string; sets: number; reps: number }

/** Coaches: set a challenge. At most 3 a week, checked again by the API. */
export function ChallengeForm({ clubId, clubName, onDone }: { clubId: string; clubName: string; onDone: () => void }) {
  const toast = useToast();
  const imperial = useUnits().unit === "lb";
  const upload = useClubUpload();
  const today = localToday();
  const [kind, setKind] = useState<ClubChallengeKind>("ACTIVITY");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<ClubChallengeCadence>("WEEKLY");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDaysIso(today, 6 - weekdayOf(today)));
  const [exercises, setExercises] = useState<Ex[]>([]);
  const [limit, setLimit] = useState("");
  const [type, setType] = useState("RUN");
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [food, setFood] = useState<Food | null>(null);
  const [foodName, setFoodName] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [grams, setGrams] = useState("");
  const [water, setWater] = useState(500);
  const [video, setVideo] = useState<CheckedFile | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [create] = useMutation(CREATE_CLUB_CHALLENGE, { refetchQueries: REFETCH_CHALLENGES });

  const meta = ACTIVITY_TYPES[type];
  const types = Object.keys(ACTIVITY_TYPES).filter((k) => ACTIVITY_TYPES[k].kind === "CARDIO" || ACTIVITY_TYPES[k].kind === "SPORT");
  const foods = useMemo(() => (foodQuery.trim().length >= 2 ? searchFoods(foodQuery, FOODS, 6) : []), [foodQuery]);
  const lastDay = addDaysIso(startsOn, 27);

  const ready = title.trim().length >= 2 && !!startsOn && !!endsOn && endsOn >= startsOn && (
    kind === "WORKOUT" ? exercises.length > 0
    : kind === "ACTIVITY" ? Number(distance) > 0 || Number(minutes) > 0
    : kind === "FOOD" ? (!!food || foodName.trim().length >= 2) && Number(grams) > 0
    : water >= 100);

  const save = async () => {
    setError(null);
    const km = Number(distance) > 0 && meta?.distance ? (imperial ? Number(distance) * MI : Number(distance)) : null;
    try {
      let videoMediaId: string | null = null;
      if (video) { setProgress(0); videoMediaId = await upload(clubId, "CHALLENGE", video, setProgress); }
      const input = {
        title, description: description.trim() || null, cadence, kind, startsOn, endsOn, videoMediaId,
        ...(kind === "WORKOUT" ? { exercises: exercises.map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps })), timeLimitMinutes: Number(limit) > 0 ? Math.round(Number(limit)) : null } : {}),
        ...(kind === "ACTIVITY" ? { activityType: type, minDistanceKm: km ? Math.round(km * 100) / 100 : null, minMinutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null } : {}),
        ...(kind === "FOOD" ? { foodKey: food?.key ?? null, foodName: food ? null : foodName.trim(), foodGrams: Math.round(Number(grams)) } : {}),
        ...(kind === "WATER" ? { waterMl: water } : {}),
      };
      await create({ variables: { clubId, input } });
      toast(`${title.trim()} is set. Members will see it when they next open TrackFit.`);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't set the challenge. Try again."); }
    setProgress(null);
  };

  return (
    <>
      <p className="sh-k">{clubName}</p>
      <h3>New challenge</h3>
      <p>Members choose to take it on, and send a photo or video as proof. You can set up to 3 a week.</p>
      <div className="seg seg4" role="group" aria-label="Kind" style={{ marginBottom: 16 }}>
        {KINDS.map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_NAME[k]}</button>)}
      </div>
      <div className="field" style={{ maxWidth: "none" }}>
        <label htmlFor="ch-title">Name</label>
        <input id="ch-title" className="txt" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "WORKOUT" ? "100 push-ups in 20 minutes" : kind === "ACTIVITY" ? "Run 3 km" : kind === "FOOD" ? "A bowl of salad a day" : "Drink 2 litres a day"} />
      </div>
      <div className="field" style={{ maxWidth: "none", marginTop: 14 }}>
        <label htmlFor="ch-desc">Details <span className="opt-l">Optional</span></label>
        <textarea id="ch-desc" className="txt" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why it's worth doing, and what good proof looks like." />
      </div>

      <p className="rt-label">How often</p>
      <div className="seg" role="group" aria-label="How often">
        <button type="button" className={cadence === "DAILY" ? "on" : ""} aria-pressed={cadence === "DAILY"} onClick={() => setCadence("DAILY")}>Every day</button>
        <button type="button" className={cadence === "WEEKLY" ? "on" : ""} aria-pressed={cadence === "WEEKLY"} onClick={() => setCadence("WEEKLY")}>Once a week</button>
      </div>
      <p className="help">{cadence === "DAILY" ? "Proof every day it runs." : "Proof once in each week it runs."}</p>
      <div className="row2">
        <div className="field"><label htmlFor="ch-from">Starts</label><input id="ch-from" className="txt" type="date" min={today} value={startsOn} onChange={(e) => { setStartsOn(e.target.value); if (endsOn < e.target.value) setEndsOn(e.target.value); }} /></div>
        <div className="field"><label htmlFor="ch-to">Ends <span className="opt-l">Up to 4 weeks</span></label><input id="ch-to" className="txt" type="date" min={startsOn} max={lastDay} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></div>
      </div>

      {kind === "WORKOUT" && (
        <>
          <ExercisePicker exercises={exercises} onChange={setExercises} />
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label htmlFor="ch-limit">Time limit (minutes) <span className="opt-l">Optional</span></label>
            <input id="ch-limit" className="txt" type="number" inputMode="numeric" min={1} max={180} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 20" />
          </div>
          <p className="help">Members get a countdown and send their time or reps.</p>
        </>
      )}

      {kind === "ACTIVITY" && (
        <>
          <p className="rt-label">Activity</p>
          <ChipGroup label="Activity" options={types.map((k) => ({ value: k, label: ACTIVITY_TYPES[k].label, icon: ACT_ICON[k] ?? Footprints }))} selected={[type]} onPick={(k) => { setType(k); if (!ACTIVITY_TYPES[k].distance) setDistance(""); }} />
          <div className="row2" style={{ marginTop: 14 }}>
            {meta?.distance && (
              <div className="field"><label htmlFor="ch-km">Distance ({imperial ? "mi" : "km"})</label>
                <input id="ch-km" className="txt" type="number" inputMode="decimal" min={0} step={0.1} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 3" /></div>
            )}
            <div className="field"><label htmlFor="ch-mins">Time (minutes) <span className="opt-l">{meta?.distance ? "Or as well" : ""}</span></label>
              <input id="ch-mins" className="txt" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 30" /></div>
          </div>
          <p className="help">The result comes from the activity they log.</p>
        </>
      )}

      {kind === "FOOD" && (
        <>
          <p className="rt-label">Food</p>
          {food || foodName ? (
            <div className="chosen">
              <span>{food ? food.name : foodName}</span>
              <button type="button" className="iconbtn" aria-label="Change food" onClick={() => { setFood(null); setFoodName(""); }}><X /></button>
            </div>
          ) : (
            <div className="field" style={{ maxWidth: "none" }}>
              <label htmlFor="ch-food" className="sr-only">Find a food</label>
              <div className="search-in"><Search /><input id="ch-food" className="txt" value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder="Find a food, e.g. salad" /></div>
              {foods.length > 0 && (
                <div className="list">
                  {foods.map((f) => <button key={f.key} type="button" className="li" onClick={() => { setFood(f); setFoodQuery(""); }}><span className="t">{f.name}</span><span /></button>)}
                </div>
              )}
              {foodQuery.trim().length >= 2 && (
                <button type="button" className="linkbtn" style={{ marginTop: 8 }} onClick={() => { setFoodName(foodQuery.trim()); setFoodQuery(""); }}>Use “{foodQuery.trim()}” as typed</button>
              )}
            </div>
          )}
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label htmlFor="ch-g">Amount ({food?.liquid ? "ml" : "g"})</label>
            <input id="ch-g" className="txt" type="number" inputMode="numeric" min={1} max={5000} value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="e.g. 50" />
          </div>
          <p className="help">{food || !foodName ? "Members tick it while logging food on Fuel." : "A food typed in isn't on the food list, so members prove it with the photo alone."}</p>
        </>
      )}

      {kind === "WATER" && (
        <>
          <p className="rt-label">Water a day</p>
          <ChipGroup label="Water a day" options={WATER_PRESETS.map((ml) => ({ value: ml, label: ml >= 1000 ? `${ml / 1000} L` : `${ml} ml` }))} selected={[water]} onPick={setWater} />
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label htmlFor="ch-ml">Or enter ml</label>
            <input id="ch-ml" className="txt" type="number" inputMode="numeric" min={100} max={10000} value={water} onChange={(e) => setWater(Math.round(Number(e.target.value) || 0))} />
          </div>
          <p className="help">The day's total logged water has to reach it.</p>
        </>
      )}

      <p className="rt-label">Explain it in a video <span className="opt-l">Optional, up to 60 seconds</span></p>
      <MediaPicker purpose="CHALLENGE" isCoach file={video} onFile={(f, err) => { setVideo(f); setError(err ?? null); }} label="Add a video" />
      {progress !== null && <div className="bar upl" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress * 100}%` }} /></div>}
      {error && <div className="err" role="alert"><span>{error}</span></div>}
      <button type="button" className="cta" style={{ marginTop: 18 }} disabled={!ready || progress !== null} onClick={() => void save()}>Set challenge<Check /></button>
    </>
  );
}
