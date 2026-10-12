import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  CREATE_WORKOUT_TEMPLATE,
  EXERCISES,
  WORKOUT_TEMPLATES,
} from "../graphql/operations";

interface Exercise {
  id: string;
  name: string;
}

interface ExercisesData {
  exercises: Exercise[];
}

interface TemplatesData {
  workoutTemplates: {
    id: string;
    name: string;
    createdAt: string;
    exercises: {
      order: number;
      targetSets: number;
      targetReps: number;
      exercise: { id: string; name: string };
    }[];
  }[];
}

interface DraftExercise {
  key: string;
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetReps: number;
}

export function TemplatesPage() {
  const { data, loading, error } = useQuery<TemplatesData>(WORKOUT_TEMPLATES, {
    fetchPolicy: "cache-and-network",
  });
  const [search, setSearch] = useState("");
  const { data: exerciseData } = useQuery<ExercisesData>(EXERCISES, {
    variables: { search: search || null },
  });
  const [createTemplate, { loading: saving, error: saveError }] = useMutation(
    CREATE_WORKOUT_TEMPLATE,
    { refetchQueries: ["WorkoutTemplates"] },
  );

  const [name, setName] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [targetSets, setTargetSets] = useState("3");
  const [targetReps, setTargetReps] = useState("10");
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);

  const exercises = exerciseData?.exercises ?? [];

  function addExercise() {
    const exercise = exercises.find((e) => e.id === selectedExerciseId);
    if (!exercise) return;
    setDraftExercises((prev) => [
      ...prev,
      {
        key: `${exercise.id}-${Date.now()}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetSets: Number(targetSets) || 3,
        targetReps: Number(targetReps) || 10,
      },
    ]);
  }

  function removeExercise(key: string) {
    setDraftExercises((prev) => prev.filter((e) => e.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || draftExercises.length === 0) return;
    await createTemplate({
      variables: {
        input: {
          name: name.trim(),
          exercises: draftExercises.map((ex, i) => ({
            exerciseId: ex.exerciseId,
            order: i + 1,
            targetSets: ex.targetSets,
            targetReps: ex.targetReps,
          })),
        },
      },
    });
    setName("");
    setDraftExercises([]);
  }

  const templates = data?.workoutTemplates ?? [];

  return (
    <div>
      <h1>Templates</h1>

      <div className="card">
        <h2>New template</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="templateName">Name</label>
            <input
              id="templateName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Push day"
            />
          </div>

          <div className="form-row">
            <label htmlFor="templateExerciseSearch">Find an exercise</label>
            <input
              id="templateExerciseSearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. bench"
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
              value={targetSets}
              onChange={(e) => setTargetSets(e.target.value)}
              placeholder="sets"
            />
            <input
              type="number"
              value={targetReps}
              onChange={(e) => setTargetReps(e.target.value)}
              placeholder="reps"
            />
            <div />
            <button type="button" className="secondary" onClick={addExercise} disabled={!selectedExerciseId}>
              Add
            </button>
          </div>

          {draftExercises.length > 0 && (
            <div style={{ margin: "16px 0" }}>
              {draftExercises.map((ex) => (
                <div className="set-row" key={ex.key}>
                  <span>{ex.exerciseName}</span>
                  <span>{ex.targetSets} sets</span>
                  <span>{ex.targetReps} reps</span>
                  <span />
                  <button type="button" className="secondary" onClick={() => removeExercise(ex.key)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {saveError && <p className="empty-state">{saveError.message}</p>}

          <button type="submit" disabled={saving || !name.trim() || draftExercises.length === 0}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Your templates</h2>
        {loading && !data && <p className="empty-state">Loading…</p>}
        {error && <p className="empty-state">{error.message}</p>}
        {!loading && templates.length === 0 && (
          <p className="empty-state">No templates yet.</p>
        )}
        {templates.map((template) => (
          <div className="session-item" key={template.id}>
            <strong>{template.name}</strong>
            <div className="empty-state">
              {template.exercises
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((e) => `${e.exercise.name} (${e.targetSets}×${e.targetReps})`)
                .join(", ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
