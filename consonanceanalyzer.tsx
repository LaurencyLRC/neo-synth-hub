import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, useSyncExternalStore } from "react";
import {
  Settings2,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  BoxSelect,
  Play,
  Square,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  Download,
  Upload,
  Radio,
  Minus,
  Plus,
} from "lucide-react";
import {
  consonanceBucket,
  noteVsSetBucket,
  detectChord,
  describeInterval,
  BUCKET_TEXT,
  bucketOf,
  setTension,
  noteName,
  Bucket,
  JUST,
} from "./theory";

type Snap = { seq: Set<string>; chord: Set<string> };
const WAVES: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const CODE_TO_KEY: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Slash: "/",
  Enter: "enter",
  Escape: "escape",
};
const keyFromEvent = (e: KeyboardEvent) =>
  CODE_TO_KEY[e.code] ??
  (e.code.startsWith("Key")
    ? e.code.slice(3).toLowerCase()
    : e.code.startsWith("Digit")
    ? e.code.slice(5)
    : e.key.toLowerCase());

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ACCIDENTAL_PCS = new Set([1, 3, 6, 8, 10]);
const getNoteName = (index: number) => NOTE_NAMES[index % 12];
const isAccidental = (index: number) => ACCIDENTAL_PCS.has(index % 12);

const DEFAULT_KEYS_EXTENDED = [
  "z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m",
  "q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u",
  "i", "8", "o", "9", "p", "0", "[", "-", "]", "=", "\\", "enter",
];

const getChordName = (idx: number[]) =>
  detectChord(idx).name.replace(/^Unknown\s*:.*$/i, "Unknown");

// Colour is strictly harmonic data: calibrated CRT phosphor signal hues.
// Chrome surfaces never use these hues, so every coloured mark carries meaning.
const COLORS = {
  neutral: "#f2efe6",
  perfect: "#38c4f5",   // Phase-locked cyan-blue phosphor
  consonant: "#6ee777", // Warm resonant mint-green phosphor
  slightly: "#f7b733",  // Sodium-amber harmonic tension
  dissonant: "#ff5c4d", // Vermilion high-roughness signal
};

// Warm anodized mineral-graphite & bone-silkscreen ramp mirrored from index.css
const INK = {
  bg: "#080a08",
  track: "#262b25",
  t1: "#f2efe6",
  t2: "#b5afa0",
  t3: "#878174",
  grid: "rgba(218, 210, 190, 0.06)",
  axis: "rgba(218, 210, 190, 0.16)",
  guide: "rgba(218, 210, 190, 0.28)",
};

const LEGEND: { bucket: keyof typeof COLORS; label: string; hint: string }[] = [
  { bucket: "perfect", label: "Perfect", hint: "Unison, octave, fifth (1/1, 2/1, 3/2)" },
  { bucket: "consonant", label: "Consonant", hint: "Thirds, sixths, fourth" },
  { bucket: "slightly", label: "Mild", hint: "Seconds, sevenths" },
  { bucket: "dissonant", label: "Dissonant", hint: "Tritone, semitones" },
];
// The legend's short names are the visible vocabulary (readout included).
// theory.ts's longer BUCKET_TEXT stays for screen-reader labels, where there is no legend to read.
const BUCKET_LABEL = Object.fromEntries(LEGEND.map(l => [l.bucket, l.label])) as Record<Bucket, string>;

const getConsonanceType = consonanceBucket;
const getHarmonicTypeForSet = (t: number, held: number[]) =>
  held.length ? noteVsSetBucket(t, held) : "neutral";

export type IntervalInfo = {
  type: "interval" | "chord";
  name: string;
  percentage: string;
  consonance: string;
  diff: number;
  pitches: number[];
  ratio?: string;
  bucket: Bucket;
};

const JUST_RATIOS = JUST;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : Math.abs((a * b) / gcd(a, b));

const getDeltaFreq = (semitones: number) => {
  const octs = Math.floor(semitones / 12);
  const r = ((semitones % 12) + 12) % 12;
  const [num, den] = JUST_RATIOS[r];
  return (num / den) * Math.pow(2, octs) - 1;
};

const getDeltaFractionLabel = (semitones: number) => {
  if (semitones === 0) return "+0";
  const octs = Math.floor(semitones / 12);
  const r = ((semitones % 12) + 12) % 12;
  const [num, den] = JUST_RATIOS[r];
  const netNum = num * Math.pow(2, octs) - den;
  const g = gcd(netNum, den);
  const redNum = netNum / g;
  const redDen = den / g;
  if (redDen === 1) return `+${redNum}`;
  return `+${redNum}/${redDen}`;
};

const computeOrbitRevolutions = (pitches: number[]) => {
  const bass = Math.min(...pitches);
  let overallLcm = 1;
  for (const p of pitches) {
    const semis = p - bass;
    if (semis === 0) continue;
    const r = ((semis % 12) + 12) % 12;
    const [num, den] = JUST_RATIOS[r];
    const octs = Math.floor(semis / 12);
    const netNum = num * Math.pow(2, octs) - den;
    const g = gcd(netNum, den);
    const redDen = den / g;
    overallLcm = lcm(overallLcm, redDen);
  }
  return Math.min(overallLcm, 30);
};

// Calibrated rotary encoder gauge: 270° sweep with peripheral detent ticks
// and a rotor pointer dot tracking the active angle.
const ArcDial: React.FC<{
  value: number;
  min: number;
  max: number;
  size?: number;
}> = ({ value, min, max, size = 56 }) => {
  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  const stroke = 3;
  const c = size / 2;
  const r = c - stroke / 2 - 4;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75; // 270 deg sweep
  const filled = arcLen * norm;

  const angleDeg = 135 + norm * 270;
  const angleRad = (angleDeg * Math.PI) / 180;
  const dotX = c + r * Math.cos(angleRad);
  const dotY = c + r * Math.sin(angleRad);

  const ticks = Array.from({ length: 11 }, (_, idx) => {
    const tDeg = 135 + (idx / 10) * 270;
    const tRad = (tDeg * Math.PI) / 180;
    const rIn = r + 3.2;
    const rOut = r + (idx % 5 === 0 ? 5.2 : 4.2);
    return {
      x1: c + rIn * Math.cos(tRad),
      y1: c + rIn * Math.sin(tRad),
      x2: c + rOut * Math.cos(tRad),
      y2: c + rOut * Math.sin(tRad),
      major: idx % 5 === 0,
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {ticks.map((t, idx) => (
        <line
          key={idx}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.major ? INK.t2 : INK.t3}
          strokeOpacity={t.major ? 0.55 : 0.3}
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={INK.track}
        strokeWidth={stroke}
        strokeDasharray={`${arcLen} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(135 ${c} ${c})`}
      />
      {filled > 0.5 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={INK.t1}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(135 ${c} ${c})`}
        />
      )}
      <circle cx={dotX} cy={dotY} r={2.2} fill={INK.t1} />
    </svg>
  );
};

// One encoder: label, arc gauge with the value inside it, then -/+ nudge buttons.
// Dragging or scrolling anywhere on the cell still adjusts the value.
const EncoderCell: React.FC<{
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  title: string;
  valueLabel: string;
  decLabel: string;
  incLabel: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onWheelStep: (dir: 1 | -1) => void;
  onStep: (dir: 1 | -1) => void;
}> = ({
  label,
  display,
  value,
  min,
  max,
  title,
  valueLabel,
  decLabel,
  incLabel,
  onMouseDown,
  onWheelStep,
  onStep,
}) => (
  <div
    onMouseDown={onMouseDown}
    onWheel={e => onWheelStep(e.deltaY < 0 ? 1 : -1)}
    title={title}
    className="flex h-full min-w-0 cursor-ns-resize flex-col items-center justify-center gap-1.5"
  >
    <span className="text-xs font-medium tracking-[0.02em] text-t2">{label}</span>
    <div className="relative h-14 w-14 max-md:h-12 max-md:w-12">
      <ArcDial value={value} min={min} max={max} />
      <div
        role="spinbutton"
        aria-label={valueLabel}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        className="mono absolute inset-0 flex items-center justify-center text-[13px] font-semibold tracking-tight text-t1"
      >
        {display}
      </div>
    </div>
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onStep(-1)} aria-label={decLabel} className="btn btn-icon">
        <Minus size={13} />
      </button>
      <button type="button" onClick={() => onStep(1)} aria-label={incLabel} className="btn btn-icon">
        <Plus size={13} />
      </button>
    </div>
  </div>
);

type StepperProps = {
  label: string;
  display: React.ReactNode;
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  decLabel: string;
  incLabel: string;
  onDec: () => void;
  onInc: () => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">;

// Label | - | value | +   (used by the sequencer footer)
const Stepper: React.FC<StepperProps> = ({
  label,
  display,
  value,
  min,
  max,
  ariaLabel,
  decLabel,
  incLabel,
  onDec,
  onInc,
  className = "",
  ...rest
}) => (
  <div className={`stepper ${className}`} {...rest}>
    <span className="stepper-label max-md:hidden">{label}</span>
    <button type="button" onClick={onDec} aria-label={decLabel} className="stepper-btn">
      <Minus size={14} />
    </button>
    <div
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className="stepper-value max-md:px-1.5"
    >
      <span className="stepper-inline-label mr-1 font-normal text-t3 md:hidden">{label}</span>
      {display}
    </div>
    <button type="button" onClick={onInc} aria-label={incLabel} className="stepper-btn">
      <Plus size={14} />
    </button>
  </div>
);

const WAVE_PATHS: Record<OscillatorType, string> = {
  sine: "M1.5 5.5C3.8 0.5 6.8 0.5 10 5.5C13.2 10.5 16.2 10.5 18.5 5.5",
  triangle: "M1.5 5.5L5.8 1.2L14.2 9.8L18.5 5.5",
  sawtooth: "M1.5 9L10 1.8V9L18.5 1.8",
  square: "M1.5 8.8V2.2H10V8.8H18.5V2.2",
  custom: "",
};

const WAVE_SHORT: Record<OscillatorType, string> = {
  sine: "SIN",
  triangle: "TRI",
  sawtooth: "SAW",
  square: "SQR",
  custom: "CUSTOM",
};

const WAVE_FULL: Record<OscillatorType, string> = {
  sine: "Sine wave",
  triangle: "Triangle wave",
  sawtooth: "Sawtooth wave",
  square: "Square wave",
  custom: "Custom wave",
};

const WaveGlyph: React.FC<{ type: OscillatorType }> = ({ type }) => (
  <svg width="28" height="15" viewBox="0 0 20 11" fill="none" className="shrink-0" aria-hidden="true">
    <path
      d={WAVE_PATHS[type]}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// The waveform lives outside React state on purpose. Only the four wave buttons draw it, and the audio
// path reads it when a note starts, so a tap repaints those four buttons instead of re-rendering the
// whole instrument (pads, roll, scope readout) the way a useState in NeonSynthPad would.
type WaveStore = {
  get: () => OscillatorType;
  set: (t: OscillatorType) => void;
  subscribe: (fn: () => void) => () => void;
};

const createWaveStore = (initial: OscillatorType): WaveStore => {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: t => {
      if (t === value) return;
      value = t;
      subs.forEach(fn => fn());
    },
    subscribe: fn => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
};

const WaveSelector = React.memo(function WaveSelector({ store }: { store: WaveStore }) {
  const waveType = useSyncExternalStore(store.subscribe, store.get);
  return (
    <div
      role="radiogroup"
      aria-label="Waveform"
      className="land-waves well grid grid-cols-4 gap-1 p-1 max-md:h-[60px] md:w-[136px] md:shrink-0 md:grid-cols-2"
    >
      {WAVES.map(t => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={waveType === t}
          aria-label={WAVE_FULL[t]}
          title={WAVE_FULL[t]}
          onClick={() => store.set(t)}
          className="wave max-md:gap-1"
        >
          <WaveGlyph type={t} />
          <span className="trim-caps">{WAVE_SHORT[t]}</span>
        </button>
      ))}
    </div>
  );
});

// The consonance vocabulary, drawn once: diamond = perfect, circle = consonant,
// triangle = slightly consonant, cross = dissonant. Used in the legend, the readout and on pads,
// so shape and colour always say the same thing.
const ConsonanceGlyph: React.FC<{
  bucket: keyof typeof COLORS;
  size?: number;
  filled?: boolean;
}> = ({ bucket, size = 16, filled = true }) => {
  const color = COLORS[bucket];
  const outline = {
    fill: filled ? color : "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      {bucket === "perfect" && <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" {...outline} />}
      {bucket === "consonant" && <circle cx="12" cy="12" r="9" {...outline} />}
      {bucket === "slightly" && <path d="M12 2 22 20H2Z" {...outline} />}
      {bucket === "dissonant" && (
        <path
          d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
};

export const HarmonicVisualizer: React.FC<{
  interval: IntervalInfo | null;
  viewMode?: "pad" | "roll";
}> = ({ interval, viewMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animIdRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const lastKeyRef = useRef<string>("");

  const orbitData = React.useMemo(() => {
    if (!interval || interval.type !== "chord" || interval.pitches.length < 3) {
      return {
        pts: [] as { x: number; y: number }[],
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1,
        revolutions: 1,
      };
    }
    const pitches = [...interval.pitches].sort((a, b) => a - b);
    const N = pitches.length;
    const bass = pitches[0];
    const deltas = pitches.map(p => getDeltaFreq(p - bass));
    const revolutions = computeOrbitRevolutions(pitches);
    const period = revolutions * 2 * Math.PI;
    const steps = Math.min(3000, Math.max(720, revolutions * 96));
    const pts: { x: number; y: number }[] = [];

    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    for (let i = 0; i <= steps; i++) {
      const tau = (i / steps) * period;
      let re = 0;
      let im = 0;
      for (let k = 0; k < N; k++) {
        const angle = deltas[k] * tau;
        re += Math.cos(angle);
        im += Math.sin(angle);
        const jx = re / N;
        const jy = im / N;
        if (jx < minX) minX = jx;
        if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy;
        if (jy > maxY) maxY = jy;
      }
      pts.push({
        x: re / N,
        y: im / N,
      });
    }
    return { pts, minX, maxX, minY, maxY, revolutions };
  }, [interval]);

  useEffect(() => {
    const key = interval ? `${interval.type}-${interval.pitches.join(",")}` : "idle";
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key;
      trailRef.current = [];
    }
  }, [interval]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const osdFont = (mono: boolean) =>
      mono
        ? "500 10.5px 'Azeret Mono', 'IBM Plex Mono', ui-monospace, monospace"
        : "500 11px 'Chivo', 'IBM Plex Sans', system-ui, sans-serif";
    const osdWidth = (text: string, mono = false) => {
      ctx.save();
      ctx.font = osdFont(mono);
      const w = ctx.measureText(text).width;
      ctx.restore();
      return w;
    };
    // Short scopes (phones, landscape strips) carry their readouts in side columns,
    // so no text ever sits on the trace; the figure keeps the full height.
    type OsdRow = { text: string; color: string; mono?: boolean };
    const sideWidth = (left: OsdRow[], right: OsdRow[]) => {
      const w = (rows: OsdRow[]) => rows.reduce((m, r) => Math.max(m, osdWidth(r.text, r.mono)), 0);
      return Math.max(w(left), w(right)) + 14 + 12;
    };
    const drawSideColumns = (left: OsdRow[], right: OsdRow[], width: number) => {
      left.forEach((l, i) => drawOsdText(l.text, 14, 22 + i * 14, l.color, "left", l.mono));
      right.forEach((r, i) => drawOsdText(r.text, width - 14, 22 + i * 14, r.color, "right", r.mono));
    };

    const drawOsdText = (
      text: string,
      x: number,
      y: number,
      color: string,
      align: "left" | "right" = "left",
      mono = false
    ) => {
      ctx.save();
      ctx.font = osdFont(mono);
      ctx.textAlign = align;
      ctx.strokeStyle = "rgba(8, 10, 8, 0.92)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawBezelFiducials = (width: number, height: number, cx: number, cy: number) => {
      const pad = 6;
      const len = 6;
      ctx.strokeStyle = INK.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, pad + len);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + len, pad);
      ctx.moveTo(width - pad - len, pad);
      ctx.lineTo(width - pad, pad);
      ctx.lineTo(width - pad, pad + len);
      ctx.moveTo(pad, height - pad - len);
      ctx.lineTo(pad, height - pad);
      ctx.lineTo(pad + len, height - pad);
      ctx.moveTo(width - pad - len, height - pad);
      ctx.lineTo(width - pad, height - pad);
      ctx.lineTo(width - pad, height - pad - len);
      ctx.stroke();

      ctx.strokeStyle = INK.axis;
      ctx.beginPath();
      const subStep = 11;
      for (let x = cx % subStep; x < width; x += subStep) {
        ctx.moveTo(x, cy - 2);
        ctx.lineTo(x, cy + 2);
      }
      for (let y = cy % subStep; y < height; y += subStep) {
        ctx.moveTo(cx - 2, y);
        ctx.lineTo(cx + 2, y);
      }
      ctx.stroke();
    };

    const drawFrame = (time: number) => {
      if (!running) return;
      const rawDt = Math.min((time - lastTime) / 1000, 0.08);
      const dt = rawDt; // the scope's motion is the measurement, so it is not frozen by reduced-motion settings
      lastTime = time;

      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width) || 320;
      const height = Math.floor(rect.height) || 160;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const targetW = Math.floor(width * dpr);
      const targetH = Math.floor(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1. Matte CRT Oscilloscope Display Well
      ctx.fillStyle = INK.bg;
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // 2. Precision Calibrated Graticule Grid
      ctx.strokeStyle = INK.grid;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      const gridSize = 22;
      ctx.beginPath();
      for (let x = cx % gridSize; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = cy % gridSize; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      drawBezelFiducials(width, height, cx, cy);

      if (!interval) {
        // Center crosshair
        ctx.strokeStyle = INK.axis;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy);
        ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy + 14);
        ctx.stroke();

        // Quiet standby carrier wave
        phaseRef.current = (phaseRef.current + 1.4 * dt) % (Math.PI * 2);
        ctx.beginPath();
        for (let x = 18; x <= width - 18; x++) {
          const norm = (x - 18) / (width - 36);
          const env = Math.sin(norm * Math.PI);
          const y = cy + Math.sin(norm * Math.PI * 4 - phaseRef.current) * 9 * env;
          if (x === 18) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(181, 175, 160, 0.45)";
        ctx.lineWidth = 1.35;
        ctx.stroke();

        ctx.restore();
        return;
      }

      const mainColor = COLORS[interval.bucket] || COLORS.perfect;

      if (interval.type === "interval") {
        // --- LISSAJOUS PREVIEW (2 NOTES) ---
        ctx.strokeStyle = INK.axis;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();

        const [p1, p2] = interval.pitches;
        const diff = Math.abs(p2 - p1);

        let a = 1,
          b = 1;
        if (interval.ratio) {
          const parts = interval.ratio.split(":").map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
            a = parts[0];
            b = parts[1];
          }
        }

        const phaseSpeed =
          interval.bucket === "perfect" ? 0.9 : interval.bucket === "consonant" ? 1.2 : 1.6;
        phaseRef.current = (phaseRef.current + phaseSpeed * dt) % (Math.PI * 4);
        const phi = phaseRef.current;

        const compact = height < 190;
        const sideRows = compact
          ? {
              left: [{ text: interval.ratio || `${a}:${b}`, color: INK.t1, mono: true }] as OsdRow[],
              right: [{ text: `${noteName(p1)}, ${noteName(p2)}`, color: INK.t2 }] as OsdRow[],
            }
          : null;
        const sideW = sideRows ? sideWidth(sideRows.left, sideRows.right) : 0;
        const rx = Math.min(sideRows ? Math.max(40, width / 2 - sideW) : width * 0.42, (height / 2) * 1.45);
        const ry = (height / 2) * 0.78;

        const usePureRatio = a <= 16 && b <= 16;
        const maxTheta = usePureRatio ? Math.PI * 2 : Math.PI * 8;
        const steps = usePureRatio ? 500 : 900;
        const fy = usePureRatio ? b : Math.pow(2, diff / 12);
        const fx = usePureRatio ? a : 1;

        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * maxTheta;
          const x = cx + Math.cos(fx * theta + phi) * rx;
          const y = cy - Math.sin(fy * theta) * ry;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.85;
        ctx.lineJoin = "round";
        ctx.stroke();

        const beamX = cx + Math.cos(phi) * rx;
        const beamY = cy - Math.sin(0) * ry;
        ctx.fillStyle = INK.t1;
        ctx.strokeStyle = INK.bg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(beamX, beamY, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (sideRows) {
          drawSideColumns(sideRows.left, sideRows.right, width);
        } else {
          ctx.strokeStyle = INK.axis;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(14, height - 28);
          ctx.lineTo(width - 14, height - 28);
          ctx.stroke();

          drawOsdText("Lissajous, 2 voices", 14, 20, INK.t2, "left");
          drawOsdText(interval.ratio || `${a}:${b}`, 14, height - 10, INK.t1, "left", true);
          drawOsdText(`${noteName(p1)}, ${noteName(p2)}`, width - 14, height - 10, INK.t2, "right");
        }
      } else {
        // --- BASS-DEMODULATED VECTOR SUPERPOSITION PREVIEW (3+ NOTES) ---
        const pitches = [...interval.pitches].sort((x, y) => x - y);
        const N = pitches.length;
        const bass = pitches[0];

        const { pts: orbitPoints, minX, maxX, minY, maxY, revolutions } = orbitData;
        const spanX = Math.max(0.75, maxX - minX);
        const spanY = Math.max(0.75, maxY - minY);

        const deltaLabels = pitches.map(
          p => `${noteName(p)}(${getDeltaFractionLabel(p - bass)})`
        );
        // Short scope: readouts move to side columns (see drawSideColumns) while the voices fit
        const compact = height < 190 && N <= Math.floor((height - 28) / 14) + 1;
        const sideRows = compact
          ? {
              left: deltaLabels.map(text => ({ text, color: INK.t2, mono: true })) as OsdRow[],
              right: [
                { text: `${revolutions} rev`, color: INK.t1, mono: true },
                { text: "|Z| 0.00", color: INK.t1, mono: true },
              ] as OsdRow[],
            }
          : null;
        const sideW = sideRows ? sideWidth(sideRows.left, sideRows.right) : 0;

        const availW = sideRows ? Math.max(60, width - 2 * sideW) : Math.max(140, width - 32);
        const availH = sideRows ? height - 16 : Math.max(96, height - 12);

        const R = Math.min(availW / spanX, availH / spanY, height * 0.86);
        const ox = cx - ((minX + maxX) / 2) * R;
        const oy = cy + ((minY + maxY) / 2) * R;

        const armLength = R / N;
        const deltaFreqs = pitches.map(p => getDeltaFreq(p - bass));

        const animSpeed = 1.1;
        phaseRef.current = (phaseRef.current + animSpeed * dt) % (Math.PI * 200);
        const t = phaseRef.current;

        // 1. Calibrated Origin Crosshair & Unit Reference Circle (|Z| = 1.0)
        ctx.strokeStyle = INK.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, oy);
        ctx.lineTo(width, oy);
        ctx.moveTo(ox, 0);
        ctx.lineTo(ox, height);
        ctx.stroke();

        ctx.strokeStyle = INK.guide;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(ox, oy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Closed Resonant Orbit Manifold — Unblurred Surgical Vector Trace
        if (orbitPoints.length > 2) {
          const revFactor = Math.min(1, (revolutions - 1) / 29);
          const coreWidth = 1.9 - revFactor * 0.9;
          const coreAlpha = 0.88 - revFactor * 0.32;

          ctx.beginPath();
          for (let i = 0; i < orbitPoints.length; i++) {
            const px = ox + orbitPoints[i].x * R;
            const py = oy - orbitPoints[i].y * R;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          ctx.fillStyle = mainColor;
          ctx.globalAlpha = 0.045;
          ctx.fill();

          ctx.strokeStyle = mainColor;
          ctx.lineWidth = coreWidth;
          ctx.globalAlpha = coreAlpha;
          ctx.stroke();

          ctx.globalAlpha = 1;
        }

        // 3. Tip-to-Tail Demodulated Phasor Chain
        const joints: { x: number; y: number }[] = [{ x: ox, y: oy }];
        let currX = ox;
        let currY = oy;

        for (let i = 0; i < N; i++) {
          const angle = deltaFreqs[i] * t;
          currX += armLength * Math.cos(angle);
          currY -= armLength * Math.sin(angle);
          joints.push({ x: currX, y: currY });
        }

        const tip = joints[joints.length - 1];

        // 4. Crisp Vector Persistence Trail
        const trail = trailRef.current;
        trail.push({ x: tip.x, y: tip.y });
        if (trail.length > 32) trail.shift();

        if (trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const alpha = (i / trail.length) * 0.85;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.strokeStyle = INK.t1;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // 5. Resultant Vector Ray (Origin -> Tip)
        ctx.strokeStyle = mainColor;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // 6. Foreground Phasor Arm Chain
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.strokeStyle = "rgba(8, 10, 8, 0.9)";
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(joints[0].x, joints[0].y);
        for (let i = 1; i < joints.length; i++) {
          ctx.lineTo(joints[i].x, joints[i].y);
        }
        ctx.stroke();

        ctx.strokeStyle = INK.t1;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(joints[0].x, joints[0].y);
        ctx.lineTo(joints[1].x, joints[1].y);
        ctx.stroke();

        if (N > 1) {
          ctx.strokeStyle = INK.t2;
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.moveTo(joints[1].x, joints[1].y);
          for (let i = 2; i < joints.length; i++) {
            ctx.lineTo(joints[i].x, joints[i].y);
          }
          ctx.stroke();
        }

        // 7. Distinct Joint Nodes
        for (let i = 0; i < joints.length; i++) {
          const j = joints[i];
          const isTip = i === joints.length - 1;
          const isOrigin = i === 0;
          const isBassAnchor = i === 1;

          if (isTip) {
            ctx.fillStyle = INK.t1;
            ctx.strokeStyle = INK.bg;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 6.0, 0, Math.PI * 2);
            ctx.stroke();
          } else if (isBassAnchor) {
            ctx.fillStyle = INK.t1;
            ctx.strokeStyle = INK.bg;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillStyle = isOrigin ? INK.t3 : INK.t1;
            ctx.strokeStyle = INK.bg;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        const mag = Math.hypot(tip.x - ox, tip.y - oy) / R;

        if (sideRows) {
          drawSideColumns(
            sideRows.left,
            [sideRows.right[0], { ...sideRows.right[1], text: `|Z| ${mag.toFixed(2)}` }],
            width
          );
        } else {
          const twoLine = deltaLabels.length > 4;
          const ruleY = height - (twoLine ? 40 : 28);

          drawOsdText(`Bass-demodulated, ${N} voices`, 14, 20, INK.t2, "left");
          if (width > 460) {
            drawOsdText("Z_rel(t) = e^{-iω₀t}·Z(t)", width - 14, 20, INK.t3, "right", true);
          }

          ctx.strokeStyle = INK.axis;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(14, ruleY);
          ctx.lineTo(width - 14, ruleY);
          ctx.stroke();

          if (!twoLine) {
            drawOsdText(deltaLabels.join("   "), 14, height - 10, INK.t2, "left", true);
          } else {
            const mid = Math.ceil(deltaLabels.length / 2);
            drawOsdText(deltaLabels.slice(0, mid).join("   "), 14, height - 22, INK.t2, "left", true);
            drawOsdText(deltaLabels.slice(mid).join("   "), 14, height - 8, INK.t2, "left", true);
          }

          drawOsdText(
            `${revolutions} rev   |Z| ${mag.toFixed(2)}`,
            width - 14,
            height - 10,
            INK.t1,
            "right",
            true
          );
        }
      }

      ctx.restore();
    };

    const tick = (time: number) => {
      if (!running) return;
      drawFrame(time);
      animIdRef.current = requestAnimationFrame(tick);
    };

    // Draw synchronously before paint so view-switch height changes never stretch the old bitmap
    drawFrame(performance.now());
    animIdRef.current = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      if (running) drawFrame(performance.now());
    });
    ro.observe(canvas);

    return () => {
      running = false;
      ro.disconnect();
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [interval, orbitData, viewMode]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        interval
          ? `Harmonic scope: ${interval.name}, ${interval.consonance}, ${interval.percentage}`
          : "Harmonic oscilloscope vector scope idle"
      }
      className="absolute inset-0 w-full h-full block"
    />
  );
};

export default function NeonSynthPad() {
  const [waveStore] = useState(() => createWaveStore("sawtooth"));
  const [numNotes, setNumNotes] = useState(24);
  const [numSteps, setNumSteps] = useState(16);
  const [stepWidth, setStepWidth] = useState(48);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [disabledNotes, setDisabledNotes] = useState<Set<number>>(new Set());
  const [lastNotes, setLastNotes] = useState<number[]>([]);
  const [lastSoundedGroup, setLastSoundedGroup] = useState<{
    type: "interval" | "chord";
    pitches: number[];
  } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pivotNote, setPivotNote] = useState<number | null>(null);
  const [octave, setOctave] = useState(4);
  const [keyBindings, setKeyBindings] = useState<string[][]>(
    DEFAULT_KEYS_EXTENDED.slice(0, 12).map(k => [k])
  );
  const [bindingIndex, setBindingIndex] = useState<number | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [hideDisabled, setHideDisabled] = useState(false);
  const [viewMode, setViewMode] = useState<"pad" | "roll">(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("view") === "roll"
        ? "roll"
        : "pad"
  );
  const [editTool, setEditTool] = useState<"draw" | "select" | "chord">("draw");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<{
    s1: number;
    n1: number;
    s2: number;
    n2: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ ds: number; dn: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ s: number; n: number } | null>(null);
  const [sequencerNotes, setSequencerNotes] = useState<Set<string>>(new Set());
  const [chordNotes, setChordNotes] = useState<Set<string>>(new Set());
  const [chordVolumeDb, setChordVolumeDb] = useState(-5);

  const chordVolRef = useRef(chordVolumeDb);
  useEffect(() => {
    chordVolRef.current = chordVolumeDb;
  }, [chordVolumeDb]);
  const chordNotesRef = useRef(chordNotes);
  useEffect(() => {
    chordNotesRef.current = chordNotes;
  }, [chordNotes]);
  const seqNotesRef = useRef(sequencerNotes);
  useEffect(() => {
    seqNotesRef.current = sequencerNotes;
  }, [sequencerNotes]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [pasteAnchor, setPasteAnchor] = useState<number | null>(null);
  const [bpm, setBpm] = useState(120);
  const [hoveredCell, setHoveredCell] = useState<{ step: number; note: number } | null>(null);
  const [clipboard, setClipboard] = useState<
    { relS: number; relN: number; absN: number; chord: boolean }[] | null
  >(null);
  const liveHoverRef = useRef<{ step: number; note: number } | null>(null);
  const [viewportSteps, setViewportSteps] = useState({ start: 0, end: 20 });
  const [autoScroll, setAutoScroll] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(
    () =>
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("test") ||
        new URLSearchParams(window.location.search).has("preview"))
  );
  const [midiStatus, setMidiStatus] = useState<
    "unsupported" | "locked" | "connected" | "disconnected"
  >("disconnected");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const numStepsRef = useRef(numSteps);
  numStepsRef.current = numSteps;
  const numNotesRef = useRef(numNotes);
  numNotesRef.current = numNotes;
  const octaveRef = useRef(octave);
  octaveRef.current = octave;
  const masterRef = useRef<GainNode | null>(null);
  const uiTimersRef = useRef(new Set<number>());
  const finishPointerRef = useRef<() => void>(() => {});
  const midiHeldRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!hasInteracted) return;
    if (!navigator.requestMIDIAccess) {
      setMidiStatus("unsupported");
      return;
    }
    let midi: MIDIAccess | null = null;
    let cancelled = false;

    const onMessage = (ev: any) => {
      const [status, note, velocity] = ev.data as number[];
      const type = status & 0xf0;
      if (type === 0x90 && velocity > 0) {
        const index = note - (octaveRef.current + 1) * 12;
        if (index < 0 || index >= numNotesRef.current) return;
        midiHeldRef.current.set(note, index);
        startNoteRef.current(index, `midi-${note}`, undefined, 0.3 + 0.7 * (velocity / 127));
      } else if (type === 0x80 || type === 0x90) {
        const index = midiHeldRef.current.get(note);
        if (index === undefined) return;
        midiHeldRef.current.delete(note);
        stopNoteRef.current(index, `midi-${note}`);
      }
    };

    const attach = () => {
      const inputs = Array.from(midi!.inputs.values());
      inputs.forEach(i => {
        i.onmidimessage = onMessage;
      });
      setMidiStatus(inputs.length ? "connected" : "disconnected");
    };

    navigator
      .requestMIDIAccess()
      .then(access => {
        if (cancelled) return;
        midi = access;
        midi.onstatechange = attach;
        attach();
      })
      .catch(() => setMidiStatus("locked"));

    return () => {
      cancelled = true;
      if (midi) {
        midi.onstatechange = null;
        midi.inputs.forEach(i => {
          i.onmidimessage = null;
        });
      }
    };
  }, [hasInteracted]);

  const renderedNoteIndices = React.useMemo(() => {
    return Array.from({ length: numNotes })
      .map((_, i) => i)
      .filter(i => !hideDisabled || !disabledNotes.has(i));
  }, [numNotes, hideDisabled, disabledNotes]);

  const inRange = useCallback(
    (key: string) => {
      const [s, n] = key.split("-").map(Number);
      return s >= 0 && s < numSteps && n >= 0 && n < numNotes;
    },
    [numSteps, numNotes]
  );

  const exportSequence = () => {
    const data = {
      version: 2,
      sequencerNotes: Array.from(sequencerNotes).filter(inRange),
      chordNotes: Array.from(chordNotes).filter(inRange),
      disabledNotes: Array.from(disabledNotes),
      keyBindings,
      waveType: waveStore.get(),
      chordVolumeDb,
      numSteps,
      numNotes,
      bpm,
      octave,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `sequence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importSequence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        if (!d || typeof d !== "object" || !Array.isArray(d.sequencerNotes))
          throw new Error("missing sequencerNotes");
        const steps = clampInt(d.numSteps, 4, 1024, 16);
        const notes = clampInt(d.numNotes, 1, 60, 24);
        const okKey = (k: unknown): k is string => {
          if (typeof k !== "string" || !/^\d+-\d+$/.test(k)) return false;
          const [s, n] = k.split("-").map(Number);
          return s < steps && n < notes;
        };
        const list = (v: unknown) => (Array.isArray(v) ? v.filter(okKey) : []);
        setSequencerNotes(new Set(list(d.sequencerNotes)));
        setChordNotes(new Set(list(d.chordNotes)));
        setDisabledNotes(
          new Set<number>(
            Array.isArray(d.disabledNotes)
              ? d.disabledNotes.filter(
                  (n: unknown) =>
                    Number.isInteger(n) && (n as number) >= 0 && (n as number) < notes
                )
              : []
          )
        );
        setSelectedKeys(new Set());
        setNumSteps(steps);
        setNumNotes(notes);
        setBpm(clampInt(d.bpm, 40, 240, 120));
        setOctave(clampInt(d.octave, 1, 8, 4));
        if (WAVES.includes(d.waveType)) waveStore.set(d.waveType);
        if (typeof d.chordVolumeDb === "number")
          setChordVolumeDb(clampInt(d.chordVolumeDb, -6, -1, -5));
        if (
          Array.isArray(d.keyBindings) &&
          d.keyBindings.every(
            (b: unknown) => Array.isArray(b) && b.every(x => typeof x === "string")
          )
        )
          setKeyBindings(d.keyBindings.slice(0, notes));
      } catch {
        window.alert(
          "Couldn't open that file. It needs to be a NeonSynthPad sequence saved as .json."
        );
      }
    };
    reader.readAsText(file);
    input.value = "";
  };

  useEffect(() => {
    const handleTouch = () => {
      setIsTouchDevice(true);
      window.removeEventListener("touchstart", handleTouch);
    };
    window.addEventListener("touchstart", handleTouch);
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      setIsTouchDevice(true);
    }
    return () => window.removeEventListener("touchstart", handleTouch);
  }, []);

  const stepMetadata = React.useMemo(() => {
    const prevGlobalSteps = new Int32Array(numSteps).fill(-1);
    const pitchesAtStep: number[][] = Array.from({ length: numSteps }, () => []);
    const bassAtStep = new Int32Array(numSteps).fill(-1);

    sequencerNotes.forEach(key => {
      const parts = key.split("-");
      const s = parseInt(parts[0]);
      const n = parseInt(parts[1]);
      if (s >= 0 && s < numSteps && n < numNotes) {
        pitchesAtStep[s].push(n);
      }
    });

    const firstStepWithNotes = pitchesAtStep.findIndex(p => p.length > 0);

    for (let s = 0; s < numSteps; s++) {
      if (pitchesAtStep[s].length > 0) {
        bassAtStep[s] = Math.min(...pitchesAtStep[s]);
      }
    }

    let lastStepFound = -1;
    for (let s = numSteps - 1; s >= 0; s--) {
      if (pitchesAtStep[s].length > 0) {
        lastStepFound = s;
        break;
      }
    }
    let runningPrev = lastStepFound;
    for (let s = 0; s < numSteps; s++) {
      prevGlobalSteps[s] = runningPrev;
      if (pitchesAtStep[s].length > 0) runningPrev = s;
    }

    return {
      prevGlobalSteps,
      pitchesAtStep,
      firstStepWithNotes,
      bassAtStep,
      absoluteLastStep: lastStepFound,
    };
  }, [sequencerNotes, numSteps, numNotes]);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const containerWidth = containerSize.width;
  const availRollHeight = Math.max(320, (containerSize.height || 500) - 32);
  const baseRowHeight =
    renderedNoteIndices.length <= 24
      ? availRollHeight / Math.max(1, renderedNoteIndices.length)
      : Math.max(24, availRollHeight / 24);
  // Phones: never thinner than a finger-sized lane; the roll scrolls vertically instead.
  const isPhoneWidth =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px), (orientation: landscape) and (max-height: 500px) and (max-width: 1024px)").matches;
  // Touch-first devices have no keyboard to bind keys with, so edit mode only mutes there
  const touchPrimary =
    typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const rowHeight = isPhoneWidth ? Math.max(32, baseRowHeight) : baseRowHeight;

  const effectiveStepWidth = useMemo(() => {
    if (containerWidth > 120 && numSteps > 0) {
      const autoW = Math.floor((containerWidth - 54) / numSteps);
      if (autoW > stepWidth) return autoW;
    }
    return stepWidth;
  }, [containerWidth, numSteps, stepWidth]);

  const updateViewport = useCallback(
    (overrideStepWidth?: number) => {
      if (!scrollRef.current) return;
      const sw = typeof overrideStepWidth === "number" ? overrideStepWidth : effectiveStepWidth;
      const { scrollLeft, clientWidth } = scrollRef.current;
      const start = Math.max(0, Math.floor((scrollLeft - 52) / sw) - 2);
      const end = Math.min(numSteps, Math.ceil((clientWidth + scrollLeft - 52) / sw) + 2);
      setViewportSteps(prev =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    },
    [effectiveStepWidth, numSteps]
  );

  // Measure roll container, compute viewport window, and position scroll BEFORE first paint
  const needsInitialScrollRef = useRef(false);

  const switchViewMode = useCallback((nextMode: "pad" | "roll") => {
    setViewMode(prev => {
      if (prev === nextMode) return prev;
      if (nextMode === "roll") {
        needsInitialScrollRef.current = true;
        setEditMode(false);
        setBindingIndex(null);
        setPasteAnchor(0);
      }
      return nextMode;
    });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measureAndSync = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setContainerSize(prev =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );

      const nextAutoW =
        width > 120 && numSteps > 0 ? Math.floor((width - 54) / numSteps) : stepWidth;
      const nextEffectiveW = Math.max(stepWidth, nextAutoW);
      updateViewport(nextEffectiveW);

      if (viewMode === "roll" && needsInitialScrollRef.current && height > 0) {
        el.scrollTop = el.scrollHeight;
        needsInitialScrollRef.current = false;
      }
    };

    measureAndSync();
    const ro = new ResizeObserver(measureAndSync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, numSteps, stepWidth, updateViewport]);

  useLayoutEffect(() => {
    if (viewMode === "roll" && needsInitialScrollRef.current && scrollRef.current && containerSize.height > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      needsInitialScrollRef.current = false;
    }
  }, [viewMode, containerSize.height, rowHeight]);

  useEffect(() => {
    if (!isPlaying || !autoScroll || !scrollRef.current) return;
    const container = scrollRef.current;
    const playheadX = currentStep * effectiveStepWidth + 52;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;

    if (playheadX >= viewRight - 80) {
      container.scrollTo({
        left: Math.max(0, playheadX - 100),
        behavior: "smooth",
      });
    } else if (playheadX < viewLeft + 52) {
      container.scrollTo({
        left: Math.max(0, playheadX - 52),
        behavior: "smooth",
      });
    }
  }, [currentStep, isPlaying, autoScroll, effectiveStepWidth]);

  const nextNoteTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);
  const scheduleAheadTime = 0.1;
  const lookahead = 25.0;
  const seqActiveRef = useRef<Set<number>>(new Set());
  const noteTriggersRef = useRef<{ [key: number]: Set<string> }>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<{
    [key: number]: { osc: OscillatorNode; gain: GainNode; isChord: boolean };
  }>({});
  const keysPressedRef = useRef<Set<string>>(new Set());

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.8;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      master.connect(limiter).connect(ctx.destination);
      masterRef.current = master;
      audioContextRef.current = ctx;
    }
    if (audioContextRef.current.state === "suspended") audioContextRef.current.resume();
  }, []);

  const handleInteraction = useCallback(() => {
    setHasInteracted(true);
    initAudio();
  }, [initAudio]);

  // Ensure pressing Enter, Space, or Escape anywhere on the page dismisses the
  // startup modal and initializes audio/WebMIDI, even if the user hasn't clicked yet.
  useEffect(() => {
    if (hasInteracted) return;
    const onInitKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleInteraction();
      }
    };
    window.addEventListener("keydown", onInitKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onInitKeyDown, { capture: true });
  }, [hasInteracted, handleInteraction]);

  useEffect(() => {
    const handleBlur = () => {
      Object.keys(oscillatorsRef.current).forEach(key => {
        const idx = parseInt(key);
        const entry = oscillatorsRef.current[idx];
        if (entry) {
          const { osc, gain } = entry;
          gain.gain.setTargetAtTime(0, audioContextRef.current!.currentTime, 0.015);
          osc.stop(audioContextRef.current!.currentTime + 0.1);
          delete oscillatorsRef.current[idx];
        }
      });
      noteTriggersRef.current = {};
      setActiveNotes(new Set());
      keysPressedRef.current.clear();
      seqActiveRef.current.clear();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  const getFreq = useCallback(
    (index: number) => 261.63 * Math.pow(2, octave - 4 + index / 12),
    [octave]
  );

  const uiAt = useCallback((time: number | undefined, fn: () => void) => {
    const ctx = audioContextRef.current;
    const ms = time !== undefined && ctx ? (time - ctx.currentTime) * 1000 : 0;
    if (ms <= 4) {
      fn();
      return;
    }
    const id = window.setTimeout(() => {
      uiTimersRef.current.delete(id);
      fn();
    }, ms);
    uiTimersRef.current.add(id);
  }, []);

  const startNote = useCallback(
    (index: number, sourceId: string, time?: number, volMul = 1.0, isChord = false) => {
      if (disabledNotes.has(index) || editMode || getFreq(index) > 20000) return;

      initAudio();
      if (!noteTriggersRef.current[index]) {
        noteTriggersRef.current[index] = new Set();
      }
      noteTriggersRef.current[index].add(sourceId);

      if (oscillatorsRef.current[index]) return;

      const ctx = audioContextRef.current!;
      const startTime = time ?? ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = waveStore.get();
      osc.frequency.setValueAtTime(getFreq(index), startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.setTargetAtTime(0.15 * volMul, startTime, 0.005);

      osc.connect(gain);
      gain.connect(masterRef.current!);

      osc.start(startTime);
      oscillatorsRef.current[index] = { osc, gain, isChord };

      const absolutePitch = octave * 12 + index;
      uiAt(time, () => {
        setActiveNotes(prev => new Set(prev).add(index));
        setLastNotes(prev => [absolutePitch, ...prev].slice(0, 2));
        setPivotNote(index);
      });
    },
    [disabledNotes, editMode, octave, getFreq, waveStore, uiAt, initAudio]
  );

  const stopNote = useCallback(
    (index: number, sourceId: string, time?: number) => {
      const triggers = noteTriggersRef.current[index];
      if (triggers) {
        triggers.delete(sourceId);
        if (triggers.size > 0) return;
      }
      const entry = oscillatorsRef.current[index];
      if (entry) {
        const { osc, gain } = entry;
        const ctx = audioContextRef.current!;
        const stopTime = time ?? ctx.currentTime;

        gain.gain.setTargetAtTime(0, stopTime, 0.015);
        osc.stop(stopTime + 0.1);
        delete oscillatorsRef.current[index];
        uiAt(time, () =>
          setActiveNotes(prev => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          })
        );
      }
    },
    [uiAt]
  );

  const startNoteRef = useRef(startNote);
  const stopNoteRef = useRef(stopNote);
  useEffect(() => {
    startNoteRef.current = startNote;
    stopNoteRef.current = stopNote;
  }, [startNote, stopNote]);

  const scheduleNote = useCallback(
    (step: number, time: number) => {
      const notesAtThisStep = new Set<number>();
      const stepPrefix = `${step}-`;

      seqNotesRef.current.forEach(key => {
        if (!key.startsWith(stepPrefix)) return;
        const n = parseInt(key.split("-")[1]);
        if (n < numNotesRef.current) notesAtThisStep.add(n);
      });

      seqActiveRef.current.forEach(idx => {
        if (!notesAtThisStep.has(idx)) stopNote(idx, "sequencer", time);
      });

      notesAtThisStep.forEach(idx => {
        const isChord = chordNotesRef.current.has(`${step}-${idx}`);
        const volMul = isChord ? Math.pow(10, chordVolRef.current / 20) : 1.0;

        if (!seqActiveRef.current.has(idx)) {
          startNoteRef.current(idx, "sequencer", time, volMul, isChord);
        } else {
          const entry = oscillatorsRef.current[idx];
          if (entry && audioContextRef.current) {
            entry.isChord = isChord;
            entry.gain.gain.setTargetAtTime(0.15 * volMul, time, 0.015);
          }
        }
      });

      seqActiveRef.current = notesAtThisStep;
      uiAt(time, () => setCurrentStep(step));
    },
    [stopNote, uiAt]
  );

  useEffect(() => {
    if (!isPlaying) {
      clearInterval(timerRef.current);
      uiTimersRef.current.forEach(id => window.clearTimeout(id));
      uiTimersRef.current.clear();
      seqActiveRef.current.forEach(idx => stopNote(idx, "sequencer"));
      seqActiveRef.current.clear();
      currentStepRef.current = 0;
      setCurrentStep(0);
      return;
    }
    initAudio();
    nextNoteTimeRef.current = audioContextRef.current!.currentTime + 0.05;
    const scheduler = () => {
      const ctx = audioContextRef.current!;
      while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
        currentStepRef.current %= numStepsRef.current;
        scheduleNote(currentStepRef.current, nextNoteTimeRef.current);
        nextNoteTimeRef.current += 60 / bpmRef.current / 4;
        currentStepRef.current += 1;
      }
    };
    timerRef.current = setInterval(scheduler, lookahead);
    return () => clearInterval(timerRef.current);
  }, [isPlaying, scheduleNote, stopNote, initAudio]);

  const deleteSelectedNotes = useCallback(() => {
    if (selectedKeys.size === 0) return;
    setSequencerNotes(prev => {
      const next = new Set(prev);
      selectedKeys.forEach(k => next.delete(k));
      return next;
    });
    setChordNotes(prev => {
      const next = new Set(prev);
      selectedKeys.forEach(k => next.delete(k));
      return next;
    });
    setSelectedKeys(new Set());
  }, [selectedKeys]);

  const copySelection = useCallback(() => {
    if (selectedKeys.size === 0) return;
    const notes = Array.from(selectedKeys).map(k => {
      const [s, n] = k.split("-").map(Number);
      return { s, n, chord: chordNotes.has(k) };
    });
    const a = notes.reduce((m, x) => (x.s < m.s || (x.s === m.s && x.n < m.n) ? x : m));
    setClipboard(
      notes.map(x => ({ relS: x.s - a.s, relN: x.n - a.n, absN: x.n, chord: x.chord }))
    );
  }, [selectedKeys, chordNotes]);

  const pasteSelection = useCallback(
    (isKeyboard = false) => {
      if (!clipboard) return;
      const hover = isKeyboard ? liveHoverRef.current : null;
      const baseS = hover ? hover.step : pasteAnchor ?? 0;
      const added = new Map<string, boolean>();
      clipboard.forEach(c => {
        const s = baseS + c.relS;
        const n = hover ? hover.note + c.relN : c.absN;
        if (s >= 0 && s < numSteps && n >= 0 && n < numNotes) added.set(`${s}-${n}`, c.chord);
      });
      setSequencerNotes(prev => new Set([...prev, ...added.keys()]));
      setChordNotes(prev => {
        const next = new Set(prev);
        added.forEach((chord, k) => (chord ? next.add(k) : next.delete(k)));
        return next;
      });
      setSelectedKeys(new Set(added.keys()));
      setEditTool("select");
    },
    [clipboard, pasteAnchor, numSteps, numNotes]
  );

  const cutSelection = useCallback(() => {
    copySelection();
    deleteSelectedNotes();
  }, [copySelection, deleteSelectedNotes]);

  const dragDelta = React.useMemo(() => {
    if (!dragOffset || selectedKeys.size === 0) return null;
    let s0 = Infinity,
      s1 = -Infinity,
      n0 = Infinity,
      n1 = -Infinity;
    selectedKeys.forEach(k => {
      const [s, n] = k.split("-").map(Number);
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
      n0 = Math.min(n0, n);
      n1 = Math.max(n1, n);
    });
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    return {
      ds: clamp(dragOffset.ds, -s0, numSteps - 1 - s1),
      dn: clamp(dragOffset.dn, -n0, numNotes - 1 - n1),
    };
  }, [dragOffset, selectedKeys, numSteps, numNotes]);

  finishPointerRef.current = () => {
    if (isSelecting && selectionRect) {
      const sMin = Math.min(selectionRect.s1, selectionRect.s2),
        sMax = Math.max(selectionRect.s1, selectionRect.s2);
      const nMin = Math.min(selectionRect.n1, selectionRect.n2),
        nMax = Math.max(selectionRect.n1, selectionRect.n2);
      const hit = Array.from(sequencerNotes).filter(key => {
        const [s, n] = key.split("-").map(Number);
        const r = renderedNoteIndices.indexOf(n);
        return s >= sMin && s <= sMax && r >= nMin && r <= nMax;
      });
      setSelectedKeys(prev => new Set([...prev, ...hit]));
    } else if (isDragging && dragDelta && (dragDelta.ds || dragDelta.dn)) {
      const moved = new Map<string, boolean>();
      selectedKeys.forEach(k => {
        const [s, n] = k.split("-").map(Number);
        moved.set(`${s + dragDelta.ds}-${n + dragDelta.dn}`, chordNotes.has(k));
      });
      const visible = Array.from(moved.keys()).every(k =>
        renderedNoteIndices.includes(Number(k.split("-")[1]))
      );
      if (visible) {
        const next = new Set(Array.from(sequencerNotes).filter(k => !selectedKeys.has(k)));
        const nextChord = new Set(Array.from(chordNotes).filter(k => !selectedKeys.has(k)));
        moved.forEach((isChord, k) => {
          next.add(k);
          if (isChord) nextChord.add(k);
          else nextChord.delete(k);
        });
        setSequencerNotes(next);
        setChordNotes(nextChord);
        setSelectedKeys(new Set(moved.keys()));
      }
    }
    setIsSelecting(false);
    setIsDragging(false);
    setSelectionRect(null);
    setDragOffset(null);
    setDragStartPos(null);
  };

  useEffect(() => {
    const up = () => finishPointerRef.current();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const histRef = useRef<{ past: Snap[]; future: Snap[]; cur: Snap; skip: boolean }>({
    past: [],
    future: [],
    cur: { seq: sequencerNotes, chord: chordNotes },
    skip: false,
  });
  useEffect(() => {
    const h = histRef.current;
    if (h.cur.seq === sequencerNotes && h.cur.chord === chordNotes) return;
    if (!h.skip) {
      h.past.push(h.cur);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
    }
    h.skip = false;
    h.cur = { seq: sequencerNotes, chord: chordNotes };
  }, [sequencerNotes, chordNotes]);

  const undo = useCallback(() => {
    const h = histRef.current,
      prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.cur);
    h.skip = true;
    setSequencerNotes(prev.seq);
    setChordNotes(prev.chord);
  }, []);
  const redo = useCallback(() => {
    const h = histRef.current,
      next = h.future.pop();
    if (!next) return;
    h.past.push(h.cur);
    h.skip = true;
    setSequencerNotes(next.seq);
    setChordNotes(next.chord);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasInteracted) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest("input, textarea, select")) return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isMod) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (viewMode === "roll") {
          if (key === "c") {
            copySelection();
            e.preventDefault();
            return;
          }
          if (key === "v") {
            pasteSelection(true);
            e.preventDefault();
            return;
          }
          if (key === "x") {
            cutSelection();
            e.preventDefault();
            return;
          }
          if (key === "a") {
            setSelectedKeys(new Set(Array.from(sequencerNotes).filter(inRange)));
            setEditTool("select");
            e.preventDefault();
            return;
          }
        }
        return;
      }

      if (e.key === "Delete" || (e.key === "Backspace" && viewMode === "roll")) {
        if (selectedKeys.size > 0) {
          deleteSelectedNotes();
          e.preventDefault();
          return;
        }
      }

      if (e.code === "Space") {
        if (el?.closest("button, a")) return;
        e.preventDefault();
        if (!e.repeat && !editMode) setIsPlaying(p => !p);
        return;
      }

      if (editMode) {
        if (bindingIndex !== null) {
          const newKey = keyFromEvent(e);
          if (newKey === "escape" || newKey === "enter") {
            setBindingIndex(null);
            setBindingError(null);
            e.preventDefault();
            return;
          }

          const existingNoteIdx = keyBindings.findIndex(
            (keys, idx) => idx !== bindingIndex && keys.includes(newKey)
          );

          if (existingNoteIdx !== -1) {
            setBindingError(
              `"${newKey.toUpperCase()}" bound to ${getNoteName(existingNoteIdx)}`
            );
            setTimeout(() => setBindingError(null), 2000);
            e.preventDefault();
            return;
          }

          setKeyBindings(prev => {
            const next = [...prev];
            const currentKeys = next[bindingIndex];
            if (currentKeys.includes(newKey)) {
              next[bindingIndex] = currentKeys.filter(k => k !== newKey);
            } else {
              next[bindingIndex] = [...currentKeys, newKey];
            }
            return next;
          });
          e.preventDefault();
        }
        return;
      }

      const shortcutKey = keyFromEvent(e);
      const noteIndex = keyBindings.findIndex(
        (keys, idx) => keys.includes(shortcutKey) && !disabledNotes.has(idx)
      );
      if (noteIndex !== -1 && !keysPressedRef.current.has(shortcutKey)) {
        keysPressedRef.current.add(shortcutKey);
        startNoteRef.current(noteIndex, `key-${shortcutKey}`);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const upKey = keyFromEvent(e);
      keyBindings.forEach((keys, idx) => {
        if (keys.includes(upKey)) {
          keysPressedRef.current.delete(upKey);
          stopNoteRef.current(idx, `key-${upKey}`);
        }
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    hasInteracted,
    editMode,
    keyBindings,
    bindingIndex,
    disabledNotes,
    viewMode,
    selectedKeys,
    sequencerNotes,
    inRange,
    undo,
    redo,
    deleteSelectedNotes,
    copySelection,
    pasteSelection,
    cutSelection,
  ]);

  useEffect(() => {
    if (!audioContextRef.current) return;
    const volMul = Math.pow(10, chordVolumeDb / 20);
    const now = audioContextRef.current.currentTime;
    Object.values(oscillatorsRef.current).forEach(entry => {
      if (entry.isChord) {
        entry.gain.gain.setTargetAtTime(0.15 * volMul, now, 0.01);
      }
    });
  }, [chordVolumeDb]);

  useEffect(() => {
    setKeyBindings(prev => {
      if (prev.length === numNotes) return prev;
      if (prev.length < numNotes) {
        const next = [...prev];
        for (let i = prev.length; i < numNotes; i++) {
          const defaultKey = DEFAULT_KEYS_EXTENDED[i] || "?";
          if (i === 12) next.push(["q", ","]);
          else if (i === 13) next.push(["2", "l"]);
          else if (i === 14) next.push(["w", "."]);
          else if (i === 15) next.push(["3", ";"]);
          else if (i === 16) next.push(["e", "/"]);
          else next.push([defaultKey]);
        }
        return next;
      }
      return prev.slice(0, numNotes);
    });
  }, [numNotes]);

  const toggleSequencerNote = (step: number, noteIndex: number) => {
    const key = `${step}-${noteIndex}`;
    const targetType = editTool === "chord" ? "chord" : "normal";
    setSequencerNotes(prev => {
      const next = new Set(prev);
      const isSet = next.has(key);
      const isChord = chordNotes.has(key);
      const currentType = isChord ? "chord" : "normal";

      if (isSet && currentType === targetType) {
        next.delete(key);
        setChordNotes(c => {
          const n = new Set(c);
          n.delete(key);
          return n;
        });
      } else {
        next.add(key);
        setChordNotes(c => {
          const n = new Set(c);
          if (targetType === "chord") n.add(key);
          else n.delete(key);
          return n;
        });
      }
      return next;
    });
  };

  const toggleNoteDisabled = (index: number) => {
    setDisabledNotes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    const activeIndices = Array.from(activeNotes);
    const sequencedPitches = isPlaying ? stepMetadata.pitchesAtStep[currentStep] || [] : [];
    const source =
      activeIndices.length >= 2
        ? activeIndices
        : sequencedPitches.length >= 2
        ? sequencedPitches
        : null;
    if (source && source.length >= 2) {
      const pitches = source.map(idx => octave * 12 + idx);
      setLastSoundedGroup({
        type: source.length >= 3 ? "chord" : "interval",
        pitches,
      });
    }
  }, [activeNotes, isPlaying, currentStep, stepMetadata, octave]);

  const getIntervalInfo = (): IntervalInfo | null => {
    const activeIndices = Array.from(activeNotes);
    const sequencedPitches = isPlaying ? stepMetadata.pitchesAtStep[currentStep] || [] : [];

    let currentPitches: number[] | null = null;
    if (activeIndices.length >= 2) {
      currentPitches = activeIndices.map(i => octave * 12 + i);
    } else if (sequencedPitches.length >= 2) {
      currentPitches = sequencedPitches.map(i => octave * 12 + i);
    } else if (lastSoundedGroup && lastSoundedGroup.pitches.length >= 2) {
      currentPitches = lastSoundedGroup.pitches;
    } else if (lastNotes.length >= 2) {
      currentPitches = [lastNotes[0], lastNotes[1]];
    }

    if (!currentPitches || currentPitches.length < 2) {
      return null;
    }

    if (currentPitches.length >= 3) {
      const chord = getChordName(currentPitches);
      const tension = setTension(currentPitches).tension;
      const bucket = bucketOf(tension);
      return {
        type: "chord",
        name: chord,
        percentage: "Chord Mode",
        consonance: BUCKET_TEXT[bucket],
        diff: currentPitches.length,
        pitches: currentPitches,
        bucket,
      };
    }

    const [p1, p2] = currentPitches;
    const d = describeInterval(p1, p2);
    return {
      type: "interval",
      name: d.name.replace(/^[a-z]/, c => c.toUpperCase()),
      percentage: `${d.ratio} · ${Math.round(d.cents)}¢`,
      consonance: BUCKET_TEXT[d.bucket],
      diff: d.semitones,
      pitches: [p1, p2],
      ratio: d.ratio,
      bucket: d.bucket,
    };
  };

  // Memoised on what it is built from. A fresh object on every render made the scope rebuild its orbit
  // table and restart its draw loop each time anything at all re-rendered (a tap, a step tick, a note).
  const interval = useMemo(getIntervalInfo, [
    activeNotes,
    isPlaying,
    currentStep,
    stepMetadata,
    octave,
    lastSoundedGroup,
    lastNotes,
  ]);

  const startNumericDrag = useCallback(
    (
      initialValue: number,
      setter: (val: number) => void,
      min: number,
      max: number,
      sensitivity = 5
    ) =>
      (e: React.MouseEvent) => {
        const startY = e.clientY;
        const onMouseMove = (moveEvent: MouseEvent) => {
          const deltaY = startY - moveEvent.clientY;
          const deltaVal = Math.floor(deltaY / sensitivity);
          const nextVal = Math.max(min, Math.min(max, initialValue + deltaVal));
          setter(nextVal);
        };

        const onMouseUp = () => {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          document.body.style.cursor = "default";
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "ns-resize";
      },
    []
  );

  // Phone browsers disagree about what 100dvh/100vh means once the toolbar is involved (some count the area
  // under it, so the page ends below the visible screen). innerHeight is what the page can really see.
  useEffect(() => {
    const setAppHeight = () =>
      document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", setAppHeight);
    return () => {
      window.removeEventListener("resize", setAppHeight);
      window.removeEventListener("orientationchange", setAppHeight);
    };
  }, []);

  // Maps a screen point to a roll cell. `inside` is false over the key labels, the ruler and outside the grid.
  const locateCell = (clientX: number, clientY: number) => {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - 52;
    const y = clientY - rect.top;
    const totalContentHeight = renderedNoteIndices.length * rowHeight;
    const pianoRollTop = 32;
    const step = Math.floor(x / effectiveStepWidth);
    const renderedIdx = Math.floor((totalContentHeight - (y + el.scrollTop - pianoRollTop)) / rowHeight);
    const note = renderedNoteIndices[renderedIdx];
    const inside =
      step >= 0 && step < numSteps && renderedIdx >= 0 && renderedIdx < renderedNoteIndices.length;
    return { step, renderedIdx, note, inside };
  };

  // Touch in Select mode: tap a note to toggle it in the selection (tap empty space to clear it),
  // drag a selected note to move the whole selection. Dragging anywhere else still scrolls the roll.
  const touchGestureRef = useRef<{
    x: number;
    y: number;
    step: number;
    note: number;
    onSelected: boolean;
    moved: boolean;
  } | null>(null);

  const cancelTouchDrag = () => {
    touchGestureRef.current = null;
    setIsDragging(false);
    setDragOffset(null);
    setDragStartPos(null);
  };

  const handleRollTouchStart = (e: React.TouchEvent) => {
    if (editTool !== "select") return;
    const t = e.touches[0];
    const loc = e.touches.length === 1 && t ? locateCell(t.clientX, t.clientY) : null;
    if (!t || !loc || !loc.inside) {
      touchGestureRef.current = null;
      return;
    }
    touchGestureRef.current = {
      x: t.clientX,
      y: t.clientY,
      step: loc.step,
      note: loc.note,
      onSelected: selectedKeys.has(`${loc.step}-${loc.note}`),
      moved: false,
    };
  };

  const handleRollTouchMove = (e: React.TouchEvent) => {
    const g = touchGestureRef.current;
    const t = e.touches[0];
    if (!g || !t) return;
    if (e.touches.length !== 1) {
      cancelTouchDrag();
      return;
    }
    if (!g.moved && Math.hypot(t.clientX - g.x, t.clientY - g.y) < 8) return;
    g.moved = true;
    if (!g.onSelected) return; // not on a selected note: the browser is scrolling
    const loc = locateCell(t.clientX, t.clientY);
    if (!loc || loc.note === undefined) return;
    if (!isDragging) {
      setIsDragging(true);
      setDragStartPos({ s: g.step, n: g.note });
    }
    setDragOffset({ ds: loc.step - g.step, dn: loc.note - g.note });
  };

  const handleRollTouchEnd = (e: React.TouchEvent) => {
    const g = touchGestureRef.current;
    touchGestureRef.current = null;
    if (!g) return;
    if (isDragging) {
      finishPointerRef.current();
    } else if (!g.moved) {
      const key = `${g.step}-${g.note}`;
      if (sequencerNotes.has(key)) {
        setSelectedKeys(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else {
        setSelectedKeys(new Set());
      }
    }
    // The tap is handled here; without this the browser repeats it as a mouse click (which would restart a marquee).
    if (e.cancelable) e.preventDefault();
  };

  // Draw / chord / select and the clipboard. Rendered twice: in the control bar (desktop, landscape)
  // and in the roll footer on portrait phones, where the bar sits two screens below the roll.
  const renderRollTools = (editCls: string, clipCls: string) => (
    <>
      <div className={`seg ${editCls}`} role="group" aria-label="Edit tool">
                    <button
                      type="button"
                      onClick={() => setEditTool("draw")}
                      aria-pressed={editTool === "draw"}
                      className="seg-item max-md:flex-1 max-md:px-2.5"
                      title="Draw lead note"
                    >
                      <Pencil size={14} />
                      <span className="hidden min-[1440px]:inline">Draw</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTool("chord")}
                      aria-pressed={editTool === "chord"}
                      className="seg-item max-md:flex-1 max-md:px-2.5"
                      title="Draw backing chord note"
                    >
                      <Layers size={14} />
                      <span className="hidden min-[1440px]:inline">Chord</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTool("select")}
                      aria-pressed={editTool === "select"}
                      aria-label="Marquee select tool"
                      className="seg-item max-md:flex-1 max-md:px-2.5"
                      title="Marquee select tool"
                    >
                      <BoxSelect size={14} />
                      <span className="hidden min-[1440px]:inline">Select</span>
                    </button>
                  </div>

                  <div className={`seg ${clipCls}`} role="group" aria-label="Clipboard">
                    <button
                      type="button"
                      onClick={copySelection}
                      disabled={selectedKeys.size === 0}
                      aria-label="Copy selected notes (Ctrl+C)"
                      className="seg-item seg-icon max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:shrink"
                      title="Copy (Ctrl+C)"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={cutSelection}
                      disabled={selectedKeys.size === 0}
                      aria-label="Cut selected notes (Ctrl+X)"
                      className="seg-item seg-icon max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:shrink"
                      title="Cut (Ctrl+X)"
                    >
                      <Scissors size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => pasteSelection(false)}
                      disabled={!clipboard}
                      aria-label="Paste notes (Ctrl+V)"
                      className="seg-item seg-icon max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:shrink"
                      title="Paste (Ctrl+V)"
                    >
                      <ClipboardPaste size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedNotes}
                      disabled={selectedKeys.size === 0}
                      aria-label="Delete selected notes (Delete)"
                      className="seg-item seg-icon max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:shrink"
                      title="Delete selected (Del)"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
    </>
  );

  const cellHover = hoveredCell && hoveredCell.note >= 0 ? hoveredCell : null;

  const sortedIntervalPitches = interval
    ? [...interval.pitches].sort((a, b) => a - b)
    : [];

  // "Live" marker. Phones show it beside the note chips (or the Standby title); desktop shows it in the classification row.
  const liveTag = (visibility: string, extra = "") =>
    activeNotes.size > 0 ? (
      <span className={`mono inline-flex items-center gap-1.5 text-xs font-medium text-t2 ${visibility} ${extra}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#f2efe6]" aria-hidden="true" />
        Live
      </span>
    ) : null;

  return (
    <div
      data-view={viewMode}
      className="land-root relative flex h-[var(--app-h,100dvh)] w-screen max-md:w-full flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 text-t1 select-none max-md:gap-2 max-md:py-2 md:h-[var(--app-h,100vh)] md:gap-4 md:overflow-hidden md:p-4"
    >
      {/* Audio & WebMIDI initialization dialog */}
      {!hasInteracted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audio-init-title"
          onClick={handleInteraction}
          className="fixed inset-0 z-[100] bg-[#080a08]/95 flex items-center justify-center cursor-pointer"
        >
          <div className="panel w-full max-w-[31rem] mx-4 p-6">
            <h1
              id="audio-init-title"
              className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-t1"
            >
              Consonance Analyzer
            </h1>
            <p className="mt-2.5 max-w-[54ch] text-sm leading-relaxed text-t2">
              Hold two voices to plot their just-intonation Lissajous ratio, <br />
              three or more to trace a bass-demodulated phasor orbit. <br />
              Play with your pointer, keyboard, MIDI controller, <br />
              or the step sequencer.
            </p>

            <button
              type="button"
              autoFocus
              onClick={handleInteraction}
              aria-label="Initialize audio and MIDI engine"
              className="btn btn-primary mt-6 w-full !h-11 !px-4 !text-sm justify-between"
            >
              <span>Initialize audio &amp; MIDI engine</span>
              <span className="text-xs font-medium opacity-65">Press Enter</span>
            </button>
          </div>
        </div>
      )}

      {/* Header: two panels on the same two-row grid, so their dividers line up */}
      <header className="w-full max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 shrink-0 z-30 max-md:contents">
        {/* Left: harmonic readout, vector scope, legend */}
        <section aria-label="Harmonic readout" className="land-readout panel p-3 flex flex-col max-md:order-1 max-md:shrink-0">
          <div className="land-r-top flex flex-col gap-3 md:h-[152px] md:flex-row">
            <div className="land-r-text relative flex min-w-0 flex-col justify-between gap-4 max-md:min-h-[80px] max-md:gap-1.5 md:w-[232px] md:shrink-0 md:gap-0">
              <div className="min-w-0 max-md:flex-1">
                {interval ? (
                  <>
                    <div
                      className="land-title truncate text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-t1 md:text-[32px]"
                      title={interval.name}
                    >
                      {interval.name}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2.5 text-[12.5px] text-t2 max-md:mt-1">
                      {interval.type === "chord" ? (
                        <span>{interval.diff} voices</span>
                      ) : (
                        <>
                          <span>
                            {interval.diff} {interval.diff === 1 ? "semitone" : "semitones"}
                          </span>
                          {interval.percentage.split(" · ").map((part, idx) => (
                            <span key={part} className={`mono ${idx === 0 ? "text-t1" : "text-t2"}`}>
                              {part}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1 max-md:mt-1.5">
                      {sortedIntervalPitches.slice(0, 8).map((p, idx) => (
                        <span
                          key={`${p}-${idx}`}
                          className="chip"
                          data-bass={idx === 0}
                          title={idx === 0 ? "Bass note" : undefined}
                        >
                          {noteName(p)}
                        </span>
                      ))}
                      {sortedIntervalPitches.length > 8 && (
                        <span className="mono text-xs text-t3">+{sortedIntervalPitches.length - 8}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="land-title text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-t3 md:text-[32px]">
                        Standby
                      </div>
                    </div>
                    <div className="mt-2 text-[13px] text-t3">Play 2+ notes to analyze</div>
                  </>
                )}
              </div>

              {/* Phones: the classification sits top-right on the title line; Live stays on the chips line */}
              <div className="land-r-class flex h-6 items-center justify-between gap-2 max-md:absolute max-md:right-0 max-md:top-0 max-md:h-[34px]">
                <span
                  className={`flex items-center gap-2 text-sm font-medium ${
                    interval ? "text-t1" : "text-t3"
                  }`}
                >
                  {interval && <ConsonanceGlyph bucket={interval.bucket} size={16} />}
                  {interval ? BUCKET_LABEL[interval.bucket as Bucket] : "Idle"}
                </span>
                {liveTag("max-md:hidden", "land-live-a")}
              </div>
              {/* Phones: Live has one fixed place, bottom-right of the readout block, in every state */}
              {liveTag("md:hidden", "land-live-b max-md:absolute max-md:bottom-0 max-md:right-0 max-md:h-[22px]")}
            </div>

            <div className={`land-scope well relative min-w-0 overflow-hidden md:h-auto md:flex-1 ${viewMode === "roll" ? "max-md:h-[clamp(72px,calc(var(--app-h,100dvh)*0.09),120px)]" : "max-md:h-[clamp(104px,calc(var(--app-h,100dvh)*0.14),220px)]"}`}>
              <HarmonicVisualizer interval={interval} viewMode={viewMode} />
            </div>
          </div>

          <div className={`land-legend mt-3 -mx-3 grid grid-cols-2 gap-x-2 gap-y-2 border-t rule px-3 pt-3 box-content max-md:flex max-md:flex-wrap max-md:justify-between max-md:gap-y-1 ${viewMode === "roll" ? "max-md:mt-2 max-md:pt-2" : "max-md:mt-3 max-md:pt-3"} md:flex md:min-h-[28px] md:flex-wrap md:items-center md:gap-x-5 md:gap-y-1.5`}>
            {LEGEND.map(({ bucket, label, hint }) => (
              <span
                key={bucket}
                className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-t2"
                title={`${label}: ${hint}`}
              >
                <ConsonanceGlyph bucket={bucket} size={14} />
                <span className="trim-caps">{label}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Right: transport, encoders, waveform, then view and file controls */}
        <section aria-label="Controls" className="land-ctl panel p-3 flex flex-col max-md:order-3 max-md:shrink-0">
          <div className="land-ctl-top flex flex-col gap-3 max-md:grid max-md:grid-cols-[88px_minmax(0,1fr)] max-md:gap-2 md:h-[152px] md:flex-row">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              data-playing={isPlaying}
              aria-label={isPlaying ? "Stop sequence playback" : "Start sequence playback"}
              title="Play or stop (Space)"
              className="land-play transport max-md:h-[60px] max-md:w-full max-md:flex-row max-md:gap-2"
            >
              {isPlaying ? (
                <Square size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              <span>{isPlaying ? "Stop" : "Play"}</span>
            </button>

            <div className="land-dials well grid min-w-0 grid-cols-3 cols-rule max-md:order-last max-md:col-span-2 max-md:py-1.5 md:flex-1">
              <EncoderCell
                label="BPM"
                display={String(bpm)}
                value={bpm}
                min={40}
                max={240}
                title="Drag vertically or scroll to adjust BPM"
                valueLabel="Master tempo in BPM"
                decLabel="Decrease BPM"
                incLabel="Increase BPM"
                onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 5)}
                onWheelStep={dir => setBpm(prev => Math.max(40, Math.min(240, prev + dir)))}
                onStep={dir => setBpm(prev => Math.max(40, Math.min(240, prev + dir)))}
              />
              <EncoderCell
                label="Span"
                display={String(numNotes)}
                value={numNotes}
                min={1}
                max={60}
                title="Drag vertically or scroll to adjust note span"
                valueLabel="Note span"
                decLabel="Decrease note span"
                incLabel="Increase note span"
                onMouseDown={startNumericDrag(numNotes, setNumNotes, 1, 60, 15)}
                onWheelStep={dir => setNumNotes(prev => Math.max(1, Math.min(60, prev + dir)))}
                onStep={dir => setNumNotes(prev => Math.max(1, Math.min(60, prev + dir)))}
              />
              <EncoderCell
                label="Base"
                display={`C${octave}`}
                value={octave}
                min={1}
                max={8}
                title="Drag vertically or scroll to adjust base octave"
                valueLabel="Base octave"
                decLabel="Decrease base octave"
                incLabel="Increase base octave"
                onMouseDown={startNumericDrag(octave, setOctave, 1, 8, 18)}
                onWheelStep={dir => setOctave(prev => Math.max(1, Math.min(8, prev + dir)))}
                onStep={dir => setOctave(prev => Math.max(1, Math.min(8, prev + dir)))}
              />
            </div>

            <WaveSelector store={waveStore} />
          </div>

          <div className="land-ctl-bar mt-3 -mx-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t rule px-3 pt-3 box-content max-md:mt-2 max-md:gap-x-2 max-md:gap-y-1 max-md:pt-2">
            {/* Phones: both groups dissolve into one wrapping row; view switch and MIDI lead, actions follow */}
            <div className="flex flex-wrap items-center gap-2 max-md:contents">
              <div className="seg max-md:order-first max-md:min-w-0 max-md:flex-1" role="group" aria-label="Surface">
                <button
                  type="button"
                  onClick={() => switchViewMode("pad")}
                  aria-pressed={viewMode === "pad"}
                  className="seg-item max-md:flex-1"
                  title="Harmonic pad view"
                >
                  Pads
                </button>
                <button
                  type="button"
                  onClick={() => switchViewMode("roll")}
                  aria-pressed={viewMode === "roll"}
                  className="seg-item max-md:flex-1"
                  title="Piano roll sequencer"
                >
                  Sequencer
                </button>
              </div>

              {viewMode === "pad" && (
                <>
                  <button
                    type="button"
                    onClick={() => setHideDisabled(!hideDisabled)}
                    aria-pressed={hideDisabled}
                    aria-label="Hide muted pads"
                    className="btn max-md:flex-1 max-md:px-2"
                    title={hideDisabled ? "Show muted pads" : "Hide muted pads"}
                  >
                    {hideDisabled ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>Hide muted</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(!editMode);
                      setBindingIndex(null);
                    }}
                    aria-pressed={editMode}
                    aria-label={
                      editMode ? "Exit key binding mode" : "Configure key bindings and mute pads"
                    }
                    className="btn max-md:flex-1 max-md:px-2"
                    title="Configure key bindings and mute pads"
                  >
                    <Settings2 size={14} />
                    <span className="max-md:hidden">Edit keys</span>
                    <span className="md:hidden">{editMode ? "Done" : "Edit keys"}</span>
                  </button>
                </>
              )}

              {viewMode === "roll" && (
                <>
                  {renderRollTools(
                    "land-bar-tool max-md:my-0.5 max-md:flex-[3] max-md:hidden",
                    "land-bar-tool max-md:my-0.5 max-md:flex-[4] max-md:hidden"
                  )}
                </>
              )}
            </div>

            {/* Phones: forces the row break after view switch + MIDI, whatever the width */}
            <div aria-hidden="true" className="hidden max-md:order-[-9998] max-md:block max-md:h-0 max-md:basis-full" />
            {/* Landscape phones, sequencer: the tools share the bar, so Export and Import pair up on their own row below them */}
            {viewMode === "roll" && <div aria-hidden="true" className="land-bar-break hidden" />}
            <div className="flex items-center gap-2 max-md:contents">
              <button
                type="button"
                onClick={exportSequence}
                aria-label="Export sequence to JSON file"
                className={`btn ${viewMode === "roll" ? "max-md:flex-1" : "max-md:w-10 max-md:shrink-0 max-md:px-0"}`}
                title="Export sequence as JSON"
              >
                <Download size={14} />
                <span className={`hidden ${viewMode === "roll" ? "max-md:inline " : ""}2xl:inline`}>Export</span>
              </button>
              <label
                aria-label="Import sequence from JSON file"
                className={`btn ${viewMode === "roll" ? "max-md:flex-1" : "max-md:w-10 max-md:shrink-0 max-md:px-0"}`}
                title="Import sequence from JSON"
              >
                <Upload size={14} />
                <span className={`hidden ${viewMode === "roll" ? "max-md:inline " : ""}2xl:inline`}>Import</span>
                <input type="file" accept=".json" onChange={importSequence} className="sr-only" />
              </label>
              <div
                className={`flex items-center gap-1.5 px-1 text-xs max-md:order-first max-md:shrink-0 ${
                  midiStatus === "connected" ? "text-t1" : "text-t3"
                }`}
                title={`MIDI status: ${midiStatus}`}
              >
                <Radio size={14} />
                <span className="max-[420px]:hidden">MIDI</span>
                <span className="hidden max-md:inline 2xl:inline text-t3">
                  {midiStatus === "connected"
                    ? "Connected"
                    : midiStatus === "disconnected"
                    ? "No device"
                    : midiStatus === "locked"
                    ? "Blocked"
                    : "Unsupported"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </header>

      {/* MAIN INSTRUMENT WORKSPACE */}
      <main className={`land-main flex-1 w-full max-w-[1720px] mx-auto flex flex-col ${viewMode === "pad" ? "min-h-[168px] max-md:max-h-[440px]" : "min-h-[360px]"} max-md:order-2 md:min-h-0`}>
        {viewMode === "pad" ? (() => {
          const renderedPads = Array.from({ length: numNotes })
            .map((_, i) => i)
            .filter(i => !hideDisabled || !disabledNotes.has(i));
          // One continuous keybed. Octaves are grouped by each note's own octave
          // (index / 12), never by a count, so the markers always sit on a C no
          // matter how many notes are shown or muted.
          const octaveGroups: { octave: number; start: number; count: number }[] = [];
          renderedPads.forEach((idx, col) => {
            const o = Math.floor(idx / 12);
            const last = octaveGroups[octaveGroups.length - 1];
            if (last && last.octave === o) last.count += 1;
            else octaveGroups.push({ octave: o, start: col, count: 1 });
          });
          // Dense styling exists for wide screens, where every extra key squeezes all pads narrower.
          // On phones the keybed keeps a fixed pad width and scrolls sideways, so the count must not
          // change label size or key height there.
          const dense = renderedPads.length > 36 && !isPhoneWidth;
          // Naturals start a little lower, so the raised accidentals carry the
          // piano's 2 + 3 rhythm by shape alone, without a second surface colour.
          const accidentalDrop = dense ? 14 : 24;

          const renderPad = (i: number, col: number) => {
            const isDisabled = disabledNotes.has(i);
            const isActive = activeNotes.has(i);
            const noteLabel = getNoteName(i);
            const noteOctave = octave + Math.floor(i / 12);
            const accidental = isAccidental(i);
            const isBinding = bindingIndex === i;
            // Pads past the default key map carry a "?" placeholder binding; show it as unbound.
            const unbound = i >= DEFAULT_KEYS_EXTENDED.length && keyBindings[i]?.join("") === "?";
            const keyText = unbound ? "–" : keyBindings[i]?.join(" ");
            const activeIndices =
              activeNotes.size > 0
                ? Array.from(activeNotes)
                : pivotNote !== null
                ? [pivotNote]
                : [];
            const type = getHarmonicTypeForSet(i, activeIndices);
            const displayColor = COLORS[type as keyof typeof COLORS] || COLORS.neutral;

            const glyphSize = Math.max(16, Math.min(24, 420 / numNotes));
            const hasRelation = activeIndices.length > 0 && !isDisabled && type !== "neutral";

            // Single uniform surface colour across natural and accidental pads so
            // identical consonance buckets never appear as different shades.
            const padBg = isDisabled ? "transparent" : "#141814";
            const padTint = !hasRelation
              ? "transparent"
              : isActive
              ? `${displayColor}3d`
              : `${displayColor}1c`;
            const padRing = isBinding
              ? `inset 0 0 0 2px ${INK.t1}`
              : isActive && !isDisabled
              ? `inset 0 0 0 1.5px ${displayColor}`
              : "none";

            return (
              <div
                key={i}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                aria-label={`Note ${noteLabel}${noteOctave}, ${type !== "neutral" ? BUCKET_TEXT[type as Bucket] : "neutral consonance"}${keyBindings[i]?.length && !unbound ? `, key ${keyBindings[i].join(" ")}` : ""}`}
                aria-pressed={isActive}
                aria-disabled={isDisabled}
                onKeyDown={e => {
                  if (editMode) {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (bindingIndex === i) toggleNoteDisabled(i);
                      else setBindingIndex(i);
                    }
                  } else {
                    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                      e.preventDefault();
                      startNote(i, "keyboard");
                    }
                  }
                }}
                onKeyUp={e => {
                  if (!editMode && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    stopNote(i, "keyboard");
                  }
                }}
                onMouseDown={() => !editMode && startNote(i, "mouse")}
                onMouseEnter={e => !editMode && e.buttons === 1 && startNote(i, "mouse")}
                onMouseUp={() => !editMode && stopNote(i, "mouse")}
                onMouseLeave={() => !editMode && stopNote(i, "mouse")}
                onTouchStart={e => {
                  // In edit mode touches are left to the browser: a swipe scrolls the keybed,
                  // and only a real tap synthesizes the click that edits the pad
                  if (editMode) return;
                  e.preventDefault();
                  startNote(i, "touch");
                }}
                onTouchEnd={e => {
                  if (editMode) return;
                  e.preventDefault();
                  stopNote(i, "touch");
                }}
                onClick={() => {
                  if (editMode) {
                    if (touchPrimary || bindingIndex === i) toggleNoteDisabled(i);
                    else setBindingIndex(i);
                  }
                }}
                data-edit={editMode}
                style={
                  {
                    "--pad-bg": padBg,
                    "--pad-tint": padTint,
                    boxShadow: padRing,
                    gridRow: 2,
                    gridColumn: col + 1,
                    marginTop: accidental ? 0 : accidentalDrop,
                  } as React.CSSProperties
                }
                className={`pad group min-w-0 focus:z-30 ${isBinding ? "z-20" : ""}`}
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-3 ${
                    dense ? "gap-1.5 px-0" : "gap-2 px-1"
                  }`}
                >
                  <div className="flex h-6 items-center justify-center">
                    {hasRelation && (
                      <ConsonanceGlyph
                        bucket={type as keyof typeof COLORS}
                        size={glyphSize}
                        filled={isActive}
                      />
                    )}
                  </div>

                  <span
                    className={`font-semibold leading-none ${
                      dense ? "text-[11px] tracking-[-0.04em]" : "text-[15px] tracking-tight"
                    } ${isDisabled ? "text-t3" : "text-t1"}`}
                  >
                    {noteLabel}
                  </span>

                  {isBinding ? (
                    <div className="flex flex-col items-center gap-1 text-center max-md:hidden">
                      <span
                        className={`rounded-[3px] px-1.5 py-1 text-xs font-medium leading-tight text-balance ${
                          bindingError
                            ? "border border-white/30 text-t1"
                            : "bg-[#f2efe6] text-[#0b0d0b]"
                        }`}
                      >
                        {bindingError || "Press a key"}
                      </span>
                      <span className="mono text-xs font-medium uppercase text-t2">
                        {keyText}
                      </span>
                    </div>
                  ) : unbound && !editMode && !isDisabled ? (
                    <span aria-hidden="true" className="kbd-hint h-[22px]" />
                  ) : (
                    <span
                      className={`keycap ${isDisabled ? "normal-case" : "kbd-hint uppercase"} ${
                        dense ? "!min-w-0 !border-0 !bg-transparent !px-0 !text-[11px]" : ""
                      } ${isActive ? "!border-[#f2efe6] !text-[#f2efe6]" : ""} ${
                        isDisabled ? "!border-transparent !bg-transparent !text-[#878174]" : ""
                      }`}
                    >
                      {isDisabled ? "Off" : keyText}
                    </span>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              {/* Shown only while editing key bindings */}
              {editMode && (
                <div className="land-hint-card panel flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-[13px] text-t2 max-md:hidden">
                  <span>Click a pad to bind a key. Click it again to mute or unmute.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      setBindingIndex(null);
                    }}
                    className="btn"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* One continuous keybed; a ruler above it names each octave at its C */}
              <div className="land-keypanel panel relative flex min-h-0 flex-1 p-3 max-md:flex-col">
                {/* Phones: the edit hint lives inside the keybed panel, so the pads keep their height */}
                {editMode && (
                  <p role="status" className="land-hint-line mb-2 shrink-0 text-xs text-t2 md:hidden">
                    {bindingIndex !== null
                      ? bindingError ||
                        `Press a key for ${getNoteName(bindingIndex)}${octave + Math.floor(bindingIndex / 12)}`
                      : touchPrimary
                      ? "Tap a pad to mute or unmute it."
                      : "Click a pad to bind a key; click again to mute."}
                  </p>
                )}
                <div className="keybed-scroll flex min-h-0 flex-1 overflow-x-auto md:overflow-x-visible no-scrollbar">
                  <div
                    role="group"
                    aria-label="Note pads"
                    className="keybed"
                    style={{ "--n": renderedPads.length } as React.CSSProperties}
                  >
                    {octaveGroups.map(g => (
                      <div
                        key={`oct-${g.octave}`}
                        aria-hidden="true"
                        className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap"
                        style={{ gridRow: 1, gridColumn: `${g.start + 1} / span ${g.count}` }}
                      >
                        <span className="mono text-xs font-medium leading-none text-t2">
                          C{octave + g.octave}
                        </span>
                        <span className="mt-[5px] h-[5px] min-w-0 flex-1 rounded-tr-[2px] border-r border-t border-[color:var(--line-2)]" />
                      </div>
                    ))}
                    {renderedPads.map(renderPad)}
                  </div>
                </div>
              </div>
            </div>
          );
        })() : (
          /* SEQUENCER PIANO ROLL VIEW */
          <div className="panel overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div
                className="flex-1 overflow-auto bg-[#080a08]"
                ref={scrollRef}
                onScroll={updateViewport}
                onMouseLeave={() => setHoveredCell(null)}
                onTouchStart={handleRollTouchStart}
                onTouchMove={handleRollTouchMove}
                onTouchEnd={handleRollTouchEnd}
                onTouchCancel={cancelTouchDrag}
                onMouseMove={e => {
                  const loc = locateCell(e.clientX, e.clientY);
                  if (!loc) return;
                  const { step, renderedIdx, note } = loc;

                  if (loc.inside) {
                    liveHoverRef.current = { step, note };
                  }

                  if (isSelecting) {
                    setSelectionRect(prev =>
                      prev ? { ...prev, s2: step, n2: renderedIdx } : null
                    );
                  } else if (isDragging && dragStartPos && note !== undefined) {
                    setDragOffset({ ds: step - dragStartPos.s, dn: note - dragStartPos.n });
                  }
                }}
              >
                <div
                  className="flex flex-col-reverse justify-end min-w-full min-h-full relative"
                  style={{ width: `${Math.max(containerWidth, numSteps * effectiveStepWidth + 52)}px` }}
                >
                  {/* Marquee Selection Box */}
                  {selectionRect && (
                    <div
                      style={{
                        left: `${Math.min(selectionRect.s1, selectionRect.s2) * effectiveStepWidth + 52}px`,
                        bottom: `${Math.min(selectionRect.n1, selectionRect.n2) * rowHeight}px`,
                        width: `${(Math.abs(selectionRect.s2 - selectionRect.s1) + 1) * effectiveStepWidth}px`,
                        height: `${(Math.abs(selectionRect.n2 - selectionRect.n1) + 1) * rowHeight}px`,
                        zIndex: 40,
                      }}
                      className="absolute bg-[#f2efe6]/[0.08] border border-[#f2efe6]/70 pointer-events-none rounded-[2px]"
                    />
                  )}

                  {Array.from({ length: renderedNoteIndices.length }).map((_, renderedIdx) => {
                    const noteIdx = renderedNoteIndices[renderedIdx];
                    const isDisabled = disabledNotes.has(noteIdx);
                    const isNoteSounding = activeNotes.has(noteIdx);
                    const accidental = isAccidental(noteIdx);
                    const isRootC = noteIdx % 12 === 0;
                    const noteOct = octave + Math.floor(noteIdx / 12);

                    return (
                      <div
                        key={noteIdx}
                        style={{ height: `${rowHeight}px` }}
                        className={`flex border-b ${
                          isRootC ? "border-[#dad2be]/[0.16]" : "border-[#dad2be]/[0.055]"
                        } group shrink-0 bg-[#0d100d] ${
                          isDisabled ? "opacity-25 grayscale pointer-events-none" : ""
                        }`}
                      >
                        {/* Sticky Piano Key Label */}
                        <div
                          className={`sticky left-0 w-[52px] h-full flex items-center gap-0.5 px-2 ${
                            accidental ? "pl-4" : ""
                          } mono text-xs font-medium border-r border-[#dad2be]/[0.12] z-50 shrink-0 transition-colors ${
                            isNoteSounding
                              ? "bg-[#262b25] text-t1"
                              : isRootC
                              ? "bg-[#161a16] text-t1"
                              : "bg-[#101310] text-t2"
                          } group-hover:text-t1`}
                          style={isNoteSounding ? { boxShadow: "inset 2px 0 0 #f2efe6" } : undefined}
                        >
                          <span>{getNoteName(noteIdx)}</span>
                          {isRootC && (
                            <span className="text-[11px] font-normal text-t2">
                              {noteOct}
                            </span>
                          )}
                        </div>

                        <div
                          style={{ width: `${Math.min(viewportSteps.start, numSteps) * effectiveStepWidth}px` }}
                          className="flex-shrink-0 h-full pointer-events-none"
                        />

                        {(() => {
                          const start = Math.min(viewportSteps.start, numSteps);
                          const end = Math.min(viewportSteps.end, numSteps);
                          return Array.from({ length: Math.max(0, end - start) }).map((_, idx) => {
                            const stepIdx = idx + start;
                            const key = `${stepIdx}-${noteIdx}`;
                            const isSet = sequencerNotes.has(key);
                            const isChord = chordNotes.has(key);
                            const isSelected = selectedKeys.has(key);
                            const hasPrev = sequencerNotes.has(`${stepIdx - 1}-${noteIdx}`);
                            const hasNext = sequencerNotes.has(`${stepIdx + 1}-${noteIdx}`);
                            const isCurrent = currentStep === stepIdx;
                            const isBeatStart = stepIdx % 4 === 0;
                            const isBarStart = stepIdx % 16 === 0;
                            const isAltBeatGroup = Math.floor(stepIdx / 4) % 2 === 1;
                            const isHovered =
                              !isTouchDevice &&
                              cellHover?.step === stepIdx &&
                              cellHover?.note === noteIdx;

                            const prevRealStep = stepMetadata.prevGlobalSteps[stepIdx];
                            let displayHeaderColor = null;
                            let isHeaderIntercepted = false;

                            let propagationHintColor = null;
                            let propagationBucket: keyof typeof COLORS | null = null;
                            let isPropagationStart = false;
                            if (
                              stepMetadata.absoluteLastStep !== -1 &&
                              stepIdx > stepMetadata.absoluteLastStep
                            ) {
                              const lastBass =
                                stepMetadata.bassAtStep[stepMetadata.absoluteLastStep];
                              const type = getConsonanceType(noteIdx - lastBass);
                              propagationHintColor = COLORS[type as keyof typeof COLORS];
                              propagationBucket = type as keyof typeof COLORS;
                              isPropagationStart = stepIdx === stepMetadata.absoluteLastStep + 1;
                            }

                            if (isSet && !hasPrev) {
                              if (!isTouchDevice && cellHover && cellHover.step !== stepIdx) {
                                const distToPrev =
                                  prevRealStep === -1
                                    ? Infinity
                                    : (stepIdx - prevRealStep + numSteps) % numSteps;
                                const distToHover =
                                  (stepIdx - cellHover.step + numSteps) % numSteps;
                                const trueDistToPrev = distToPrev === 0 ? numSteps : distToPrev;
                                const trueDistToHover =
                                  distToHover === 0 ? numSteps : distToHover;

                                if (trueDistToHover <= trueDistToPrev) {
                                  const type = getConsonanceType(noteIdx - cellHover.note);
                                  displayHeaderColor =
                                    COLORS[type as keyof typeof COLORS] || COLORS.perfect;
                                  isHeaderIntercepted = true;
                                }
                              }
                              if (!isHeaderIntercepted) {
                                if (prevRealStep !== -1) {
                                  const currentBass = stepMetadata.bassAtStep[stepIdx];
                                  const prevBass = stepMetadata.bassAtStep[prevRealStep];
                                  const type = getConsonanceType(currentBass - prevBass);
                                  displayHeaderColor =
                                    COLORS[type as keyof typeof COLORS] || COLORS.perfect;
                                } else {
                                  displayHeaderColor = COLORS.perfect;
                                }
                              }
                            }

                            let ghostHeaderColor = null;
                            let ghostLineColor = null;
                            if (!isTouchDevice && editTool === "draw" && isHovered && !isSet) {
                              if (prevRealStep !== -1) {
                                const prevBass = stepMetadata.bassAtStep[prevRealStep];
                                const type = getConsonanceType(noteIdx - prevBass);
                                ghostHeaderColor =
                                  COLORS[type as keyof typeof COLORS] || COLORS.perfect;
                              } else {
                                ghostHeaderColor = COLORS.perfect;
                              }

                              const currentStepPitches = stepMetadata.pitchesAtStep[stepIdx];
                              if (currentStepPitches.length > 0) {
                                const type = getHarmonicTypeForSet(noteIdx, currentStepPitches);
                                ghostLineColor = COLORS[type as keyof typeof COLORS];
                              } else {
                                ghostLineColor = null;
                              }
                            }

                            let noteInternalLineColor = null;
                            if (isSet) {
                              if (
                                !isTouchDevice &&
                                editTool === "draw" &&
                                cellHover &&
                                cellHover.step === stepIdx &&
                                cellHover.note !== noteIdx
                              ) {
                                const type = getConsonanceType(noteIdx - cellHover.note);
                                noteInternalLineColor = COLORS[type as keyof typeof COLORS];
                              } else {
                                const othersInChord = stepMetadata.pitchesAtStep[stepIdx].filter(
                                  p => p !== noteIdx
                                );
                                if (othersInChord.length > 0) {
                                  const type = getHarmonicTypeForSet(
                                    noteIdx,
                                    stepMetadata.pitchesAtStep[stepIdx]
                                  );
                                  noteInternalLineColor = COLORS[type as keyof typeof COLORS];
                                } else {
                                  noteInternalLineColor = null;
                                }
                              }
                            }

                            return (
                              <div
                                key={stepIdx}
                                onMouseDown={e => {
                                  if (editTool === "select") {
                                    if (isSet && isSelected) {
                                      setIsDragging(true);
                                      setDragStartPos({ s: stepIdx, n: noteIdx });
                                    } else {
                                      setIsSelecting(true);
                                      setSelectionRect({
                                        s1: stepIdx,
                                        n1: renderedIdx,
                                        s2: stepIdx,
                                        n2: renderedIdx,
                                      });
                                      if (!e.shiftKey) setSelectedKeys(new Set());
                                    }
                                  } else {
                                    toggleSequencerNote(stepIdx, noteIdx);
                                  }
                                  e.stopPropagation();
                                }}
                                onMouseEnter={() => {
                                  const target = { step: stepIdx, note: noteIdx };
                                  setHoveredCell(target);
                                  liveHoverRef.current = target;
                                }}
                                onMouseLeave={() => {
                                  setHoveredCell(null);
                                }}
                                style={{
                                  width: `${effectiveStepWidth}px`,
                                  touchAction: editTool === "select" && isSet && isSelected ? "none" : undefined,
                                }}
                                className={`flex-shrink-0 border-r ${
                                  isBarStart
                                    ? "border-r-[#dad2be]/[0.22]"
                                    : isBeatStart
                                    ? "border-r-[#dad2be]/[0.11]"
                                    : "border-r-[#dad2be]/[0.045]"
                                } cursor-pointer relative overflow-visible ${
                                  isCurrent
                                    ? "bg-[#f2efe6]/[0.06]"
                                    : pasteAnchor === stepIdx
                                    ? "bg-[#f2efe6]/[0.03]"
                                    : isAltBeatGroup
                                    ? "bg-[#f2efe6]/[0.012]"
                                    : ""
                                } ${!isTouchDevice ? "hover:bg-[#f2efe6]/[0.05]" : ""}`}
                              >
                                {isCurrent && (
                                  <div className="absolute inset-y-0 left-0 w-[1.5px] bg-[#f2efe6]/45 pointer-events-none z-20" />
                                )}
                                {pasteAnchor === stepIdx && (
                                  <div className="absolute inset-y-0 left-0 w-[1px] bg-[#f2efe6]/30 pointer-events-none z-0" />
                                )}
                                {propagationHintColor && (
                                  <div
                                    style={{
                                      background: propagationHintColor,
                                      opacity: 0.075,
                                      zIndex: 1,
                                      left: isPropagationStart ? "3px" : "-1px",
                                      borderTopLeftRadius: isPropagationStart ? "2px" : "0px",
                                      borderBottomLeftRadius: isPropagationStart ? "2px" : "0px",
                                    }}
                                    className="absolute inset-y-1 right-0 pointer-events-none transition-colors duration-300"
                                  />
                                )}
                                {isPropagationStart && propagationBucket && (
                                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 opacity-80">
                                    <ConsonanceGlyph bucket={propagationBucket} size={12} filled={false} />
                                  </div>
                                )}
                                {isDragging &&
                                  dragDelta &&
                                  isSelected &&
                                  (() => {
                                    const t = renderedNoteIndices.indexOf(noteIdx + dragDelta.dn);
                                    return t < 0 ? null : (
                                      <div
                                        style={{
                                          backgroundColor: "#f2efe6",
                                          opacity: 0.22,
                                          left: `${dragDelta.ds * effectiveStepWidth}px`,
                                          bottom: `${(t - renderedIdx) * rowHeight}px`,
                                          width: `${effectiveStepWidth}px`,
                                          height: `${rowHeight - 2}px`,
                                          zIndex: 40,
                                        }}
                                        className="absolute pointer-events-none rounded-[3px] ring-1 ring-[#f2efe6]/70"
                                      />
                                    );
                                  })()}

                                {isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: isSelected
                                          ? "#3d433b"
                                          : isChord
                                          ? "#171a17"
                                          : "#2a2f29",
                                        left: hasPrev ? "-1px" : "2px",
                                        right: hasNext ? "-1px" : "3px",
                                        zIndex: 5,
                                        borderTopLeftRadius: hasPrev ? 0 : "3px",
                                        borderBottomLeftRadius: hasPrev ? 0 : "3px",
                                        borderTopRightRadius: hasNext ? 0 : "3px",
                                        borderBottomRightRadius: hasNext ? 0 : "3px",
                                        border: isSelected
                                          ? "1px solid #f2efe6"
                                          : isChord
                                          ? "1px dashed rgba(242, 239, 230, 0.4)"
                                          : "1px solid rgba(242, 239, 230, 0.28)",
                                        opacity: isChord ? 0.85 : 1,
                                      }}
                                      className="absolute top-1 bottom-1"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: noteInternalLineColor || "transparent",
                                        height: isChord ? "1.5px" : "2.5px",
                                        left: hasPrev ? "-1px" : "6px",
                                        right: hasNext ? "-1px" : "7px",
                                        top: "50%",
                                        zIndex: 10,
                                        opacity: isChord ? 0.65 : 1,
                                      }}
                                      className="absolute pointer-events-none transition-colors duration-150 -translate-y-1/2 rounded-full"
                                    />
                                    {displayHeaderColor && (
                                      <div
                                        style={{
                                          backgroundColor: displayHeaderColor,
                                          width: isHeaderIntercepted ? "5px" : "4px",
                                          left: isHeaderIntercepted ? "-1px" : "2px",
                                          zIndex: 10,
                                          opacity: isChord ? 0.7 : 1,
                                        }}
                                        className="absolute top-1 bottom-1 rounded-l-sm"
                                      >
                                        {stepIdx === stepMetadata.firstStepWithNotes && (
                                          <div className="absolute inset-y-0 left-0 w-[1.5px] bg-[#f2efe6]" />
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {!isTouchDevice && editTool === "draw" && isHovered && !isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: "#1c201c",
                                        left: "2px",
                                        right: "3px",
                                        borderRadius: "3px",
                                        zIndex: 5,
                                      }}
                                      className="absolute top-1 bottom-1 border border-[#f2efe6]/15"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: ghostLineColor || "transparent",
                                        height: "2.5px",
                                        left: "6px",
                                        right: "7px",
                                        top: "50%",
                                        zIndex: 10,
                                      }}
                                      className="absolute pointer-events-none -translate-y-1/2 rounded-full"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: ghostHeaderColor || "transparent",
                                        width: "4px",
                                        left: "2px",
                                        zIndex: 10,
                                      }}
                                      className="absolute top-1 bottom-1 rounded-l-sm"
                                    />
                                  </>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    );
                  })}

                  {/* Sticky step ruler (h-8 = 32px; the hover maths above assumes this) */}
                  <div className="h-8 border-b border-[#dad2be]/[0.12] flex bg-[#131613] z-[100] sticky top-0 shrink-0">
                    <div className="w-[52px] border-r border-[#dad2be]/[0.12] shrink-0 bg-[#131613] sticky left-0 z-[110] flex items-center justify-center text-xs font-medium text-t3">
                      Step
                    </div>
                    {Array.from({ length: numSteps }).map((_, i) => {
                      const isBeat = i % 4 === 0;
                      const isBar = i % 16 === 0;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            setPasteAnchor(i);
                            if (!isPlaying) {
                              currentStepRef.current = i;
                              setCurrentStep(i);
                            }
                          }}
                          onMouseEnter={() =>
                            !isTouchDevice &&
                            setHoveredCell(prev => ({ step: i, note: prev?.note ?? -1 }))
                          }
                          onMouseLeave={() => !isTouchDevice && setHoveredCell(null)}
                          style={{ width: `${effectiveStepWidth}px` }}
                          className={`mono flex-shrink-0 h-full flex items-center justify-center text-xs font-medium border-r ${
                            isBar
                              ? "border-r-[#dad2be]/[0.22]"
                              : isBeat
                              ? "border-r-[#dad2be]/[0.11]"
                              : "border-r-[#dad2be]/[0.045]"
                          } transition-colors cursor-pointer relative ${
                            currentStep === i
                              ? "bg-[#f2efe6]/12 text-t1 font-semibold"
                              : pasteAnchor === i
                              ? "bg-[#f2efe6]/[0.05] text-t1"
                              : hoveredCell?.step === i
                              ? "text-t1 bg-[#f2efe6]/5"
                              : isBar
                              ? "text-t1 bg-[#f2efe6]/[0.03]"
                              : isBeat
                              ? "text-t2"
                              : "text-t3"
                          }`}
                        >
                          {i + 1}
                          {currentStep === i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#f2efe6]" />
                          )}
                          {pasteAnchor === i && currentStep !== i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#f2efe6]/40" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sequencer footer: pattern length, zoom, tempo, follow. Chord level sits at the far end. */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#131613] border-t border-[#dad2be]/[0.12] z-40 shrink-0 max-md:grid max-md:grid-cols-12">
                {/* Phones: the tools sit right under the roll */}
                {renderRollTools(
                  "roll-foot md:hidden max-md:col-span-5 max-[350px]:col-span-12",
                  "roll-foot md:hidden max-md:col-span-7 max-[350px]:col-span-12"
                )}
                <Stepper
                  label="Steps"
                  display={numSteps}
                  value={numSteps}
                  min={4}
                  max={1024}
                  ariaLabel="Pattern steps"
                  decLabel="Decrease pattern steps"
                  incLabel="Increase pattern steps"
                  onDec={() => setNumSteps(prev => Math.max(4, prev - 4))}
                  onInc={() => setNumSteps(prev => Math.min(1024, prev + 4))}
                  onMouseDown={startNumericDrag(numSteps, setNumSteps, 4, 1024, 10)}
                  onWheel={e => {
                    if (e.deltaY < 0) setNumSteps(prev => Math.min(1024, prev + 4));
                    else setNumSteps(prev => Math.max(4, prev - 4));
                  }}
                  className="cursor-ns-resize max-md:col-span-6 max-md:min-w-0 max-[350px]:col-span-12"
                />

                <Stepper
                  label="Zoom"
                  display={
                    <>
                      {effectiveStepWidth}
                      <span className="max-md:hidden">px</span>
                    </>
                  }
                  value={effectiveStepWidth}
                  min={16}
                  max={160}
                  ariaLabel="Step width zoom"
                  decLabel="Zoom out sequencer step width"
                  incLabel="Zoom in sequencer step width"
                  onDec={() => setStepWidth(prev => Math.max(16, prev - 8))}
                  onInc={() => setStepWidth(prev => Math.min(160, prev + 8))}
                  className="max-md:col-span-6 max-md:min-w-0 max-[350px]:col-span-12"
                />

                <div
                  onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 3)}
                  onWheel={e => {
                    if (e.deltaY < 0) setBpm(prev => Math.min(240, prev + 1));
                    else setBpm(prev => Math.max(40, prev - 1));
                  }}
                  className="stepper cursor-ns-resize max-md:col-span-9 max-md:min-w-0"
                >
                  <span className="stepper-label max-md:hidden">Tempo</span>
                  <div className="stepper-value min-w-[72px] gap-1">
                    {bpm}
                    <span className="font-normal text-t3">BPM</span>
                  </div>
                  <div className="flex items-center px-3 max-md:min-w-0 max-md:flex-1">
                    <input
                      type="range"
                      min="40"
                      max="240"
                      value={bpm}
                      aria-label="Master tempo in beats per minute"
                      onMouseDown={e => e.stopPropagation()}
                      onMouseUp={e => e.currentTarget.blur()}
                      onChange={e => setBpm(parseInt(e.target.value))}
                      style={{ "--fill": `${((bpm - 40) / 200) * 100}%` } as React.CSSProperties}
                      className="w-28 hw-slider max-md:w-full"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoScroll(prev => !prev)}
                  aria-pressed={autoScroll}
                  aria-label="Follow playhead"
                  className="btn max-md:col-span-3 max-md:min-w-0 max-md:px-0"
                  title="Scroll the view to follow the playhead during playback"
                >
                  Follow
                </button>

                <div
                  className="ml-auto hidden items-center gap-4 text-xs text-t3 min-[1280px]:flex"
                  role="note"
                  aria-label="Colour marks use the consonance colours: left bar is motion from the previous step, line is the relation within the chord, glyph is the relation after the last note"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-[3px] rounded-sm bg-[#b5afa0]" aria-hidden="true" />
                    Motion from previous step
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-[2px] w-4 rounded-full bg-[#b5afa0]" aria-hidden="true" />
                    Within chord
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ConsonanceGlyph bucket="consonant" size={11} filled={false} />
                    After last note
                  </span>
                </div>

                {editTool === "chord" && (
                  <Stepper
                    label="Chord level"
                    display={`${chordVolumeDb} dB`}
                    value={chordVolumeDb}
                    min={-6}
                    max={-1}
                    ariaLabel="Chord volume in decibels"
                    decLabel="Decrease chord volume"
                    incLabel="Increase chord volume"
                    onDec={() => setChordVolumeDb(prev => Math.max(-6, prev - 1))}
                    onInc={() => setChordVolumeDb(prev => Math.min(-1, prev + 1))}
                    className="ml-auto max-md:col-span-12 max-md:min-w-0 min-[1280px]:ml-0"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
