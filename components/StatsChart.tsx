"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ChartPoint } from "@/lib/stats";

export function StatsChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rewardFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#9bff5b" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#9bff5b" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="spendFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#48e3ff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#48e3ff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" stroke="#91a0a8" tickLine={false} axisLine={false} />
          <YAxis stroke="#91a0a8" tickLine={false} axisLine={false} width={48} />
          <Tooltip
            contentStyle={{
              background: "#11161b",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8
            }}
          />
          <Area
            dataKey="rewards"
            name="Rewards"
            type="monotone"
            stroke="#9bff5b"
            strokeWidth={2}
            fill="url(#rewardFill)"
          />
          <Area
            dataKey="spend"
            name="Spend"
            type="monotone"
            stroke="#48e3ff"
            strokeWidth={2}
            fill="url(#spendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
