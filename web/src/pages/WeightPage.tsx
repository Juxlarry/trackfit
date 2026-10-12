import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { LOG_WEIGHT, WEIGHT_HISTORY } from "../graphql/operations";
import { WeightChart } from "../components/WeightChart";

interface WeightHistoryData {
  weightHistory: { id: string; weightKg: number; bodyFatPercent: number | null; recordedAt: string }[];
}

export function WeightPage() {
  const { data, loading, error } = useQuery<WeightHistoryData>(WEIGHT_HISTORY, {
    variables: { limit: 90 },
    fetchPolicy: "cache-and-network",
  });
  const [logWeight, { loading: saving }] = useMutation(LOG_WEIGHT, {
    refetchQueries: ["WeightHistory", "Dashboard"],
  });

  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const weight = Number(weightKg);
    if (!weight) return;
    await logWeight({
      variables: {
        input: {
          weightKg: weight,
          bodyFatPercent: bodyFatPercent ? Number(bodyFatPercent) : null,
        },
      },
    });
    setWeightKg("");
    setBodyFatPercent("");
  }

  const entries = data?.weightHistory ?? [];

  return (
    <div>
      <h1>Weight</h1>

      <div className="card">
        <h2>Log a weigh-in</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="weightKg">Weight (kg)</label>
            <input
              id="weightKg"
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="e.g. 78.4"
            />
          </div>
          <div className="form-row">
            <label htmlFor="bodyFat">Body fat % (optional)</label>
            <input
              id="bodyFat"
              type="number"
              step="0.1"
              value={bodyFatPercent}
              onChange={(e) => setBodyFatPercent(e.target.value)}
              placeholder="optional"
            />
          </div>
          <button type="submit" disabled={saving || !weightKg}>
            {saving ? "Saving…" : "Log weight"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Trend</h2>
        {error ? (
          <p className="empty-state">Couldn't load your history: {error.message}</p>
        ) : (
          <WeightChart entries={entries} />
        )}
      </div>

      <div className="card">
        <h2>History</h2>
        {loading && !data && <p className="empty-state">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="empty-state">No weigh-ins yet.</p>
        )}
        {entries.map((entry) => (
          <div className="session-item" key={entry.id}>
            <strong>{entry.weightKg} kg</strong>
            {entry.bodyFatPercent != null ? ` · ${entry.bodyFatPercent}% BF` : ""}
            <div className="empty-state">
              {new Date(entry.recordedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
