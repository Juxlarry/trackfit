import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Check, Dumbbell, Footprints, Minus, Plus, Search, X } from "lucide-react";
import { ACTIVITY_TYPES } from "@engine";
import { CREATE_CLUB_ROUTINE, EXERCISES, UPDATE_CLUB_ROUTINE } from "../../graphql/operations";
import type { ClubRoutineDto } from "../../graphql/types";
import { useUnits } from "../../hooks/usePlan";
import { ChipGroup } from "../../components/ui/Options";
import { PulseLoader } from "../../components/ui/PulseLoader";
import { useToast } from "../../components/ui/Toast";
import { ACT_ICON } from "../AppSheets";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MI = 1.609344;
interface Ex { exerciseId: string; name: string; sets: number; reps: number }

/** Create or edit a club routine (Admins). */
export function RoutineForm({ clubId, clubName, routine, onDone }: { clubId: string; clubName: string; routine?: ClubRoutineDto; onDone: () => void }) {
  const toast = useToast();
  const imperial = useUnits().unit === "lb";
  const [kind, setKind] = useState<"ACTIVITY" | "WORKOUT">(routine?.kind ?? "ACTIVITY");
  const [title, setTitle] = useState(routine?.title ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [days, setDays] = useState<number[]>(routine?.weekdays ?? []);
  const [type, setType] = useState(routine?.activityType ?? "RUN");
  const [distance, setDistance] = useState(routine?.minDistanceKm ? String(Math.round((imperial ? routine.minDistanceKm / MI : routine.minDistanceKm) * 10) / 10) : "");
  const [minutes, setMinutes] = useState(routine?.minMinutes ? String(routine.minMinutes) : "");
  const [exercises, setExercises] = useState<Ex[]>(routine?.exercises ?? []);
  const [error, setError] = useState<string | null>(null);
  const opts = { refetchQueries: ["ClubRoutines", "MyClubRoutines", "ClubRoutineProgress"] };
  const [create, creating] = useMutation(CREATE_CLUB_ROUTINE, opts);
  const [update, updating] = useMutation(UPDATE_CLUB_ROUTINE, opts);
  const meta = ACTIVITY_TYPES[type];
  const types = Object.keys(ACTIVITY_TYPES).filter((k) => ACTIVITY_TYPES[k].kind === "CARDIO" || ACTIVITY_TYPES[k].kind === "SPORT");

  const toggleDay = (d: number) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
  const every = days.length === 7;

  const save = async () => {
    setError(null);
    const km = Number(distance) > 0 && meta?.distance ? (imperial ? Number(distance) * MI : Number(distance)) : null;
    const input = {
      title, description: description.trim() || null, kind, weekdays: days,
      ...(kind === "ACTIVITY"
        ? { activityType: type, minDistanceKm: km ? Math.round(km * 100) / 100 : null, minMinutes: Number(minutes) > 0 ? Math.round(Number(minutes)) : null }
        : { exercises: exercises.map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps })) }),
    };
    try {
      if (routine) await update({ variables: { id: routine.id, input } });
      else await create({ variables: { clubId, input } });
      toast(routine ? "Routine updated." : `${title.trim()} is on. Members see it on Today on its days.`);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the routine. Try again."); }
  };

  return (
    <>
      <p className="sh-k">{clubName}</p>
      <h3>{routine ? "Edit routine" : "New routine"}</h3>
      <p>Optional for members: it shows on Today on its days, with a button to log it. Plans don't change.</p>
      {!routine && (
        <div className="seg" role="group" aria-label="Kind" style={{ marginBottom: 16 }}>
          <button type="button" className={kind === "ACTIVITY" ? "on" : ""} aria-pressed={kind === "ACTIVITY"} onClick={() => setKind("ACTIVITY")}>Activity</button>
          <button type="button" className={kind === "WORKOUT" ? "on" : ""} aria-pressed={kind === "WORKOUT"} onClick={() => setKind("WORKOUT")}>Workout</button>
        </div>
      )}
      <div className="field" style={{ maxWidth: "none" }}>
        <label htmlFor="rt-title">Name</label>
        <input id="rt-title" className="txt" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "ACTIVITY" ? "Tuesday is run day" : "Thursday office circuit"} />
      </div>
      <div className="field" style={{ maxWidth: "none", marginTop: 14 }}>
        <label htmlFor="rt-desc">Details <span className="opt-l">Optional</span></label>
        <textarea id="rt-desc" className="txt" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Meet at the gate at 6 am, or do it on your own." />
      </div>

      <p className="rt-label">Days</p>
      <div className="opts chips" role="group" aria-label="Days">
        {DAYS.map((d, i) => <button key={d} type="button" className={`chip${days.includes(i) ? " on" : ""}`} role="checkbox" aria-checked={days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>)}
        <button type="button" className={`chip${every ? " on" : ""}`} role="checkbox" aria-checked={every} onClick={() => setDays(every ? [] : [0, 1, 2, 3, 4, 5, 6])}>Every day</button>
      </div>

      {kind === "ACTIVITY" ? (
        <>
          <p className="rt-label">What counts</p>
          <ChipGroup label="Activity" options={types.map((k) => ({ value: k, label: ACTIVITY_TYPES[k].label, icon: ACT_ICON[k] ?? Footprints }))} selected={[type]} onPick={(k) => { setType(k); if (!ACTIVITY_TYPES[k].distance) setDistance(""); }} />
          <div className="row2" style={{ marginTop: 14 }}>
            {meta?.distance && (
              <div className="field"><label htmlFor="rt-km">At least ({imperial ? "mi" : "km"}) <span className="opt-l">Optional</span></label>
                <input id="rt-km" className="txt" type="number" inputMode="decimal" min={0} step={0.1} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 5" /></div>
            )}
            <div className="field"><label htmlFor="rt-min">At least (minutes) <span className="opt-l">Optional</span></label>
              <input id="rt-min" className="txt" type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 30" /></div>
          </div>
          <p className="help">It ticks itself when a member logs a matching activity that day.</p>
        </>
      ) : (
        <ExercisePicker exercises={exercises} onChange={setExercises} />
      )}

      {error && <div className="err" role="alert"><span>{error}</span></div>}
      <button type="button" className="cta" style={{ marginTop: 18 }}
        disabled={creating.loading || updating.loading || title.trim().length < 2 || !days.length || (kind === "WORKOUT" && !exercises.length)}
        onClick={() => void save()}>{routine ? "Save changes" : "Start routine"}<Check /></button>
    </>
  );
}

function ExercisePicker({ exercises, onChange }: { exercises: Ex[]; onChange: (e: Ex[]) => void }) {
  const [search, setSearch] = useState("");
  const q = useQuery<{ exercises: { id: string; name: string }[] }>(EXERCISES, { variables: { search: search.trim() || null }, skip: search.trim().length < 2 });
  const set = (i: number, patch: Partial<Ex>) => onChange(exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const results = (q.data?.exercises ?? []).filter((x) => !exercises.some((e) => e.exerciseId === x.id)).slice(0, 6);
  return (
    <>
      <p className="rt-label">Exercises</p>
      {exercises.length > 0 && (
        <div className="rt-ex">
          {exercises.map((e, i) => (
            <div key={e.exerciseId} className="rt-ex-row">
              <span className="nm"><Dumbbell />{e.name}</span>
              <Stepper label={`${e.name} sets`} value={e.sets} min={1} max={10} unit="sets" onChange={(sets) => set(i, { sets })} />
              <Stepper label={`${e.name} reps`} value={e.reps} min={1} max={100} unit="reps" onChange={(reps) => set(i, { reps })} />
              <button type="button" className="iconbtn" aria-label={`Remove ${e.name}`} onClick={() => onChange(exercises.filter((_, k) => k !== i))}><X /></button>
            </div>
          ))}
        </div>
      )}
      {exercises.length < 15 && (
        <div className="field" style={{ maxWidth: "none" }}>
          <label htmlFor="rt-search" className="sr-only">Find an exercise</label>
          <div className="search-in"><Search /><input id="rt-search" className="txt" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an exercise, e.g. squat" /></div>
          {q.loading && <PulseLoader small label="Searching" />}
          {results.length > 0 && (
            <div className="list">
              {results.map((x) => (
                <button key={x.id} type="button" className="li" onClick={() => { onChange([...exercises, { exerciseId: x.id, name: x.name, sets: 3, reps: 10 }]); setSearch(""); }}>
                  <span className="ic"><Plus /></span><span className="t">{x.name}</span><span />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Stepper({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <span className="mini-step" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${unit}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus /></button>
      <b>{value}</b><small>{unit}</small>
      <button type="button" aria-label={`More ${unit}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus /></button>
    </span>
  );
}
