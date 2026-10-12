import { useQuery } from "@apollo/client/react";
import { DASHBOARD } from "../graphql/operations";
import { WeightChart } from "../components/WeightChart";

interface DashboardData {
  dashboard: {
    sessionsThisWeek: number;
    latestWeight: { id: string; weightKg: number; recordedAt: string } | null;
    weightTrend: { id: string; weightKg: number; recordedAt: string }[];
    recentSessions: {
      id: string;
      startedAt: string;
      durationMinutes: number | null;
      milestones: { type: string; value: number; exercise: { name: string } }[];
      sets: { exercise: { name: string } }[];
    }[];
  };
}

export function DashboardPage() {
  const { data, loading, error } = useQuery<DashboardData>(DASHBOARD, {
    fetchPolicy: "cache-and-network",
  });

  if (loading && !data) return <p className="empty-state">Loading…</p>;
  if (error) return <p className="empty-state">Couldn't load your dashboard: {error.message}</p>;

  const dashboard = data?.dashboard;

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="label">Sessions this week</div>
          <div className="value">{dashboard?.sessionsThisWeek ?? 0}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Latest weigh-in</div>
          <div className="value">
            {dashboard?.latestWeight ? `${dashboard.latestWeight.weightKg} kg` : "—"}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Weight trend</h2>
        <WeightChart entries={dashboard?.weightTrend ?? []} />
      </div>

      <div className="card">
        <h2>Recent sessions</h2>
        {!dashboard?.recentSessions.length && (
          <p className="empty-state">Log a workout to see it here.</p>
        )}
        {dashboard?.recentSessions.map((session) => {
          const exerciseNames = [...new Set(session.sets.map((s) => s.exercise.name))];
          return (
            <div className="session-item" key={session.id}>
              <div>
                {new Date(session.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                {session.durationMinutes ? ` · ${session.durationMinutes} min` : ""}
              </div>
              <div className="empty-state">{exerciseNames.join(", ") || "No sets logged"}</div>
              {session.milestones.length > 0 && (
                <div>
                  {session.milestones.map((m, i) => (
                    <span className="milestone-badge" key={i}>
                      New {formatMilestoneType(m.type)} — {m.exercise.name} ({m.value})
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

function formatMilestoneType(type: string): string {
  switch (type) {
    case "HEAVIEST_SET":
      return "heaviest set";
    case "ESTIMATED_1RM":
      return "est. 1RM";
    case "MOST_REPS_AT_WEIGHT":
      return "rep PR";
    default:
      return type;
  }
}
