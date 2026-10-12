import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface WeightChartProps {
  entries: { id: string; weightKg: number; recordedAt: string }[];
}

/**
 * Weight-over-time chart with a 7-day moving average (spec §4.1: "daily
 * weight is noisy; a 7-day moving average is the more useful signal").
 * Two series → legend present per dataviz method; palette slots 1 (blue,
 * raw) and 2 (orange, average) from the validated default palette.
 */
export function WeightChart({ entries }: WeightChartProps) {
  if (entries.length === 0) {
    return <p className="empty-state">Log a weigh-in to see your trend here.</p>;
  }

  // Entries arrive newest-first from the API; chart reads oldest-first left to right.
  const chronological = [...entries].reverse();

  const data = chronological.map((entry, index) => {
    const windowStart = Math.max(0, index - 6);
    const window = chronological.slice(windowStart, index + 1);
    const movingAvg = window.reduce((sum, e) => sum + e.weightKg, 0) / window.length;
    return {
      date: new Date(entry.recordedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      weightKg: entry.weightKg,
      movingAvg: Math.round(movingAvg * 10) / 10,
    };
  });

  return (
    <div className="viz-root weight-chart">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-gridline)" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--chart-baseline)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--chart-surface)",
              border: "1px solid var(--chart-gridline)",
              borderRadius: 8,
              fontSize: 13,
            }}
            labelStyle={{ color: "var(--chart-text-secondary)" }}
          />
          <Legend wrapperStyle={{ fontSize: 13, color: "var(--chart-text-secondary)" }} />
          <Line
            type="monotone"
            dataKey="weightKg"
            name="Weight"
            stroke="var(--chart-series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="movingAvg"
            name="7-day average"
            stroke="var(--chart-series-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
