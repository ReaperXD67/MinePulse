import { performance } from "node:perf_hooks";

const baseUrls = (process.env.LOAD_BASE_URLS || process.env.LOAD_BASE_URL || "http://127.0.0.1:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const path = process.env.LOAD_PATH || "/api/marketplace/live";
const durationSeconds = Math.max(5, Number(process.env.LOAD_DURATION_SECONDS || 30));
const concurrency = Math.min(500, Math.max(1, Number(process.env.LOAD_CONCURRENCY || 50)));
const maximumP95Ms = Number(process.env.LOAD_MAX_P95_MS || 2_000);
const maximumErrorRate = Number(process.env.LOAD_MAX_ERROR_RATE || 0.01);
const targets = baseUrls.map((baseUrl) => new URL(path, baseUrl).toString());
const deadline = performance.now() + durationSeconds * 1_000;
const latencies = [];
const statuses = new Map();
let errors = 0;
let requestNumber = 0;

async function worker() {
  while (performance.now() < deadline) {
    const startedAt = performance.now();
    const target = targets[requestNumber++ % targets.length];
    try {
      const response = await fetch(target, {
        headers: { Accept: "application/json", "User-Agent": "KarixMC-load-smoke/1.0" },
        signal: AbortSignal.timeout(10_000)
      });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
      if (!response.ok) errors += 1;
    } catch {
      errors += 1;
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedSeconds = (performance.now() - startedAt) / 1_000;
latencies.sort((a, b) => a - b);
const percentile = (ratio) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * ratio))] || 0;
const errorRate = latencies.length ? errors / latencies.length : 1;
const result = {
  targets,
  concurrency,
  requests: latencies.length,
  requestsPerSecond: Number((latencies.length / elapsedSeconds).toFixed(2)),
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2))
  },
  errors,
  errorRate: Number(errorRate.toFixed(4)),
  statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b))
};

console.log(JSON.stringify(result, null, 2));
if (!latencies.length || errorRate > maximumErrorRate || result.latencyMs.p95 > maximumP95Ms) process.exitCode = 1;
