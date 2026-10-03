"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { compact, points } from "@/lib/format";
import type { ChartPoint } from "@/lib/point-flow";
import styles from "./StatsChart.module.css";

const series = [
  { key: "play", label: "Earned by playing", detail: "Verified time on servers", color: "#9bff5b", dash: undefined },
  { key: "bonuses", label: "Daily & level bonuses", detail: "Daily claims and level rewards", color: "#f6c86c", dash: "5 3" },
  { key: "spend", label: "Spent on items", detail: "Item purchases before refunds", color: "#48e3ff", dash: "2 3" }
] as const;

function DailyTooltip({ active, point }: { active?: boolean; point?: ChartPoint }) {
  if (!active || !point) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{point.dateLabel}</strong>
      <small>{point.isToday ? "Today so far · UTC" : "Full day · UTC"}</small>
      <dl>
        {series.map((item) => (
          <div key={item.key}>
            <dt><i style={{ background: item.color }} />{item.label}</dt>
            <dd>{points(point[item.key])} pts</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StatsChart({ data }: { data: ChartPoint[] }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const chartId = useId().replaceAll(":", "");
  const totals = data.reduce((sum, day) => ({
    play: sum.play + day.play,
    bonuses: sum.bonuses + day.bonuses,
    spend: sum.spend + day.spend
  }), { play: 0, bonuses: 0, spend: 0 });
  const hasActivity = totals.play + totals.bonuses + totals.spend > 0;

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    function updateWidth() {
      setWidth(Math.max(0, Math.floor(element?.clientWidth || 0)));
    }
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.flow}>
      <div className={styles.context}>
        <span>Last 7 days · UTC · Today is still in progress</span>
        <span>All values in points</span>
      </div>
      <dl className={styles.totals} aria-label="Point flow totals for the last seven days">
        {series.map((item) => (
          <div key={item.key}>
            <dt><i style={{ background: item.color }} />{item.label}</dt>
            <dd style={{ color: item.color }}>{points(totals[item.key])}</dd>
            <p>{item.detail}</p>
          </div>
        ))}
      </dl>
      <div className={styles.chart} ref={shellRef}>
        {!hasActivity ? (
          <div className={styles.empty}>
            <strong>No point activity in these seven days yet.</strong>
            <p>Verified play rewards, daily bonuses, and item purchases will appear here as they happen.</p>
          </div>
        ) : width > 0 ? (
          <AreaChart data={data} width={width} height={260} accessibilityLayer margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`${chartId}-play`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#9bff5b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#9bff5b" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="label" stroke="#a4b5bf" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
            <YAxis stroke="#a4b5bf" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={44} tickFormatter={compact} allowDecimals={false} />
            <Tooltip
              content={({ active, payload }) => <DailyTooltip active={active} point={payload?.[0]?.payload as ChartPoint | undefined} />}
              cursor={{ stroke: "rgba(255,255,255,0.25)", strokeDasharray: "3 3" }}
            />
            {series.map((item) => (
              <Area
                key={item.key}
                dataKey={item.key}
                name={item.label}
                type="linear"
                stroke={item.color}
                strokeWidth={2}
                strokeDasharray={item.dash}
                fill={item.key === "play" ? `url(#${chartId}-play)` : "transparent"}
                dot={{ r: 3, fill: "#11161b", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : <div className="chart-loading" aria-hidden="true" />}
      </div>
      <details className={styles.breakdown}>
        <summary>View exact daily totals</summary>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Daily point totals, scroll to see all columns">
          <table>
            <caption>Daily point flow in UTC. Today includes only activity recorded so far.</caption>
            <thead><tr><th scope="col">Day</th><th scope="col">Earned by playing</th><th scope="col">Daily & level bonuses</th><th scope="col">Spent on items</th></tr></thead>
            <tbody>
              {data.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.dateLabel}{day.isToday ? <span>Today so far</span> : null}</th>
                  <td>{points(day.play)}</td><td>{points(day.bonuses)}</td><td>{points(day.spend)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row">7-day total</th><td>{points(totals.play)}</td><td>{points(totals.bonuses)}</td><td>{points(totals.spend)}</td></tr></tfoot>
          </table>
        </div>
      </details>
      <p className={styles.note}>Play rewards and bonuses are counted separately. Campaign top-ups, admin adjustments, and refunds are excluded.</p>
    </div>
  );
}
