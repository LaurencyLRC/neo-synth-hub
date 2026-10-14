import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Info,
  Settings2,
  Eye,
  EyeOff,
  Circle,
  Triangle,
  Diamond,
  LayoutGrid,
  Activity,
  Layers,
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
const BLACK_KEY_PC = new Set([1, 3, 6, 8, 10]);
const isAccidental = (index: number) => BLACK_KEY_PC.has(((index % 12) + 12) % 12);
const getNoteName = (index: number) => NOTE_NAMES[index % 12];

const DEFAULT_KEYS_EXTENDED = [
  "z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m",
  "q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u",
  "i", "8", "o", "9", "p", "0", "[", "-", "]", "=", "\\", "enter",
];

const getChordName = (idx: number[]) => detectChord(idx).name;

const COLORS = {
  neutral: "#e2e5ec",
  perfect: "#38bdf8",
  consonant: "#34d399",
  slightly: "#f59e0b",
  dissonant: "#fb7185",
};

const BUCKET_BADGE_STYLES: Record<Bucket, { bg: string; text: string; border: string; label: string }> = {
  perfect: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
    label: "PERFECT CONSONANCE",
  },
  consonant: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    label: "IMPERFECT CONSONANCE",
  },
  slightly: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "MILD TENSION",
  },
  dissonant: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/30",
    label: "SHARP DISSONANCE",
  },
};

const GLOW_CONFIG = {
  perfect: { outer: 28, inner: 14, icon: 8 },
  consonant: { outer: 22, inner: 10, icon: 6 },
  slightly: { outer: 18, inner: 8, icon: 5 },
  dissonant: { outer: 16, inner: 6, icon: 4 },
  neutral: { outer: 0, inner: 0, icon: 0 },
};

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
  if (redNum === 1 && redDen === 2) return "+½";
  if (redNum === 1 && redDen === 4) return "+¼";
  if (redNum === 3 && redDen === 4) return "+¾";
  if (redNum === 1 && redDen === 3) return "+⅓";
  if (redNum === 2 && redDen === 3) return "+⅔";
  if (redNum === 1 && redDen === 5) return "+⅕";
  if (redNum === 2 && redDen === 5) return "+⅖";
  if (redNum === 3 && redDen === 5) return "+⅗";
  if (redNum === 4 && redDen === 5) return "+⅘";
  if (redNum === 1 && redDen === 8) return "+⅛";
  if (redNum === 7 && redDen === 8) return "+⅞";
  return `+${(netNum / den).toFixed(2)}`;
};

const computeOrbitPeriod = (pitches: number[]) => {
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
  const cappedLcm = Math.min(overallLcm, 30);
  return cappedLcm * 2 * Math.PI;
};

const WaveIcon: React.FC<{ type: OscillatorType }> = ({ type }) => {
  switch (type) {
    case "sine":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0">
          <path
            d="M1 5C2.5 1 4.5 1 7 5C9.5 9 11.5 9 13 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "triangle":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0">
          <path
            d="M1 5L4 1.5L10 8.5L13 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "sawtooth":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0">
          <path
            d="M1 8L7 2V8L13 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "square":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="shrink-0">
          <path
            d="M1 8V2H7V8H13V2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};

export const HarmonicVisualizer: React.FC<{ interval: IntervalInfo }> = ({ interval }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animIdRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const lastKeyRef = useRef<string>("");

  const orbitPoints = React.useMemo(() => {
    if (interval.type !== "chord" || interval.pitches.length < 3) return [];
    const pitches = [...interval.pitches].sort((a, b) => a - b);
    const N = pitches.length;
    const bass = pitches[0];
    const deltas = pitches.map(p => getDeltaFreq(p - bass));
    const period = computeOrbitPeriod(pitches);
    const steps = 600;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= steps; i++) {
      const tau = (i / steps) * period;
      let re = 0;
      let im = 0;
      for (let k = 0; k < N; k++) {
        const angle = deltas[k] * tau;
        re += Math.cos(angle);
        im += Math.sin(angle);
      }
      pts.push({
        x: re / N,
        y: im / N,
      });
    }
    return pts;
  }, [interval]);

  useEffect(() => {
    const key = `${interval.type}-${interval.pitches.join(",")}`;
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key;
      trailRef.current = [];
    }
  }, [interval]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const render = (time: number) => {
      if (!running) return;
      const dt = Math.min((time - lastTime) / 1000, 0.08);
      lastTime = time;

      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width) || 260;
      const height = Math.floor(rect.height) || 120;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const targetW = Math.floor(width * dpr);
      const targetH = Math.floor(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Precision OLED / Scope Background
      ctx.fillStyle = "#06080c";
      ctx.fillRect(0, 0, width, height);

      // Subtle Graticule Grid
      ctx.strokeStyle = "#181d27";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      const gridSize = 20;
      ctx.beginPath();
      for (let x = gridSize; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = gridSize; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      const cx = width / 2;
      const cy = height / 2;

      // Center Reticle Crosshair
      ctx.strokeStyle = "#2a3142";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy);
      ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx, cy + 10);
      ctx.stroke();

      // Corner Reticle Brackets
      const bLen = 5;
      ctx.strokeStyle = "#3b4459";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(5, 5 + bLen); ctx.lineTo(5, 5); ctx.lineTo(5 + bLen, 5);
      ctx.moveTo(width - 5 - bLen, 5); ctx.lineTo(width - 5, 5); ctx.lineTo(width - 5, 5 + bLen);
      ctx.moveTo(5, height - 5 - bLen); ctx.lineTo(5, height - 5); ctx.lineTo(5 + bLen, height - 5);
      ctx.moveTo(width - 5 - bLen, height - 5); ctx.lineTo(width - 5, height - 5); ctx.lineTo(width - 5, height - 5 - bLen);
      ctx.stroke();

      ctx.globalAlpha = 1;

      const mainColor = COLORS[interval.bucket] || "#38bdf8";

      if (interval.type === "interval") {
        const [p1, p2] = interval.pitches;
        const diff = Math.abs(p2 - p1);

        let a = 1,
          b = 1;
        if (interval.ratio) {
          const parts = interval.ratio.split(":").map(Number);
          if (
            parts.length === 2 &&
            !isNaN(parts[0]) &&
            !isNaN(parts[1]) &&
            parts[0] > 0 &&
            parts[1] > 0
          ) {
            a = parts[0];
            b = parts[1];
          }
        }

        const phaseSpeed =
          interval.bucket === "perfect" ? 0.9 : interval.bucket === "consonant" ? 1.2 : 1.6;
        phaseRef.current = (phaseRef.current + phaseSpeed * dt) % (Math.PI * 4);
        const phi = phaseRef.current;

        const rx = (width / 2) * 0.68;
        const ry = (height / 2) * 0.66;

        const usePureRatio = a <= 16 && b <= 16;
        const maxTheta = usePureRatio ? Math.PI * 2 : Math.PI * 8;
        const steps = usePureRatio ? 400 : 800;
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

        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.75;
        ctx.globalAlpha = 0.65;
        ctx.stroke();
        ctx.globalAlpha = 1;

        const beamX = cx + Math.cos(phi) * rx;
        const beamY = cy - Math.sin(0) * ry;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(beamX, beamY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = "#7dd3fc";
        ctx.fillText(`XY LISSAJOUS [${interval.ratio || `${a}:${b}`}]`, 9, 14);

        ctx.fillStyle = "#64748b";
        ctx.textAlign = "right";
        ctx.fillText(`X:${noteName(p1)} · Y:${noteName(p2)}`, width - 9, height - 8);
        ctx.textAlign = "left";
      } else {
        const pitches = [...interval.pitches].sort((x, y) => x - y);
        const N = pitches.length;
        const bass = pitches[0];

        const R = Math.min(width, height) * 0.34;
        const armLength = R / N;

        const deltaFreqs = pitches.map(p => getDeltaFreq(p - bass));

        const animSpeed = 1.6;
        phaseRef.current = (phaseRef.current + animSpeed * dt) % (Math.PI * 200);
        const t = phaseRef.current;

        ctx.strokeStyle = "#1e2636";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - R - 6, cy);
        ctx.lineTo(cx + R + 6, cy);
        ctx.moveTo(cx, cy - R - 6);
        ctx.lineTo(cx, cy + R + 6);
        ctx.stroke();
        ctx.setLineDash([]);

        if (orbitPoints.length > 2) {
          ctx.beginPath();
          for (let i = 0; i < orbitPoints.length; i++) {
            const px = cx + orbitPoints[i].x * R;
            const py = cy - orbitPoints[i].y * R;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 1.6;
          ctx.globalAlpha = 0.4;
          ctx.shadowColor = mainColor;
          ctx.shadowBlur = 6;
          ctx.stroke();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.25;
          ctx.shadowBlur = 0;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        const joints: { x: number; y: number; pitch: number; label: string }[] = [
          { x: cx, y: cy, pitch: bass, label: "0" },
        ];
        let currX = cx;
        let currY = cy;

        for (let i = 0; i < N; i++) {
          const angle = deltaFreqs[i] * t;
          currX += armLength * Math.cos(angle);
          currY -= armLength * Math.sin(angle);
          joints.push({
            x: currX,
            y: currY,
            pitch: pitches[i],
            label:
              noteName(pitches[i]) +
              (i === 0 ? " [BASS]" : ` (${getDeltaFractionLabel(pitches[i] - bass)})`),
          });
        }

        const tip = joints[joints.length - 1];

        const trail = trailRef.current;
        trail.push({ x: tip.x, y: tip.y });
        if (trail.length > 40) trail.shift();

        if (trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const alpha = (i / trail.length) * 0.85;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.strokeStyle = mainColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = mainColor;
            ctx.shadowBlur = 5;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        }

        ctx.strokeStyle = mainColor;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(joints[0].x, joints[0].y);
        ctx.lineTo(joints[1].x, joints[1].y);
        ctx.stroke();

        if (N > 1) {
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(joints[1].x, joints[1].y);
          for (let i = 2; i < joints.length; i++) {
            ctx.lineTo(joints[i].x, joints[i].y);
          }
          ctx.stroke();
        }

        ctx.font = "500 8px 'JetBrains Mono', monospace";
        for (let i = 0; i < joints.length; i++) {
          const j = joints[i];
          const isTip = i === joints.length - 1;
          const isOrigin = i === 0;
          const isBassAnchor = i === 1;

          if (isTip) {
            ctx.shadowColor = mainColor;
            ctx.shadowBlur = 10;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(j.x, j.y, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else if (isBassAnchor) {
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(j.x, j.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = isOrigin ? "#64748b" : mainColor;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }

          if (i > 0 && !isTip) {
            ctx.fillStyle = "#cbd5e1";
            ctx.fillText(noteName(j.pitch), j.x + 3, j.y - 3);
          }
        }

        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(`PHASOR [${N}V]`, 9, 14);

        const mag = Math.hypot(tip.x - cx, tip.y - cy) / R;
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "right";
        ctx.fillText(`|Z|:${mag.toFixed(2)}`, width - 9, 14);

        const deltaStr = pitches
          .map(p => `${noteName(p)}(${getDeltaFractionLabel(p - bass)})`)
          .join(" ");
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "left";
        ctx.fillText(deltaStr, 9, height - 8);
      }

      ctx.restore();
      animIdRef.current = requestAnimationFrame(render);
    };

    animIdRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [interval, orbitPoints]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default function NeonSynthPad() {
  const [waveType, setWaveType] = useState<OscillatorType>("sawtooth");
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
  const [viewMode, setViewMode] = useState<"pad" | "roll">("pad");
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
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
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
      waveType,
      chordVolumeDb,
      numSteps,
      numNotes,
      bpm,
      octave,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
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
        if (WAVES.includes(d.waveType)) setWaveType(d.waveType);
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

  const rowHeight =
    renderedNoteIndices.length <= 18 ? 504 / Math.max(1, renderedNoteIndices.length) : 504 / 18;

  const updateViewport = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const start = Math.max(0, Math.floor((scrollLeft - 48) / stepWidth) - 2);
    const end = Math.min(numSteps, Math.ceil((clientWidth + scrollLeft - 48) / stepWidth) + 2);
    setViewportSteps({ start, end });
  }, [stepWidth, numSteps]);

  useEffect(() => {
    updateViewport();
  }, [viewMode, numSteps, stepWidth, updateViewport]);

  useEffect(() => {
    if (viewMode === "roll") {
      setEditMode(false);
      setBindingIndex(null);
      setPasteAnchor(0);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === "roll" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [viewMode]);

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

  const initAudio = () => {
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
  };

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

      osc.type = waveType;
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
    [disabledNotes, editMode, octave, getFreq, waveType, uiAt]
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
  }, [isPlaying, scheduleNote, stopNote]);

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
              `"${newKey.toUpperCase()}" already bound to ${getNoteName(existingNoteIdx)}`
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
      name: d.name,
      percentage: `${d.ratio} · ${Math.round(d.cents)}¢`,
      consonance: BUCKET_TEXT[d.bucket],
      diff: d.semitones,
      pitches: [p1, p2],
      ratio: d.ratio,
      bucket: d.bucket,
    };
  };

  const interval = getIntervalInfo();

  const handleInteraction = () => {
    setHasInteracted(true);
    initAudio();
  };

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

  const cellHover = hoveredCell && hoveredCell.note >= 0 ? hoveredCell : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090a0d] text-[#e2e5ec] select-none overflow-hidden">
      {/* Studio Power / Audio Engine Initialization Modal */}
      {!hasInteracted && (
        <div
          onClick={handleInteraction}
          className="fixed inset-0 z-[100] bg-[#060709]/90 backdrop-blur-md flex items-center justify-center cursor-pointer p-4"
        >
          <div className="hw-panel rounded-xl max-w-md w-full p-6 border border-[#2a303d] shadow-2xl transition-transform hover:scale-[1.01]">
            <div className="flex items-center justify-between border-b border-[#222631] pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
                <span className="font-mono-tabular text-xs font-semibold tracking-wider text-slate-300">
                  HS-01 // HARMONIC ANALYZER
                </span>
              </div>
              <span className="font-mono-tabular text-[10px] px-2 py-0.5 rounded bg-[#1a1e28] text-slate-400 border border-[#2a303d]">
                STANDBY
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <h1 className="text-lg font-semibold text-white tracking-tight">
                Initialize WebAudio &amp; MIDI Telemetry
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Real-time polyphonic synthesis, Euler gradus consonance heatmapping, and
                bass-demodulated phase scope.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6 font-mono-tabular text-[10px]">
              <div className="hw-recessed p-2.5 rounded">
                <div className="text-slate-500">TUNING</div>
                <div className="text-slate-200 font-semibold mt-0.5">12-TET / JUST</div>
              </div>
              <div className="hw-recessed p-2.5 rounded">
                <div className="text-slate-500">SCOPE</div>
                <div className="text-slate-200 font-semibold mt-0.5">XY + PHASOR</div>
              </div>
              <div className="hw-recessed p-2.5 rounded">
                <div className="text-slate-500">CONTROL</div>
                <div className="text-slate-200 font-semibold mt-0.5">KEY / MIDI</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleInteraction}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs tracking-wider uppercase transition-colors shadow-[0_0_20px_rgba(56,189,248,0.25)]"
            >
              Engage Audio Engine
            </button>
          </div>
        </div>
      )}

      {/* TOP HARDWARE TRANSPORT & SYNTHESIS DECK */}
      <header className="hw-panel border-b border-[#222631] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-30">
        {/* Left: Brand Identity & MIDI / Preset I/O */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pr-3 border-r border-[#222631]">
            <div className="w-2.5 h-2.5 rounded-sm bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
            <div>
              <div className="text-xs font-bold tracking-wider text-white leading-none">HS-01</div>
              <div className="text-[9px] font-mono-tabular text-slate-500 tracking-widest mt-0.5">
                CONSONANCE LAB
              </div>
            </div>
          </div>

          {/* MIDI Status */}
          <div
            className={`hw-recessed px-2.5 py-1.5 rounded flex items-center gap-2 ${
              midiStatus === "connected" ? "border-sky-500/40" : ""
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                midiStatus === "connected"
                  ? "bg-sky-400 shadow-[0_0_6px_#38bdf8]"
                  : midiStatus === "unsupported"
                  ? "bg-slate-700"
                  : "bg-amber-500/60"
              }`}
            />
            <span className="font-mono-tabular text-[10px] font-medium uppercase text-slate-400">
              MIDI: <strong className="text-slate-200">{midiStatus}</strong>
            </span>
          </div>

          {/* Preset Export / Import */}
          <div className="flex items-center gap-1">
            <button
              onClick={exportSequence}
              className="hw-btn px-2.5 py-1 rounded text-[10px] font-mono-tabular font-semibold text-slate-300 hover:text-white"
              title="Export sequence JSON"
            >
              EXP
            </button>
            <label
              className="hw-btn px-2.5 py-1 rounded text-[10px] font-mono-tabular font-semibold text-slate-300 hover:text-white cursor-pointer"
              title="Import sequence JSON"
            >
              IMP
              <input type="file" accept=".json" onChange={importSequence} className="hidden" />
            </label>
          </div>
        </div>

        {/* Center: Transport & Master Clock */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3.5 py-1.5 rounded text-xs font-mono-tabular font-bold tracking-wider flex items-center gap-2 border transition-all ${
              isPlaying
                ? "bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_12px_rgba(251,113,133,0.15)]"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? "bg-rose-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
            {isPlaying ? "STOP" : "PLAY"}
          </button>

          {/* Draggable BPM Module */}
          <div
            onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 3)}
            onWheel={e => {
              if (e.deltaY < 0) setBpm(prev => Math.min(240, prev + 1));
              else setBpm(prev => Math.max(40, prev - 1));
            }}
            className="hw-recessed px-3 py-1 rounded flex items-center gap-2.5 cursor-ns-resize"
            title="Drag vertically or scroll to adjust BPM"
          >
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] font-mono-tabular uppercase text-slate-500">BPM</span>
              <span className="text-xs font-mono-tabular font-bold text-emerald-400 w-7 text-right">
                {bpm}
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="240"
              value={bpm}
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.currentTarget.blur()}
              onChange={e => setBpm(parseInt(e.target.value))}
              className="w-24 studio-fader"
            />
          </div>

          {/* Step Counter Readout */}
          <div className="hw-recessed px-2.5 py-1 rounded font-mono-tabular text-[10px] text-slate-400 hidden sm:flex items-center gap-1.5">
            <span>STEP</span>
            <span className="text-slate-200 font-semibold">
              {String(currentStep + 1).padStart(2, "0")}/{String(numSteps).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Right: Oscillator, Register, Span & Mode Switches */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Oscillator Waveform Selector */}
          <div className="hw-recessed p-0.5 rounded flex items-center">
            {WAVES.map(t => (
              <button
                key={t}
                onClick={() => setWaveType(t)}
                className={`px-2 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold uppercase flex items-center gap-1.5 transition-all ${
                  waveType === t
                    ? "bg-sky-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <WaveIcon type={t} />
                <span className="hidden md:inline">{t === "sawtooth" ? "SAW" : t}</span>
              </button>
            ))}
          </div>

          {/* Octave Selector */}
          <div className="hw-recessed p-0.5 rounded flex items-center font-mono-tabular">
            <button
              onClick={() => setOctave(prev => Math.max(1, prev - 1))}
              className="px-2 py-1 hover:bg-white/5 rounded-sm text-[10px] font-bold text-slate-400 hover:text-white"
            >
              OCT-
            </button>
            <div className="px-2 py-0.5 text-xs font-bold text-sky-400 border-x border-[#1c2029]">
              C{octave}
            </div>
            <button
              onClick={() => setOctave(prev => Math.min(8, prev + 1))}
              className="px-2 py-1 hover:bg-white/5 rounded-sm text-[10px] font-bold text-slate-400 hover:text-white"
            >
              OCT+
            </button>
          </div>

          {/* Span Control */}
          <div
            onMouseDown={startNumericDrag(numNotes, setNumNotes, 1, 60, 15)}
            onWheel={e => {
              if (e.deltaY < 0) setNumNotes(prev => Math.min(60, prev + 1));
              else setNumNotes(prev => Math.max(1, prev - 1));
            }}
            className="hw-recessed p-0.5 rounded flex items-center font-mono-tabular cursor-ns-resize"
            title="Drag vertically or scroll to adjust key span"
          >
            <span className="px-2 text-[9px] uppercase text-slate-500">SPAN</span>
            <button
              onClick={() => setNumNotes(prev => Math.max(1, prev - 1))}
              className="px-2 py-1 hover:bg-white/5 rounded-sm text-xs font-bold text-slate-400 hover:text-white"
            >
              -
            </button>
            <div className="px-2 text-xs font-bold text-slate-200 border-x border-[#1c2029] min-w-[2.2rem] text-center">
              {numNotes}
            </div>
            <button
              onClick={() => setNumNotes(prev => Math.min(60, prev + 1))}
              className="px-2 py-1 hover:bg-white/5 rounded-sm text-xs font-bold text-slate-400 hover:text-white"
            >
              +
            </button>
          </div>

          {/* View Mode Segmented Switch */}
          <div className="hw-recessed p-0.5 rounded flex items-center">
            <button
              onClick={() => setViewMode("pad")}
              className={`px-2.5 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "pad"
                  ? "bg-[#252b39] text-white border border-[#3a4256]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity size={12} />
              <span>KEYBED</span>
            </button>
            <button
              onClick={() => setViewMode("roll")}
              className={`px-2.5 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "roll"
                  ? "bg-[#252b39] text-white border border-[#3a4256]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutGrid size={12} />
              <span>SEQUENCER</span>
            </button>
          </div>

          {/* Hide Disabled & Keymap Edit Buttons */}
          <button
            onClick={() => setHideDisabled(!hideDisabled)}
            className={`hw-btn p-1.5 rounded ${
              hideDisabled ? "!border-sky-500/60 !bg-sky-500/15 text-sky-300" : "text-slate-400"
            }`}
            title={hideDisabled ? "Show Muted Keys" : "Hide Muted Keys"}
          >
            {hideDisabled ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>

          <button
            disabled={viewMode === "roll"}
            onClick={() => {
              setEditMode(!editMode);
              setBindingIndex(null);
            }}
            className={`hw-btn p-1.5 rounded ${
              viewMode === "roll"
                ? "opacity-30 cursor-not-allowed text-slate-600"
                : editMode
                ? "!bg-amber-500 !text-slate-950 !border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                : "text-slate-400"
            }`}
            title="Edit Key Bindings"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </header>

      {/* SECONDARY TELEMETRY BAY & CONTEXTUAL SEQUENCER DECK */}
      <section className="bg-[#0d0f14] border-b border-[#1f232e] px-4 py-3 flex flex-col lg:flex-row items-stretch justify-between gap-4 shrink-0 z-20">
        {/* Left: Harmonic Readout + Oscilloscope Module */}
        <div className="flex flex-col sm:flex-row items-stretch gap-3 flex-1 min-w-0">
          {/* Interval / Chord Telemetry Readout */}
          <div className="hw-recessed rounded-lg p-3 flex flex-col justify-between min-w-[230px] sm:w-64 shrink-0">
            <div className="flex items-center justify-between text-slate-500 border-b border-[#181c26] pb-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <Info size={12} className="text-sky-400" />
                <span className="font-mono-tabular text-[10px] uppercase tracking-wider font-semibold">
                  Harmonic Readout
                </span>
              </div>
              {interval && (
                <span className="font-mono-tabular text-[10px] text-slate-400">
                  {interval.type === "chord" ? `${interval.diff} VOICES` : `${interval.diff} ST`}
                </span>
              )}
            </div>

            {interval ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-lg font-bold text-white tracking-tight truncate">
                    {interval.name}
                  </div>
                  <div className="font-mono-tabular text-xs text-slate-400 shrink-0">
                    {interval.percentage}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`font-mono-tabular text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                      BUCKET_BADGE_STYLES[interval.bucket].bg
                    } ${BUCKET_BADGE_STYLES[interval.bucket].text} ${
                      BUCKET_BADGE_STYLES[interval.bucket].border
                    }`}
                  >
                    {interval.consonance}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {interval.pitches.slice(0, 5).map((p, idx) => (
                      <span
                        key={idx}
                        className="font-mono-tabular text-[9px] px-1.5 py-0.5 rounded bg-[#151922] text-slate-300 border border-[#242938]"
                      >
                        {noteName(p)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-center flex-1 py-2">
                <div className="text-xs text-slate-500 font-medium">Awaiting dyad or chord...</div>
                <div className="text-[10px] font-mono-tabular text-slate-600 mt-0.5">
                  Trigger 2+ notes via keybed, keyboard, or sequencer
                </div>
              </div>
            )}
          </div>

          {/* Embedded Precision Oscilloscope (Lissajous / Demodulated Phasor) */}
          <div className="hw-recessed rounded-lg overflow-hidden flex-1 min-w-[240px] max-w-md h-[112px] relative">
            {interval ? (
              <HarmonicVisualizer interval={interval} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#06080c] text-slate-600 font-mono-tabular text-[10px] gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                  <span>PHASE SCOPE IDLE</span>
                </div>
                <span className="text-[9px] text-slate-700">
                  2 NOTES: XY LISSAJOUS // 3+ NOTES: DEMODULATED PHASOR
                </span>
              </div>
            )}
          </div>

          {/* Consonance Key Legend */}
          <div className="hw-recessed rounded-lg p-3 hidden xl:flex flex-col justify-between w-48 shrink-0">
            <span className="font-mono-tabular text-[9px] uppercase tracking-wider text-slate-500 font-semibold border-b border-[#181c26] pb-1">
              Interval Heatmap
            </span>
            <div className="grid grid-cols-1 gap-1 my-auto font-mono-tabular text-[10px]">
              <div className="flex items-center gap-2 text-sky-400">
                <Diamond size={10} fill="currentColor" />
                <span>Perfect (P1, P4, P5)</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Circle size={10} fill="currentColor" />
                <span>Consonant (M3, m3, 6th)</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400">
                <Triangle size={10} fill="currentColor" />
                <span>Mild (M2, m7)</span>
              </div>
              <div className="flex items-center gap-2 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block mx-0.5" />
                <span>Dissonant (m2, TT, M7)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Contextual Sequencer Toolbar OR Keybed Status */}
        {viewMode === "roll" ? (
          <div className="hw-recessed rounded-lg p-2.5 flex flex-wrap items-center gap-2.5 self-center">
            {/* Tool Selection */}
            <div className="flex items-center bg-[#0f1219] p-0.5 rounded border border-[#1e2330]">
              <button
                onClick={() => setEditTool("draw")}
                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold flex items-center gap-1.5 transition-all ${
                  editTool === "draw"
                    ? "bg-sky-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Draw Note Tool"
              >
                <Activity size={12} />
                <span>DRAW</span>
              </button>
              <button
                onClick={() => setEditTool("chord")}
                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold flex items-center gap-1.5 transition-all ${
                  editTool === "chord"
                    ? "bg-amber-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Sub-Velocity Chord Tool"
              >
                <Layers size={12} />
                <span>CHORD</span>
              </button>
              <button
                onClick={() => setEditTool("select")}
                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono-tabular font-semibold flex items-center gap-1.5 transition-all ${
                  editTool === "select"
                    ? "bg-sky-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Marquee Select Tool"
              >
                <LayoutGrid size={12} />
                <span>SELECT</span>
              </button>
            </div>

            {/* Chord Tool Velocity Attenuation */}
            {editTool === "chord" && (
              <div className="flex items-center gap-1.5 bg-[#0f1219] px-2 py-1 rounded border border-amber-500/30 font-mono-tabular">
                <span className="text-[9px] uppercase text-amber-400/80">VEL</span>
                <button
                  onClick={() => setChordVolumeDb(prev => Math.max(-6, prev - 1))}
                  className="w-4 h-4 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  -
                </button>
                <span className="text-[10px] font-bold text-amber-400 w-8 text-center">
                  {chordVolumeDb}dB
                </span>
                <button
                  onClick={() => setChordVolumeDb(prev => Math.min(-1, prev + 1))}
                  className="w-4 h-4 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  +
                </button>
              </div>
            )}

            {/* Clipboard Controls */}
            <div className="flex items-center gap-1 border-l border-[#1e2330] pl-2.5 font-mono-tabular">
              <button
                onClick={copySelection}
                disabled={selectedKeys.size === 0}
                className={`hw-btn px-2 py-1 rounded text-[10px] font-semibold ${
                  selectedKeys.size > 0 ? "text-sky-400" : "text-slate-600 opacity-50"
                }`}
              >
                COPY
              </button>
              <button
                onClick={cutSelection}
                disabled={selectedKeys.size === 0}
                className={`hw-btn px-2 py-1 rounded text-[10px] font-semibold ${
                  selectedKeys.size > 0 ? "text-sky-400" : "text-slate-600 opacity-50"
                }`}
              >
                CUT
              </button>
              <button
                onClick={() => pasteSelection(false)}
                disabled={!clipboard}
                className={`hw-btn px-2 py-1 rounded text-[10px] font-semibold ${
                  clipboard ? "text-emerald-400" : "text-slate-600 opacity-50"
                }`}
              >
                PASTE{clipboard ? ` (${clipboard.length})` : ""}
              </button>
              <button
                onClick={deleteSelectedNotes}
                disabled={selectedKeys.size === 0}
                className={`hw-btn px-2 py-1 rounded text-[10px] font-semibold ${
                  selectedKeys.size > 0 ? "text-rose-400" : "text-slate-600 opacity-50"
                }`}
              >
                DEL
              </button>
            </div>

            {/* Steps & Zoom */}
            <div className="flex items-center gap-2 border-l border-[#1e2330] pl-2.5 font-mono-tabular">
              <div
                onMouseDown={startNumericDrag(numSteps, setNumSteps, 4, 1024, 10)}
                onWheel={e => {
                  if (e.deltaY < 0) setNumSteps(prev => Math.min(1024, prev + 4));
                  else setNumSteps(prev => Math.max(4, prev - 4));
                }}
                className="flex items-center bg-[#0f1219] rounded border border-[#1e2330] p-0.5 cursor-ns-resize"
                title="Drag or scroll to adjust sequence length"
              >
                <span className="px-1.5 text-[9px] text-slate-500">STEPS</span>
                <button
                  onClick={() => setNumSteps(prev => Math.max(4, prev - 4))}
                  className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  -
                </button>
                <div className="px-1.5 text-[10px] font-bold text-sky-400">{numSteps}</div>
                <button
                  onClick={() => setNumSteps(prev => Math.min(1024, prev + 4))}
                  className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  +
                </button>
              </div>

              <div className="flex items-center bg-[#0f1219] rounded border border-[#1e2330] p-0.5">
                <button
                  onClick={() => setStepWidth(prev => Math.max(12, prev - 4))}
                  className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  -
                </button>
                <span className="px-1.5 text-[9px] uppercase text-slate-500">ZOOM</span>
                <button
                  onClick={() => setStepWidth(prev => Math.min(64, prev + 4))}
                  className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] font-bold text-slate-300"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hw-recessed rounded-lg px-4 py-2.5 flex items-center gap-4 self-center font-mono-tabular">
            <div>
              <div className="text-[9px] uppercase text-slate-500">ACTIVE VOICES</div>
              <div className="text-xs font-bold text-slate-200 mt-0.5">
                {activeNotes.size} <span className="text-slate-500 font-normal">HELD</span>
              </div>
            </div>
            <div className="h-6 w-[1px] bg-[#1c2029]" />
            <div>
              <div className="text-[9px] uppercase text-slate-500">REFERENCE PIVOT</div>
              <div className="text-xs font-bold text-sky-400 mt-0.5">
                {pivotNote !== null
                  ? `${getNoteName(pivotNote)}${octave + Math.floor(pivotNote / 12)}`
                  : "NONE"}
              </div>
            </div>
            <div className="h-6 w-[1px] bg-[#1c2029]" />
            <div className="text-[10px] text-slate-400 max-w-[200px] leading-tight">
              {editMode ? (
                <span className="text-amber-400 font-medium">
                  KEYMAP EDIT: Click a key to bind shortcut; click again to mute/unmute.
                </span>
              ) : (
                <span>Hold keys or use computer keyboard to preview harmonic intervals.</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* MAIN INSTRUMENT WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden p-4 bg-[#090a0d]">
        {viewMode === "pad" ? (
          /* STUDIO HARDWARE KEYBED VIEW */
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            <div className="hw-panel rounded-xl p-4 flex-1 flex flex-col justify-between max-h-[540px] overflow-hidden">
              {/* Top Keybed Bezel Info */}
              <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-500 pb-3 mb-2 border-b border-[#1e222d] shrink-0">
                <span>
                  CHROMATIC ISOMORPHIC KEYBED // RANGE: C{octave} –{" "}
                  {getNoteName(numNotes - 1)}
                  {octave + Math.floor((numNotes - 1) / 12)}
                </span>
                <span>
                  {editMode ? "MODE: KEYBINDING & MUTE CONFIGURATION" : "MODE: LIVE PERFORMANCE"}
                </span>
              </div>

              {/* Tactile Keys Container */}
              <div className="flex-1 flex items-stretch gap-1.5 overflow-x-auto md:overflow-x-visible py-1 no-scrollbar">
                {renderedNoteIndices.map(i => {
                  const isDisabled = disabledNotes.has(i);
                  const isActive = activeNotes.has(i);
                  const nName = getNoteName(i);
                  const noteOctave = octave + Math.floor(i / 12);
                  const accidental = isAccidental(i);
                  const isOctaveStart = i % 12 === 0;
                  const isBinding = bindingIndex === i;
                  const activeIndices =
                    activeNotes.size > 0
                      ? Array.from(activeNotes)
                      : pivotNote !== null
                      ? [pivotNote]
                      : [];
                  const type = getHarmonicTypeForSet(i, activeIndices);
                  const displayColor = COLORS[type as keyof typeof COLORS] || COLORS.neutral;
                  const glow = GLOW_CONFIG[type as keyof typeof GLOW_CONFIG] || GLOW_CONFIG.neutral;
                  const hasRelation = activeIndices.length > 0 && type !== "neutral" && !isDisabled;

                  const renderShape = () => {
                    if (!hasRelation) return null;
                    const baseIconSize = Math.max(10, Math.min(18, 340 / numNotes));

                    const iconProps = {
                      size: baseIconSize,
                      className: "transition-all duration-200",
                      fill: "currentColor",
                      style: {
                        filter: `drop-shadow(0 0 ${glow.icon}px currentColor)`,
                      },
                    };

                    switch (type) {
                      case "perfect":
                        return <Diamond {...iconProps} className="text-sky-400" />;
                      case "consonant":
                        return <Circle {...iconProps} className="text-emerald-400" />;
                      case "slightly":
                        return <Triangle {...iconProps} className="text-amber-400" />;
                      case "dissonant":
                        return (
                          <div
                            style={{
                              width: `${Math.max(6, baseIconSize * 0.55)}px`,
                              height: `${Math.max(6, baseIconSize * 0.55)}px`,
                              boxShadow: `0 0 ${glow.icon * 1.5}px #fb7185`,
                            }}
                            className="bg-rose-400 rounded-full"
                          />
                        );
                      default:
                        return null;
                    }
                  };

                  return (
                    <div
                      key={i}
                      onMouseDown={() => !editMode && startNote(i, "mouse")}
                      onMouseEnter={e => !editMode && e.buttons === 1 && startNote(i, "mouse")}
                      onMouseUp={() => !editMode && stopNote(i, "mouse")}
                      onMouseLeave={() => !editMode && stopNote(i, "mouse")}
                      onTouchStart={e => {
                        e.preventDefault();
                        if (!editMode) startNote(i, "touch");
                      }}
                      onTouchEnd={e => {
                        e.preventDefault();
                        if (!editMode) stopNote(i, "touch");
                      }}
                      onClick={() => {
                        if (editMode) {
                          if (bindingIndex === i) toggleNoteDisabled(i);
                          else setBindingIndex(i);
                        }
                      }}
                      style={{
                        background: isDisabled
                          ? "#0b0d12"
                          : isActive
                          ? `linear-gradient(180deg, ${displayColor}38 0%, ${displayColor}18 100%)`
                          : accidental
                          ? "linear-gradient(180deg, #12151c 0%, #0d0f14 100%)"
                          : "linear-gradient(180deg, #1b1f2a 0%, #141720 100%)",
                        borderColor: isBinding
                          ? "#f59e0b"
                          : isActive
                          ? displayColor
                          : hasRelation
                          ? `${displayColor}66`
                          : isOctaveStart
                          ? "#333a4d"
                          : "#222734",
                        boxShadow: isActive
                          ? `0 0 ${glow.outer}px ${displayColor}40, inset 0 0 ${glow.inner}px ${displayColor}35`
                          : isBinding
                          ? "0 0 18px rgba(245, 158, 11, 0.45)"
                          : "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 6px rgba(0, 0, 0, 0.5)",
                        opacity: isDisabled ? 0.3 : 1,
                      }}
                      className={`relative rounded-md border flex flex-col justify-between items-center py-3 px-1 transition-all duration-150 flex-shrink-0 w-12 md:w-auto md:flex-1 md:min-w-0 overflow-hidden ${
                        isActive ? "translate-y-[1px]" : ""
                      } ${isBinding ? "z-10 ring-2 ring-amber-400/50" : ""} ${
                        editMode ? "cursor-pointer" : "cursor-pointer"
                      }`}
                    >
                      {/* Top LED Light Pipe Bar */}
                      <div className="w-full px-1.5 flex flex-col items-center gap-2 z-10">
                        <div
                          style={{
                            backgroundColor: isDisabled
                              ? "#1e222d"
                              : isActive || hasRelation
                              ? displayColor
                              : accidental
                              ? "#252a38"
                              : "#32384a",
                            boxShadow:
                              (isActive || hasRelation) && !isDisabled
                                ? `0 0 10px ${displayColor}`
                                : "none",
                          }}
                          className="w-full h-1.5 rounded-full transition-all duration-200"
                        />

                        {/* Accidental / Octave Badge */}
                        <span className="font-mono-tabular text-[9px] text-slate-500">
                          {isOctaveStart ? `OCT ${noteOctave}` : accidental ? "♯" : "·"}
                        </span>
                      </div>

                      {/* Center Harmonic Geometry Indicator */}
                      <div className="my-auto flex items-center justify-center z-10 h-8">
                        {renderShape()}
                      </div>

                      {/* Bottom Note Label & Physical Keycap Badge */}
                      <div className="w-full flex flex-col items-center gap-1.5 z-10 px-0.5">
                        <span
                          className={`font-mono-tabular text-xs font-bold tracking-tight ${
                            isActive
                              ? "text-white"
                              : isDisabled
                              ? "text-slate-600"
                              : accidental
                              ? "text-slate-300"
                              : "text-slate-100"
                          }`}
                        >
                          {nName}
                          <span className="text-[9px] text-slate-500 font-normal ml-0.5">
                            {noteOctave}
                          </span>
                        </span>

                        {isBinding ? (
                          <div className="w-full py-1 px-1 rounded bg-amber-500/20 border border-amber-500/50 flex flex-col items-center">
                            <span
                              className={`font-mono-tabular text-[8px] font-bold uppercase text-center ${
                                bindingError ? "text-rose-400" : "text-amber-300 animate-pulse"
                              }`}
                            >
                              {bindingError || "BIND KEY"}
                            </span>
                            <span className="font-mono-tabular text-[8px] text-slate-300 uppercase truncate max-w-full">
                              {keyBindings[i]?.join(" ")}
                            </span>
                          </div>
                        ) : (
                          <div
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-semibold uppercase tracking-wider border max-w-full truncate ${
                              isActive
                                ? "bg-black/40 text-white border-white/20"
                                : isDisabled
                                ? "bg-[#0d0f14] text-slate-700 border-[#181b24]"
                                : "bg-[#0c0e14] text-slate-400 border-[#222736]"
                            }`}
                          >
                            {isDisabled ? "MUTE" : keyBindings[i]?.join(" ").toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* DAW PIANO ROLL SEQUENCER VIEW */
          <div className="relative w-full flex-1 hw-panel rounded-xl overflow-hidden flex flex-col">
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className="flex-1 overflow-auto bg-[#0b0d12]"
                ref={scrollRef}
                onScroll={updateViewport}
                onMouseLeave={() => setHoveredCell(null)}
                onMouseMove={e => {
                  if (!scrollRef.current) return;
                  const rect = scrollRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left + scrollRef.current.scrollLeft - 48;
                  const y = e.clientY - rect.top;

                  const scrollY = scrollRef.current.scrollTop;
                  const totalContentHeight = renderedNoteIndices.length * rowHeight;
                  const pianoRollTop = 32;

                  const step = Math.floor(x / stepWidth);
                  const renderedIdx = Math.floor(
                    (totalContentHeight - (y + scrollY - pianoRollTop)) / rowHeight
                  );
                  const note = renderedNoteIndices[renderedIdx];

                  if (
                    step >= 0 &&
                    step < numSteps &&
                    renderedIdx >= 0 &&
                    renderedIdx < renderedNoteIndices.length
                  ) {
                    liveHoverRef.current = { step, note };
                  }

                  if (isSelecting) {
                    setSelectionRect(prev => (prev ? { ...prev, s2: step, n2: renderedIdx } : null));
                  } else if (isDragging && dragStartPos && note !== undefined) {
                    setDragOffset({ ds: step - dragStartPos.s, dn: note - dragStartPos.n });
                  }
                }}
              >
                <div
                  className="flex flex-col-reverse min-w-max min-h-full relative"
                  style={{ width: `${numSteps * stepWidth + 48}px` }}
                >
                  {/* Visual Marquee Rectangle */}
                  {selectionRect && (
                    <div
                      style={{
                        left: `${Math.min(selectionRect.s1, selectionRect.s2) * stepWidth + 48}px`,
                        bottom: `${Math.min(selectionRect.n1, selectionRect.n2) * rowHeight}px`,
                        width: `${(Math.abs(selectionRect.s2 - selectionRect.s1) + 1) * stepWidth}px`,
                        height: `${(Math.abs(selectionRect.n2 - selectionRect.n1) + 1) * rowHeight}px`,
                        zIndex: 40,
                      }}
                      className="absolute bg-sky-500/15 border border-sky-400/60 pointer-events-none rounded-sm"
                    />
                  )}

                  {Array.from({ length: renderedNoteIndices.length }).map((_, renderedIdx) => {
                    const noteIdx = renderedNoteIndices[renderedIdx];
                    const isDisabled = disabledNotes.has(noteIdx);
                    const accidental = isAccidental(noteIdx);
                    const isOctaveStart = noteIdx % 12 === 0;
                    const noteOctave = octave + Math.floor(noteIdx / 12);

                    return (
                      <div
                        key={noteIdx}
                        style={{ height: `${rowHeight}px` }}
                        className={`flex border-b ${
                          isOctaveStart ? "border-b-[#282e3d]" : "border-b-[#151922]"
                        } group shrink-0 ${
                          accidental ? "bg-[#090b10]" : "bg-[#0e1117]"
                        } ${isDisabled ? "opacity-25 grayscale pointer-events-none" : ""}`}
                      >
                        {/* Piano Key Label Column (48px / w-12) */}
                        <div
                          className={`sticky left-0 w-12 h-full flex items-center justify-between px-2 font-mono-tabular text-[10px] font-semibold border-r border-[#232836] z-50 shrink-0 ${
                            accidental
                              ? "bg-[#10131a] text-slate-400 group-hover:text-white"
                              : "bg-[#181c26] text-slate-200 group-hover:text-white"
                          }`}
                        >
                          <span>{getNoteName(noteIdx)}</span>
                          <span className="text-[8px] text-slate-500">{noteOctave}</span>
                        </div>

                        <div
                          style={{ width: `${Math.min(viewportSteps.start, numSteps) * stepWidth}px` }}
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
                            const isBeatEnd = (stepIdx + 1) % 4 === 0;
                            const isBarEnd = (stepIdx + 1) % 16 === 0;
                            const isHovered =
                              !isTouchDevice &&
                              cellHover?.step === stepIdx &&
                              cellHover?.note === noteIdx;

                            const prevRealStep = stepMetadata.prevGlobalSteps[stepIdx];
                            let displayHeaderColor = null;
                            let isHeaderIntercepted = false;

                            let propagationHintColor = null;
                            let isPropagationStart = false;
                            if (
                              stepMetadata.absoluteLastStep !== -1 &&
                              stepIdx > stepMetadata.absoluteLastStep
                            ) {
                              const lastBass =
                                stepMetadata.bassAtStep[stepMetadata.absoluteLastStep];
                              const type = getConsonanceType(noteIdx - lastBass);
                              propagationHintColor = COLORS[type as keyof typeof COLORS];
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
                                const trueDistToHover = distToHover === 0 ? numSteps : distToHover;

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
                                style={{ width: `${stepWidth}px` }}
                                className={`flex-shrink-0 border-r ${
                                  isBarEnd
                                    ? "border-r-[#2d3548]"
                                    : isBeatEnd
                                    ? "border-r-[#1f2433]"
                                    : "border-r-[#141821]"
                                } cursor-pointer relative overflow-visible ${
                                  isCurrent
                                    ? "bg-sky-500/[0.06]"
                                    : pasteAnchor === stepIdx
                                    ? "bg-amber-500/[0.04]"
                                    : ""
                                } ${!isTouchDevice ? "hover:bg-white/[0.06]" : ""}`}
                              >
                                {pasteAnchor === stepIdx && (
                                  <div className="absolute inset-y-0 left-0 w-[1px] bg-amber-400/40 pointer-events-none z-0" />
                                )}
                                {propagationHintColor && (
                                  <div
                                    style={{
                                      background: isPropagationStart
                                        ? `linear-gradient(to right, ${propagationHintColor}44, ${propagationHintColor})`
                                        : propagationHintColor,
                                      opacity: 0.1,
                                      zIndex: 1,
                                      left: isPropagationStart ? "3px" : "-1px",
                                      borderTopLeftRadius: isPropagationStart ? "2px" : "0px",
                                      borderBottomLeftRadius: isPropagationStart ? "2px" : "0px",
                                    }}
                                    className="absolute inset-y-1 right-0 pointer-events-none transition-colors duration-300"
                                  />
                                )}
                                {isDragging &&
                                  dragDelta &&
                                  isSelected &&
                                  (() => {
                                    const t = renderedNoteIndices.indexOf(noteIdx + dragDelta.dn);
                                    return t < 0 ? null : (
                                      <div
                                        style={{
                                          backgroundColor: "#38bdf8",
                                          opacity: 0.35,
                                          left: `${dragDelta.ds * stepWidth}px`,
                                          bottom: `${(t - renderedIdx) * rowHeight}px`,
                                          width: `${stepWidth}px`,
                                          height: `${rowHeight - 2}px`,
                                          zIndex: 40,
                                        }}
                                        className="absolute pointer-events-none rounded-sm ring-1 ring-sky-300"
                                      />
                                    );
                                  })()}

                                {isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: isSelected
                                          ? "#475569"
                                          : isChord
                                          ? "#161922"
                                          : "#262c3a",
                                        left: hasPrev ? "-1px" : "2px",
                                        right: hasNext ? "-1px" : "3px",
                                        zIndex: 5,
                                        borderTopLeftRadius: hasPrev ? 0 : "3px",
                                        borderBottomLeftRadius: hasPrev ? 0 : "3px",
                                        borderTopRightRadius: hasNext ? 0 : "3px",
                                        borderBottomRightRadius: hasNext ? 0 : "3px",
                                        boxShadow: isSelected
                                          ? "0 0 12px rgba(56,189,248,0.35)"
                                          : "0 1px 3px rgba(0,0,0,0.5)",
                                        border: isChord
                                          ? "1px dashed rgba(245,158,11,0.35)"
                                          : "1px solid rgba(255,255,255,0.08)",
                                        opacity: isChord ? 0.78 : 1,
                                      }}
                                      className={`absolute top-1 bottom-1 ${
                                        isSelected ? "ring-1 ring-sky-400" : ""
                                      }`}
                                    />
                                    <div
                                      style={{
                                        backgroundColor: noteInternalLineColor || "transparent",
                                        height: isChord ? "1.5px" : "3px",
                                        left: hasPrev ? "-1px" : "6px",
                                        right: hasNext ? "-1px" : "7px",
                                        top: "50%",
                                        zIndex: 10,
                                        boxShadow:
                                          noteInternalLineColor && !isChord
                                            ? `0 0 8px ${noteInternalLineColor}`
                                            : "none",
                                        opacity: isChord ? 0.5 : 1,
                                      }}
                                      className="absolute pointer-events-none transition-colors duration-150 -translate-y-1/2 rounded-full"
                                    />
                                    {displayHeaderColor && (
                                      <div
                                        style={{
                                          backgroundColor: displayHeaderColor,
                                          boxShadow:
                                            isHeaderIntercepted || !isChord
                                              ? `0 0 12px ${displayHeaderColor}`
                                              : "none",
                                          width: isHeaderIntercepted ? "6px" : "4px",
                                          left: isHeaderIntercepted ? "-1px" : "2px",
                                          zIndex: 10,
                                          opacity: isChord ? 0.6 : 1,
                                        }}
                                        className="absolute top-1 bottom-1 rounded-l-sm"
                                      >
                                        {stepIdx === stepMetadata.firstStepWithNotes && (
                                          <div className="absolute inset-y-0 left-0 w-[2px] bg-white shadow-[0_0_6px_#fff]" />
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {!isTouchDevice && editTool === "draw" && isHovered && !isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: "#151924",
                                        left: "2px",
                                        right: "3px",
                                        borderRadius: "3px",
                                        zIndex: 5,
                                      }}
                                      className="absolute top-1 bottom-1 border border-white/10"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: ghostLineColor || "transparent",
                                        height: "3px",
                                        left: "6px",
                                        right: "7px",
                                        top: "50%",
                                        zIndex: 10,
                                        boxShadow: ghostLineColor
                                          ? `0 0 8px ${ghostLineColor}`
                                          : "none",
                                      }}
                                      className="absolute pointer-events-none -translate-y-1/2 rounded-full"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: ghostHeaderColor || "transparent",
                                        boxShadow: ghostHeaderColor
                                          ? `0 0 10px ${ghostHeaderColor}`
                                          : "none",
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

                  {/* Piano Roll Timeline Ruler Header (32px / h-8) */}
                  <div className="h-8 border-b border-[#252a38] flex bg-[#10131a]/95 backdrop-blur-sm z-[100] sticky top-0 shrink-0 font-mono-tabular">
                    <div className="w-12 border-r border-[#252a38] shrink-0 bg-[#10131a] sticky left-0 z-[110] flex items-center justify-center text-[9px] text-slate-500">
                      PITCH
                    </div>
                    {Array.from({ length: numSteps }).map((_, i) => {
                      const isBeatStart = i % 4 === 0;
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
                          style={{ width: `${stepWidth}px` }}
                          className={`flex-shrink-0 h-full flex items-center justify-center text-[10px] font-semibold border-r border-[#1c202c] transition-colors cursor-pointer relative ${
                            currentStep === i
                              ? "bg-sky-500/20 text-sky-300"
                              : pasteAnchor === i
                              ? "bg-amber-500/15 text-amber-300"
                              : hoveredCell?.step === i
                              ? "text-slate-200 bg-white/5"
                              : isBeatStart
                              ? "text-slate-300 bg-[#141822]"
                              : "text-slate-500"
                          }`}
                        >
                          {i + 1}
                          {currentStep === i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
                          )}
                          {pasteAnchor === i && currentStep !== i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}