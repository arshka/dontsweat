import { useRef, useMemo, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { usePlayerStore, getPlayerColor, TIME_WINDOWS } from '../store/usePlayerStore';
import styles from './HeartRateChart.module.css';

/* ─── Relative-time data builder ─── */

function formatRelativeTime(secAgo: number): string {
  const abs = Math.abs(secAgo);
  if (abs <= 2) return 'now';
  if (abs < 60) return `${Math.round(abs)}s`;
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  if (s === 0) return `${m}m`;
  return `${m}m${s}s`;
}

function buildData(
  players: ReturnType<typeof usePlayerStore.getState>['players'],
  timeWindowSeconds: number,
) {
  const activePlayers = players.filter((p) => p.history.length > 0);
  if (activePlayers.length === 0)
    return { activePlayers, data: null, playerIndices: [] as number[] };

  const nowSec = Date.now() / 1000;
  const cutoff = timeWindowSeconds === Infinity ? 0 : nowSec - timeWindowSeconds;

  const timeSet = new Set<number>();
  for (const p of activePlayers) {
    for (const d of p.history) {
      if (d.time >= cutoff) timeSet.add(Math.floor(d.time));
    }
  }
  const absoluteTimes = Array.from(timeSet).sort((a, b) => a - b);
  if (absoluteTimes.length === 0)
    return { activePlayers, data: null, playerIndices: [] as number[] };

  // Convert to relative seconds (negative = past, 0 = now)
  const xData = absoluteTimes.map((t) => t - nowSec);

  const playerMaps = activePlayers.map((p) => {
    const map = new Map<number, number>();
    for (const d of p.history) {
      if (d.time >= cutoff) map.set(Math.floor(d.time), d.bpm);
    }
    return map;
  });

  const yArrays = playerMaps.map((map) => {
    const raw = absoluteTimes.map((t) => {
      const val = map.get(t);
      return val !== undefined ? val : null;
    });

    // Linearly interpolate small gaps (up to 3 missed beats)
    const MAX_GAP = 3;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] != null) continue;
      let prev = i - 1;
      while (prev >= 0 && raw[prev] == null) prev--;
      let next = i + 1;
      while (next < raw.length && raw[next] == null) next++;
      if (prev >= 0 && next < raw.length && next - prev - 1 <= MAX_GAP) {
        const span = next - prev;
        const t = (i - prev) / span;
        raw[i] = Math.round(raw[prev]! * (1 - t) + raw[next]! * t);
      }
    }

    return raw;
  });

  return {
    activePlayers,
    data: [xData, ...yArrays] as uPlot.AlignedData,
    playerIndices: activePlayers.map((p) => players.indexOf(p)),
  };
}

/* ─── Live dot plugin ─── */

function liveDotPlugin(): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const ctx = u.ctx;
        for (let si = 1; si < u.series.length; si++) {
          const s = u.series[si];
          if (!s.show) continue;
          const d = u.data[si];
          if (!d || d.length === 0) continue;

          let last = -1;
          for (let j = d.length - 1; j >= 0; j--) {
            if (d[j] != null) { last = j; break; }
          }
          if (last === -1) continue;

          const cx = u.valToPos(u.data[0][last] as number, 'x', true);
          const cy = u.valToPos(d[last] as number, s.scale || 'y', true);
          const col = s.stroke as string;

          // Outer glow
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.restore();

          // Mid ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.restore();

          // Solid center
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.restore();
        }
      },
    },
  };
}

/* ─── Chart component ─── */

export function HeartRateChart() {
  const players = usePlayerStore((s) => s.players);
  const timeWindowSeconds = usePlayerStore((s) => s.timeWindowSeconds);
  const setTimeWindow = usePlayerStore((s) => s.setTimeWindow);
  const clearHistory = usePlayerStore((s) => s.clearHistory);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const prevSeriesCount = useRef<number>(0);
  const prevWindowSec = useRef<number>(timeWindowSeconds);

  const { activePlayers, data, playerIndices } = useMemo(
    () => buildData(players, timeWindowSeconds),
    [players, timeWindowSeconds],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !data || activePlayers.length === 0) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    const seriesCount = activePlayers.length + 1;
    const windowChanged = prevWindowSec.current !== timeWindowSeconds;

    // If chart exists with matching series count AND same window, just push data
    if (chartRef.current && prevSeriesCount.current === seriesCount && !windowChanged) {
      chartRef.current.setData(data);
      return;
    }

    // Destroy old chart and recreate (series count or window changed)
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    el.innerHTML = '';

    const windowSec = timeWindowSeconds;
    const w = Math.max(el.clientWidth, 300);

    const opts: uPlot.Options = {
      width: w,
      height: 260,
      plugins: [liveDotPlugin()],
      cursor: { show: true },
      legend: { show: true, live: true },
      scales: {
        x: {
          time: false,
          range: () => {
            if (windowSec === Infinity) return [-300, 0] as uPlot.Range.MinMax;
            return [-windowSec, 0] as uPlot.Range.MinMax;
          },
        },
        y: { auto: true },
      },
      axes: [
        {
          stroke: '#444',
          grid: { stroke: 'rgba(255,255,255,0.03)', width: 1 },
          ticks: { stroke: 'rgba(255,255,255,0.06)', width: 1 },
          font: '11px system-ui',
          values: (_u: uPlot, vals: number[]) =>
            vals.map((v) => formatRelativeTime(v)),
        },
        {
          stroke: '#444',
          grid: { stroke: 'rgba(255,255,255,0.03)', width: 1 },
          ticks: { stroke: 'rgba(255,255,255,0.06)', width: 1 },
          font: '11px system-ui',
          label: 'BPM',
          labelFont: '11px system-ui',
          size: 50,
        },
      ],
      series: [
        {
          label: 'Time',
          value: (_u: uPlot, v: number) =>
            v == null ? '\u2014' : formatRelativeTime(v),
        },
        ...activePlayers.map((p, i) => ({
          label: p.name,
          stroke: getPlayerColor(playerIndices[i]),
          width: 1.5,
          paths: uPlot.paths.spline!(),
          points: { show: false } as uPlot.Series.Points,
          value: (_u: uPlot, v: number) =>
            v == null ? '\u2014' : `${Math.round(v)} BPM`,
        })),
      ],
    };

    chartRef.current = new uPlot(opts, data, el);
    prevSeriesCount.current = seriesCount;
    prevWindowSec.current = timeWindowSeconds;
  }, [data, activePlayers, playerIndices, timeWindowSeconds]);

  // Resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height: 260 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    },
    [],
  );

  if (activePlayers.length === 0) return null;

  return (
    <div className={styles.chartContainer}>
      <div className={styles.toolbar}>
        <div className={styles.timeButtons}>
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.label}
              className={`${styles.timeBtn} ${timeWindowSeconds === w.seconds ? styles.timeBtnActive : ''}`}
              onClick={() => setTimeWindow(w.seconds)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button className={styles.resetBtn} onClick={clearHistory}>
          Reset
        </button>
      </div>
      <div className={styles.chartInner} ref={wrapRef} />
    </div>
  );
}
