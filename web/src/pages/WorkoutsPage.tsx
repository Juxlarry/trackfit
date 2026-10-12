import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  EXERCISES,
  LOG_WORKOUT_SESSION,
  WORKOUT_HISTORY,
} from "../graphql/operations";

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
}

interface ExercisesData {
  exercises: Exercise[];
}

interface DraftSet {
  key: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
}

interface WorkoutHistoryData {
  workoutHistory: {
    id: string;
    startedAt: string;
    durationMinutes: number | null;
    notes: string | null;
    sets: { setNumber: number; reps: number; weightKg: number; exercise: { name: string } }[];
    milestones: { type: string; value: number; exercise: { name: string } }[];
  }[];
}

export function WorkoutsPage() {
  const [search, setSearch] = useState("");
  const { data: exerciseData } = useQuery<ExercisesData>(EXERCISES, {
    variables: { search: search || null },
  });
  const { data: historyData, loading: historyLoading } = useQuery<WorkoutHistoryData>(
    WORKOUT_HISTORY,
    { variables: { limit: 20 }, fetchPolicy: "cache-and-network" },
  );
  const [logSession, { loading: saving, error: saveError }] = useMutation<{
    logWorkoutSession: {
      id: string;
      milestones: { type: string; value: number; exercise: { name: string } }[];
    };
  }>(LOG_WORKOUT_SESSION, { refetchQueries: ["WorkoutHistory", "Dashboard"] });

  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [reps, setReps] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [notes, setNotes] = useState("");
  const [shareToClubs, setShareToClubs] = useState(false);
  const [lastResult, setLastResult] = useState<{
    milestones: { type: string; value: number; exercise: { name: string } }[];
  } | null>(null);

  const exercises = exerciseData?.exercises ?? [];

  function addSet() {
    const exercise = exercises.find((e) => e.id === selectedExerciseId);
    const repsNum = Number(reps);
    const weightNum = Number(weightKg);
    if (!exercise || !repsNum || !weightNum) return;
    const setNumberForExercise =
      sets.filter((s) => s.exerciseId === exercise.id).length + 1;
    setSets((prev) => [
      ...prev,
      {
        key: `${exercise.id}-${Date.now()}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        setNumber: setNumberForExercise,
        reps: repsNum,
        weightKg: weightNum,
        rpe: null,
      },
    ]);
    setReps("");
    setWeightKg("");
  }

  function removeSet(key: string) {
    setSets((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (sets.length === 0) return;
    const result = await logSession({
      variables: {
        input: {
          notes: notes || null,
          shareToClubs,
          sets: sets.map((s) => ({
            exerciseId: s.exerciseId,
            setNumber: s.setNumber,
            reps: s.reps,
            weightKg: s.weightKg,
            rpe: s.rpe,
          })),
        },
      },
    });
    setLastResult(result.data?.logWorkoutSession ?? null);
    setSets([]);
    setNotes("");
    setShareToClubs(false);
  }

  const history = historyData?.workoutHistory ?? [];

  return (
    <div>
      <h1>Workouts</h1>

      <div className="card">
        <h2>Log a session</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="exerciseSearch">Find an exercise</label>
            <input
              id="exerciseSearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. squat"
            />
          </div>

          <div className="set-row">
            <select
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
            >
              <option value="">Select exercise…</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="reps"
            />
            <input
              type="number"
              step="0.5"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="kg"
            />
            <div />
            <button
              type="button"
              className="secondary"
              onClick={addSet}
              disabled={!selectedExerciseId || !reps || !weightKg}
            >
              Add set
            </button>
          </div>

          {sets.length > 0 && (
            <div style={{ margin: "16px 0" }}>
              {sets.map((s) => (
                <div className="set-row" key={s.key}>
                  <span>{s.exerciseName}</span>
                  <span>Set {s.setNumber}</span>
                  <span>{s.reps} reps</span>
                  <span>{s.weightKg} kg</span>
                  <button type="button" className="secondary" onClick={() => removeSet(s.key)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="form-row">
            <label htmlFor="notes">Notes (optional)</label>
            <input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel?"
            />
          </div>

          <div className="form-row" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              id="shareToClubs"
              type="checkbox"
              checked={shareToClubs}
              onChange={(e) => setShareToClubs(e.target.checked)}
              style={{ width: "auto" }}
            />
            <label htmlFor="shareToClubs" style={{ margin: 0 }}>
              Share a summary of this workout with my clubs
            </label>
          </div>

          {saveError && <p className="empty-state">{saveError.message}</p>}

          <button type="submit" disabled={saving || sets.length === 0}>
            {saving ? "Saving…" : "Log session"}
          </button>
        </form>

        {lastResult && (
          <div style={{ marginTop: 16 }}>
            {lastResult.milestones.length === 0 ? (
              <p className="empty-state">Session logged — no new records this time.</p>
            ) : (
              <div>
                <p className="empty-state">Session logged. New records:</p>
                {lastResult.milestones.map((m, i) => (
                  <span className="milestone-badge" key={i}>
                    {m.exercise.name} — {m.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>History</h2>
        {historyLoading && !historyData && <p className="empty-state">Loading…</p>}
        {!historyLoading && history.length === 0 && (
          <p className="empty-state">No workouts logged yet.</p>
        )}
        {history.map((session) => {
          const names = [...new Set(session.sets.map((s) => s.exercise.name))];
          return (
            <div className="session-item" key={session.id}>
              <div>
                {new Date(session.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                {session.durationMinutes ? ` · ${session.durationMinutes} min` : ""}
              </div>
              <div className="empty-state">{names.join(", ") || "No sets logged"}</div>
              {session.notes && <div className="empty-state">"{session.notes}"</div>}
              {session.milestones.length > 0 && (
                <div>
                  {session.milestones.map((m, i) => (
                    <span className="milestone-badge" key={i}>
                      {m.exercise.name} — {m.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
