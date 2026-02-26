import { useRef, useMemo, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { usePlayerStore, getPlayerColor, TIME_WINDOWS } from '../store/usePlayerStore';
import styles from './HeartRateChart.module.css';

// Plugin: pulsing glowing dot at the leading edge of each series
function liveDotPlugin(): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const ctx = u.ctx;
        // Pulse: sharp blink between 0 and 1 over a 1s cycle
        const t = (performance.now() % 1000) / 1000;
        const pulse = t < 0.5
          ? t / 0.5          // 0 → 1 in first half
          : 1 - (t - 0.5) / 0.5; // 1 → 0 in second half

        for (let si = 1; si < u.series.length; si++) {
          const s = u.series[si];
          if (!s.show) continue;
          const d = u.data[si];
          if (!d || d.length === 0) continue;

          // Find last non-null value
          let last = -1;
          for (let j = d.length - 1; j >= 0; j--) {
            if (d[j] != null) { last = j; break; }
          }
          if (last === -1) continue;

          const cx = u.valToPos(u.data[0][last] as number, 'x', true);
          const cy = u.valToPos(d[last] as number, s.scale || 'y', true);
          const col = s.stroke as string;

          // Outer glow — pulses from barely visible to prominent
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 6 + pulse * 12, 0, Math.PI * 2);
          ctx.globalAlpha = 0.05 + pulse * 0.25;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.restore();

          // Mid ring — pulses size and opacity
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 4 + pulse * 4, 0, Math.PI * 2);
          ctx.globalAlpha = 0.15 + pulse * 0.35;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.restore();

          // Center dot — pulses between dim color and bright white
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 3 + pulse * 1.5, 0, Math.PI * 2);
          ctx.globalAlpha = 0.6 + pulse * 0.4;
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.restore();
        }
      },
    },
  };
}

function buildData(
  players: ReturnType<typeof usePlayerStore.getState>['players'],
  timeWindowSeconds: number,
) {
  const activePlayers = players.filter((p) => p.history.length > 0);
  if (activePlayers.length === 0) return { activePlayers, data: null, playerIndices: [] as number[] };

  const nowSec = Date.now() / 1000;
  const cutoff = timeWindowSeconds === Infinity ? 0 : nowSec - timeWindowSeconds;

  const timeSet = new Set<number>();
  for (const p of activePlayers) {
    for (const d of p.history) {
      if (d.time >= cutoff) timeSet.add(Math.round(d.time));
    }
  }
  const times = Array.from(timeSet).sort((a, b) => a - b);
  if (times.length === 0) return { activePlayers, data: null };

  const playerMaps = activePlayers.map((p) => {
    const map = new Map<number, number>();
    for (const d of p.history) {
      if (d.time >= cutoff) map.set(Math.round(d.time), d.bpm);
    }
    return map;
  });

  const xData = times.slice();
  const yArrays = playerMaps.map((map) => {
    const raw = times.map((t) => {
      const val = map.get(t);
      return val !== undefined ? val : null;
    });

    // Linearly interpolate small gaps (up to 3 missed beats)
    const MAX_GAP = 3;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] != null) continue;
      // Find previous non-null
      let prev = i - 1;
      while (prev >= 0 && raw[prev] == null) prev--;
      // Find next non-null
      let next = i + 1;
      while (next < raw.length && raw[next] == null) next++;
      // Only interpolate small gaps
      if (prev >= 0 && next < raw.length && (next - prev - 1) <= MAX_GAP) {
        const span = next - prev;
        const t = (i - prev) / span;
        raw[i] = Math.round((raw[prev]! * (1 - t)) + (raw[next]! * t));
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

export function HeartRateChart() {
  const players = usePlayerStore((s) => s.players);
  const timeWindowSeconds = usePlayerStore((s) => s.timeWindowSeconds);
  const setTimeWindow = usePlayerStore((s) => s.setTimeWindow);
  const clearHistory = usePlayerStore((s) => s.clearHistory);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const baseDataRef = useRef<uPlot.AlignedData | null>(null);

  const { activePlayers, data, playerIndices } = useMemo(
    () => buildData(players, timeWindowSeconds),
    [players, timeWindowSeconds],
  );

  // Keep base data ref in sync (updated synchronously during render)
  baseDataRef.current = data ?? null;

  // Create/destroy chart when series count changes
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

    // Chart already exists with matching series count — RAF loop handles data
    if (chartRef.current && chartRef.current.series.length === seriesCount) {
      return;
    }

    // Destroy old chart and clear any leftover DOM
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    el.innerHTML = '';
    const w = Math.max(el.clientWidth, 300);

    const opts: uPlot.Options = {
      width: w,
      height: 260,
      plugins: [liveDotPlugin()],
      cursor: { show: true },
      legend: { show: true, live: true },
      scales: {
        x: { time: true },
        y: { auto: true },
      },
      axes: [
        {
          stroke: '#555',
          grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
          ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1 },
          font: '11px system-ui',
          values: (_u: uPlot, vals: number[]) =>
            vals.map((v) => new Date(v * 1000).toLocaleTimeString()),
        },
        {
          stroke: '#555',
          grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
          ticks: { stroke: 'rgba(255,255,255,0.08)', width: 1 },
          font: '11px system-ui',
          label: 'BPM',
          labelFont: '11px system-ui',
          size: 50,
        },
      ],
      series: [
        {
          label: 'Time',
          value: (_u: uPlot, v: number) => {
            if (v == null) return '\u2014';
            return new Date(v * 1000).toLocaleTimeString();
          },
        },
        ...activePlayers.map((p, i) => {
          const color = getPlayerColor(playerIndices[i]);
          return {
            label: p.name,
            stroke: color,
            width: 2,
            paths: uPlot.paths.spline!(),
            points: { show: false } as uPlot.Series.Points,
            value: (_u: uPlot, v: number) =>
              v == null ? '\u2014' : `${Math.round(v)} BPM`,
          };
        }),
      ],
    };

    chartRef.current = new uPlot(opts, data, el);
  }, [data, activePlayers, playerIndices]);

  // Continuous RAF loop: extend lines to "now" so the chart scrolls smoothly
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const chart = chartRef.current;
      const base = baseDataRef.current;

      if (chart && base && base[0].length > 0) {
        const nowSec = Date.now() / 1000;

        // Build extended data: append a "now" point that continues each
        // player's last known BPM to the current timestamp
        const extended: (number | null)[][] = new Array(base.length);
        extended[0] = [...(base[0] as number[]), nowSec];

        for (let i = 1; i < base.length; i++) {
          const series = base[i] as (number | null)[];
          // Find the last non-null BPM to extend
          let lastVal: number | null = null;
          for (let j = series.length - 1; j >= 0; j--) {
            if (series[j] != null) { lastVal = series[j]; break; }
          }
          extended[i] = [...series, lastVal];
        }

        chart.setData(extended as uPlot.AlignedData);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

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
  useEffect(() => () => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  }, []);

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
