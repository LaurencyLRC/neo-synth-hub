import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Settings2,
  Eye,
  EyeOff,
  Circle,
  Triangle,
  Diamond,
  LayoutGrid,
  Activity,
  Layers,
  Play,
  Square,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  Download,
  Upload,
  Radio,
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

const getChordName = (idx: number[]) => detectChord(idx).name;

const COLORS = {
  neutral: "#e2e8f0",
  perfect: "#22d3ee",
  consonant: "#10b981",
  slightly: "#fbbf24",
  dissonant: "#f43f5e",
};

const GLOW_CONFIG = {
  perfect: { outer: 48, inner: 24, icon: 10 },
  consonant: { outer: 36, inner: 18, icon: 8 },
  slightly: { outer: 24, inner: 12, icon: 5 },
  dissonant: { outer: 18, inner: 10, icon: 4 },
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

const WaveGlyph: React.FC<{ type: OscillatorType }> = ({ type }) => {
  switch (type) {
    case "sine":
      return (
        <svg width="11" height="8" viewBox="0 0 12 8" fill="none" className="shrink-0">
          <path
            d="M1 4C2.2 1 3.8 1 6 4C8.2 7 9.8 7 11 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case "triangle":
      return (
        <svg width="11" height="8" viewBox="0 0 12 8" fill="none" className="shrink-0">
          <path
            d="M1 4L3.5 1.2L8.5 6.8L11 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "sawtooth":
      return (
        <svg width="11" height="8" viewBox="0 0 12 8" fill="none" className="shrink-0">
          <path
            d="M1 6.5L6 1.5V6.5L11 1.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "square":
      return (
        <svg width="11" height="8" viewBox="0 0 12 8" fill="none" className="shrink-0">
          <path
            d="M1 6V2H6V6H11V2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
};

export const HarmonicVisualizer: React.FC<{ interval: IntervalInfo | null }> = ({ interval }) => {
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
    // Scale sample resolution with revolution count so 30-revolution spirographs stay silky smooth
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const drawOsdText = (
      text: string,
      x: number,
      y: number,
      color: string,
      align: "left" | "right" = "left"
    ) => {
      ctx.save();
      ctx.font = "600 8.5px 'JetBrains Mono', monospace";
      ctx.textAlign = align;
      ctx.strokeStyle = "rgba(3, 6, 12, 0.94)";
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const render = (time: number) => {
      if (!running) return;
      const dt = Math.min((time - lastTime) / 1000, 0.08);
      lastTime = time;

      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width) || 320;
      const height = Math.floor(rect.height) || 180;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const targetW = Math.floor(width * dpr);
      const targetH = Math.floor(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1. Deep CRT Phosphor Well
      ctx.fillStyle = "#03060c";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Subtle CRT radial depth
      const grad = ctx.createRadialGradient(
        cx,
        cy,
        8,
        cx,
        cy,
        Math.max(width, height) * 0.72
      );
      grad.addColorStop(0, "rgba(15, 23, 42, 0.4)");
      grad.addColorStop(0.6, "rgba(6, 11, 22, 0.72)");
      grad.addColorStop(1, "rgba(2, 4, 10, 0.96)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 2. Precision Calibrated Graticule Grid (centered on cx, cy)
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.25;
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

      // Corner reticle brackets
      const bLen = 6;
      ctx.strokeStyle = "#475569";
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(5, 5 + bLen); ctx.lineTo(5, 5); ctx.lineTo(5 + bLen, 5);
      ctx.moveTo(width - 5 - bLen, 5); ctx.lineTo(width - 5, 5); ctx.lineTo(width - 5, 5 + bLen);
      ctx.moveTo(5, height - 5 - bLen); ctx.lineTo(5, height - 5); ctx.lineTo(5 + bLen, height - 5);
      ctx.moveTo(width - 5 - bLen, height - 5); ctx.lineTo(width - 5, height - 5); ctx.lineTo(width - 5, height - 5 - bLen);
      ctx.stroke();

      ctx.globalAlpha = 1;

      if (!interval) {
        // Center crosshair
        ctx.strokeStyle = "#334155";
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy);
        ctx.lineTo(cx + 16, cy);
        ctx.moveTo(cx, cy - 16);
        ctx.lineTo(cx, cy + 16);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Standby carrier trace
        phaseRef.current = (phaseRef.current + 1.4 * dt) % (Math.PI * 2);
        ctx.beginPath();
        for (let x = 18; x <= width - 18; x++) {
          const norm = (x - 18) / (width - 36);
          const env = Math.sin(norm * Math.PI);
          const y = cy + Math.sin(norm * Math.PI * 4 - phaseRef.current) * 11 * env;
          if (x === 18) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        drawOsdText("SCOPE // STANDBY", 10, 15, "#64748b", "left");
        drawOsdText("AWAITING DYAD / CHORD", width - 10, height - 8, "#475569", "right");

        ctx.restore();
        animIdRef.current = requestAnimationFrame(render);
        return;
      }

      const mainColor = COLORS[interval.bucket] || "#22d3ee";

      if (interval.type === "interval") {
        // --- LISSAJOUS PREVIEW (2 NOTES) ---
        ctx.strokeStyle = "#334155";
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();
        ctx.globalAlpha = 1;

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

        const rx = Math.min(width * 0.42, (height / 2) * 1.45);
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

        // Outer phosphor bloom pass
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = mainColor;
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = 4.0;
        ctx.stroke();

        // Saturated phosphor core pass
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Hot white filament pass
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.75;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;

        const beamX = cx + Math.cos(phi) * rx;
        const beamY = cy - Math.sin(0) * ry;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(beamX, beamY, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        drawOsdText(`LISSAJOUS [${interval.ratio || `${a}:${b}`}]`, 10, 15, "#67e8f9", "left");
        drawOsdText(
          `X:${noteName(p1)} · Y:${noteName(p2)}`,
          width - 10,
          height - 8,
          "#cbd5e1",
          "right"
        );
      } else {
        // --- BASS-DEMODULATED VECTOR SUPERPOSITION PREVIEW (3+ NOTES) ---
        const pitches = [...interval.pitches].sort((x, y) => x - y);
        const N = pitches.length;
        const bass = pitches[0];

        const { pts: orbitPoints, minX, maxX, minY, maxY, revolutions } = orbitData;
        const spanX = Math.max(0.75, maxX - minX);
        const spanY = Math.max(0.75, maxY - minY);

        // Because OSD text sits in the left/right side wings, the circle can use nearly 100% of vertical height
        const availW = Math.max(140, width - 36);
        const availH = Math.max(100, height - 14);

        const R = Math.min(availW / spanX, availH / spanY, height * 0.86);
        const ox = cx - ((minX + maxX) / 2) * R;
        const oy = cy + ((minY + maxY) / 2) * R;

        const armLength = R / N;
        const deltaFreqs = pitches.map(p => getDeltaFreq(p - bass));

        const animSpeed = 1.05;
        phaseRef.current = (phaseRef.current + animSpeed * dt) % (Math.PI * 200);
        const t = phaseRef.current;

        // 1. Calibrated Origin Crosshair & Unit Reference Circle (|Z| = 1.0)
        ctx.strokeStyle = "rgba(51, 65, 85, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, oy);
        ctx.lineTo(width, oy);
        ctx.moveTo(ox, 0);
        ctx.lineTo(ox, height);
        ctx.stroke();

        // Half-amplitude reference ring (|Z| = 0.5)
        ctx.strokeStyle = "rgba(51, 65, 85, 0.3)";
        ctx.beginPath();
        ctx.arc(ox, oy, R * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Unit Circle (|Z| = 1.0)
        ctx.strokeStyle = "rgba(71, 85, 105, 0.55)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(ox, oy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (ox + R + 30 < width) {
          drawOsdText("|Z|=1", ox + R + 4, oy - 3, "#64748b", "left");
        }

        // 2. Complexity-Normalized 30-Revolution Spirograph Manifold
        // Attenuate stroke width and alpha inversely with revolution density so 30 loops stay razor-sharp
        if (orbitPoints.length > 2) {
          const densityScale = 1 / Math.pow(Math.max(1, revolutions), 0.42);
          const glowWidth = Math.max(1.1, 2.8 * densityScale);
          const glowAlpha = Math.max(0.06, 0.25 * densityScale);
          const coreWidth = Math.max(0.65, 1.65 * densityScale);
          const coreAlpha = Math.max(0.24, 0.82 * densityScale);

          ctx.beginPath();
          for (let i = 0; i < orbitPoints.length; i++) {
            const px = ox + orbitPoints[i].x * R;
            const py = oy - orbitPoints[i].y * R;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          // Soft outer phosphor aura (suppressed on high-density 30-rev chords to prevent blobbing)
          if (revolutions <= 12) {
            ctx.shadowColor = mainColor;
            ctx.shadowBlur = 8;
          }
          ctx.strokeStyle = mainColor;
          ctx.lineWidth = glowWidth;
          ctx.globalAlpha = glowAlpha;
          ctx.stroke();

          // Crisp hairline spirograph trace
          ctx.shadowBlur = 0;
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

        // 4. Moving Phosphor Comet Tail
        const trail = trailRef.current;
        trail.push({ x: tip.x, y: tip.y });
        if (trail.length > 34) trail.shift();

        if (trail.length > 1) {
          for (let i = 1; i < trail.length; i++) {
            const alpha = (i / trail.length) * 0.9;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.strokeStyle = "#ffffff";
            ctx.globalAlpha = alpha * 0.85;
            ctx.lineWidth = 2.0;
            ctx.shadowColor = mainColor;
            ctx.shadowBlur = 6;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        }

        // 5. Resultant Vector Ray (Origin -> Tip)
        ctx.strokeStyle = mainColor;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // 6. Foreground Phasor Arm Chain (with dark contrast backing so arms cut cleanly across 30-rev orbits)
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.strokeStyle = "rgba(3, 6, 12, 0.88)";
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(joints[0].x, joints[0].y);
        for (let i = 1; i < joints.length; i++) {
          ctx.lineTo(joints[i].x, joints[i].y);
        }
        ctx.stroke();

        // Stationary Bass Reference Vector (Arm 1)
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(joints[0].x, joints[0].y);
        ctx.lineTo(joints[1].x, joints[1].y);
        ctx.stroke();

        // Rotating Upper Voice Vectors (Arms 2..N)
        if (N > 1) {
          ctx.strokeStyle = "#f8fafc";
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
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 10;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(j.x, j.y, 3.0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else if (isBassAnchor) {
            ctx.fillStyle = "#38bdf8";
            ctx.strokeStyle = "#03060c";
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillStyle = isOrigin ? "#64748b" : "#f8fafc";
            ctx.strokeStyle = "#03060c";
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 2.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        // 8. Side-Wing Telemetry Overlays (leaves vertical center 100% unobstructed)
        drawOsdText(
          `DEMODULATED [${N}V · ${revolutions}REV]`,
          10,
          15,
          "#38bdf8",
          "left"
        );
        drawOsdText("Z_rel(t) = e^{-iω₀t}·Z(t)", width - 10, 15, "#94a3b8", "right");

        // Stack voice fraction deltas cleanly in bottom-left wing if >4 voices
        const deltaLabels = pitches.map(
          p => `${noteName(p)}(${getDeltaFractionLabel(p - bass)})`
        );
        if (deltaLabels.length <= 4) {
          drawOsdText(deltaLabels.join(" "), 10, height - 8, "#cbd5e1", "left");
        } else {
          const mid = Math.ceil(deltaLabels.length / 2);
          drawOsdText(deltaLabels.slice(0, mid).join(" "), 10, height - 20, "#cbd5e1", "left");
          drawOsdText(deltaLabels.slice(mid).join(" "), 10, height - 8, "#cbd5e1", "left");
        }

        const mag = Math.hypot(tip.x - ox, tip.y - oy) / R;
        drawOsdText(`|Z_rel|:${mag.toFixed(2)}`, width - 10, height - 8, mainColor, "right");
      }

      ctx.restore();
      animIdRef.current = requestAnimationFrame(render);
    };

    animIdRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [interval, orbitData]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        interval
          ? `Harmonic scope: ${interval.name}, ${interval.consonance} consonance, ${interval.percentage}`
          : "Harmonic oscilloscope vector scope idle"
      }
      className="absolute inset-0 w-full h-full block"
    />
  );
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
  const [autoScroll, setAutoScroll] = useState(true);
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

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode]);

  const containerWidth = containerSize.width;
  const availRollHeight = Math.max(320, (containerSize.height || 500) - 32);
  const rowHeight =
    renderedNoteIndices.length <= 24
      ? availRollHeight / Math.max(1, renderedNoteIndices.length)
      : Math.max(24, availRollHeight / 24);

  const effectiveStepWidth = useMemo(() => {
    if (containerWidth > 120 && numSteps > 0) {
      const autoW = Math.floor((containerWidth - 54) / numSteps);
      if (autoW > stepWidth) return autoW;
    }
    return stepWidth;
  }, [containerWidth, numSteps, stepWidth]);

  const updateViewport = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const start = Math.max(0, Math.floor((scrollLeft - 52) / effectiveStepWidth) - 2);
    const end = Math.min(numSteps, Math.ceil((clientWidth + scrollLeft - 52) / effectiveStepWidth) + 2);
    setViewportSteps({ start, end });
  }, [effectiveStepWidth, numSteps]);

  useEffect(() => {
    updateViewport();
  }, [viewMode, numSteps, effectiveStepWidth, updateViewport]);

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
      name: d.name.replace(/\b[a-z]/g, c => c.toUpperCase()),
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

  const consonanceBadgeStyle = interval
    ? interval.bucket === "perfect"
      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
      : interval.bucket === "consonant"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : interval.bucket === "slightly"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : "bg-slate-800/50 text-slate-500 border-slate-700/40";

  const sortedIntervalPitches = interval
    ? [...interval.pitches].sort((a, b) => a - b)
    : [];

  return (
    <div className="flex flex-col h-screen w-screen bg-studio-grid text-slate-100 px-4 py-3 md:px-6 md:py-4 gap-3 select-none overflow-hidden">
      {/* Hardware Engine Initialization Modal */}
      {!hasInteracted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audio-init-title"
          onClick={handleInteraction}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
              e.preventDefault();
              handleInteraction();
            }
          }}
          tabIndex={0}
          autoFocus
          className="fixed inset-0 z-[100] bg-[#03050a]/90 backdrop-blur-md flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <div className="hw-panel rounded-2xl p-7 max-w-md w-full mx-4 border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 transition-all hover:border-cyan-400/50 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                <span className="text-[10px] tracking-[0.22em] uppercase text-slate-400 font-semibold">
                  SYS // HARMONIC ENGINE v2.4
                </span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-slate-400">
                12-TET · JUST RATIO
              </span>
            </div>

            <h1
              id="audio-init-title"
              className="font-display text-2xl font-semibold tracking-tight text-white"
            >
              Consonance Synthesizer &amp; Vector Scope
            </h1>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Real-time harmonic tension analyzer, polyphonic synth keybed, and bass-demodulated
              phasor sequencer.
            </p>

            <button
              type="button"
              onClick={handleInteraction}
              aria-label="Initialize Audio & MIDI I/O"
              className="mt-6 w-full flex items-center justify-between px-4 py-3 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 transition-all cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.12)]"
            >
              <span className="text-xs font-semibold tracking-[0.16em] uppercase">
                Initialize Audio &amp; MIDI I/O
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/20 border border-cyan-400/30 text-cyan-200 font-bold">
                ENTER / CLICK
              </span>
            </button>
          </div>
        </div>
      )}

      {/* TOP STUDIO CONSOLE BAR: 7:5 Analytical Split with Generous Vertical Scope Stature */}
      <header className="w-full max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0 z-30">
        {/* LEFT MODULE (7 Cols): Harmonic Telemetry & High-Stature Vector Oscilloscope */}
        <div className="lg:col-span-7 hw-panel rounded-xl p-3 flex items-stretch gap-3.5 relative overflow-hidden">
          {/* Telemetry Readout Column */}
          <div className="flex flex-col justify-between w-52 shrink-0">
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span
                    className="w-2 h-2 rounded-full transition-colors duration-200"
                    style={{
                      backgroundColor: interval ? COLORS[interval.bucket] : "#475569",
                      boxShadow: interval ? `0 0 10px ${COLORS[interval.bucket]}` : "none",
                    }}
                  />
                  Harmonic Readout
                </span>
                {activeNotes.size > 0 && (
                  <span className="text-[9px] text-cyan-400 font-bold tracking-wider">
                    LIVE
                  </span>
                )}
              </div>

              {interval ? (
                <>
                  <div
                    className="font-display text-xl font-bold text-white leading-tight truncate"
                    title={interval.name}
                  >
                    {interval.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {interval.diff}{" "}
                      {interval.percentage === "Chord Mode" ? "voices" : "semitones"}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-200 font-semibold">{interval.percentage}</span>
                  </div>

                  {/* Active Voice Pitch Stack (room for up to 8 voices without cramping) */}
                  <div className="flex items-center gap-1 flex-wrap mt-2.5">
                    {sortedIntervalPitches.slice(0, 8).map((p, idx) => (
                      <span
                        key={`${p}-${idx}`}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none border ${
                          idx === 0
                            ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200"
                            : "bg-slate-900 border-slate-700/70 text-slate-300"
                        }`}
                      >
                        {noteName(p)}
                      </span>
                    ))}
                    {sortedIntervalPitches.length > 8 && (
                      <span className="text-[9px] text-slate-500 font-semibold">
                        +{sortedIntervalPitches.length - 8}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-display text-base font-medium text-slate-500 leading-snug">
                    No Interval Active
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Trigger 2+ notes to analyze
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${consonanceBadgeStyle}`}
                >
                  {interval ? interval.consonance : "standby"}
                </span>

                {clipboard && clipboard.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-[8.5px] text-cyan-300 font-semibold">
                    CLIP:{clipboard.length}
                  </span>
                )}
              </div>

              {/* Harmonic Legend Key with Geometric Consonance Glyphs */}
              <div
                className="flex items-center justify-between text-[9px] text-slate-400"
                title="Consonance classification: Diamond = Perfect (1/1, 2/1, 3/2), Circle = Consonant (3rds, 6ths, 4th), Triangle = Mild (2nd, 7th), Dot = Dissonant (Tritone, semitones)"
              >
                <span className="flex items-center gap-1 text-cyan-300" title="Perfect Consonance: Unison (1/1), Octave (2/1), Perfect 5th (3/2)">
                  <Diamond size={8} className="fill-current text-cyan-400" />
                  Perf
                </span>
                <span className="flex items-center gap-1 text-emerald-300" title="Consonant: Major/Minor 3rds & 6ths, Perfect 4th (4/3)">
                  <Circle size={8} className="fill-current text-emerald-400" />
                  Cons
                </span>
                <span className="flex items-center gap-1 text-amber-300" title="Mild Tension: Major 2nd (9/8), Minor 7th (16/9)">
                  <Triangle size={8} className="fill-current text-amber-400" />
                  Mild
                </span>
                <span className="flex items-center gap-1 text-rose-300" title="Dissonant Tension: Tritone (45/32), Minor 2nd (16/15), Major 7th (15/8)">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                  Diss
                </span>
              </div>
            </div>
          </div>

          {/* Dedicated Sunken CRT Scope Bezel — ~184px tall inner viewport */}
          <div className="flex-1 hw-well rounded-lg overflow-hidden relative min-h-[176px] ring-1 ring-inset ring-cyan-500/10">
            <HarmonicVisualizer interval={interval} />
          </div>
        </div>

        {/* RIGHT MODULE (5 Cols): Dieter Rams 2-Column × 4-Row Functional Matrix */}
        <div className="lg:col-span-5 hw-panel rounded-xl p-3 flex flex-col justify-between gap-2">
          {/* Matrix Header */}
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400 border-b border-slate-800/80 pb-1.5">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Control Matrix
            </span>
            <span className="text-[9px] text-slate-500 tracking-wider">
              {viewMode === "pad" ? "MODE: KEYBED" : `MODE: SEQUENCER (${numSteps} ST)`}
            </span>
          </div>

          {/* Strict 2-Column × 4-Row Grid — Every Cell Aligns Horizontally and Vertically */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Row 1, Col 1: Transport & Master BPM */}
            <div className="hw-well rounded-lg p-1 flex items-center justify-between gap-1 h-9">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? "Stop sequence playback" : "Start sequence playback"}
                className={`h-full px-3 rounded-md flex items-center justify-center gap-1.5 text-[10.5px] font-bold tracking-wider transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-cyan-400 focus:outline-none ${
                  isPlaying
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/25"
                }`}
              >
                {isPlaying ? (
                  <Square size={10} fill="currentColor" />
                ) : (
                  <Play size={10} fill="currentColor" />
                )}
                <span>{isPlaying ? "STOP" : "PLAY"}</span>
              </button>

              <div className="w-[1px] h-4 bg-slate-800 shrink-0" />

              <div
                onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 5)}
                onWheel={e => {
                  if (e.deltaY < 0) setBpm(prev => Math.min(240, prev + 1));
                  else setBpm(prev => Math.max(40, prev - 1));
                }}
                className="flex-1 h-full flex items-center justify-between px-1.5 cursor-ns-resize min-w-0"
                title="Drag vertically or scroll to adjust BPM"
              >
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                  BPM
                </span>
                <div className="flex items-center">
                  <button
                    onClick={() => setBpm(prev => Math.max(40, prev - 1))}
                    aria-label="Decrease BPM"
                    className="w-5 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    -
                  </button>
                  <div
                    role="spinbutton"
                    aria-label="Master Tempo in BPM"
                    aria-valuenow={bpm}
                    aria-valuemin={40}
                    aria-valuemax={240}
                    className="px-1 text-xs font-bold text-emerald-400 min-w-[2.1rem] text-center"
                  >
                    {bpm}
                  </div>
                  <button
                    onClick={() => setBpm(prev => Math.min(240, prev + 1))}
                    aria-label="Increase BPM"
                    className="w-5 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Row 1, Col 2: Surface Switcher (Pads vs Sequencer) */}
            <div className="hw-well rounded-lg p-1 grid grid-cols-2 gap-1 h-9">
              <button
                onClick={() => setViewMode("pad")}
                className={`h-full rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  viewMode === "pad"
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Harmonic Pad View"
              >
                <Activity size={12} />
                <span>Pads</span>
              </button>
              <button
                onClick={() => setViewMode("roll")}
                className={`h-full rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  viewMode === "roll"
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Piano Roll Sequencer"
              >
                <LayoutGrid size={12} />
                <span>Sequencer</span>
              </button>
            </div>

            {/* Row 2, Col 1: Pitch Register (Span & Base Octave) */}
            <div className="hw-well rounded-lg p-1 flex items-center justify-between gap-1 h-9">
              <div
                onMouseDown={startNumericDrag(numNotes, setNumNotes, 1, 60, 15)}
                onWheel={e => {
                  if (e.deltaY < 0) setNumNotes(prev => Math.min(60, prev + 1));
                  else setNumNotes(prev => Math.max(1, prev - 1));
                }}
                className="flex-1 h-full flex items-center justify-between px-1.5 cursor-ns-resize min-w-0"
                title="Drag vertically or scroll to adjust note span"
              >
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                  Span
                </span>
                <div className="flex items-center">
                  <button
                    onClick={() => setNumNotes(prev => Math.max(1, prev - 1))}
                    aria-label="Decrease note span"
                    className="w-4 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    -
                  </button>
                  <div
                    role="spinbutton"
                    aria-label="Note Span"
                    aria-valuenow={numNotes}
                    aria-valuemin={1}
                    aria-valuemax={60}
                    className="px-1 text-xs font-bold text-white min-w-[1.5rem] text-center"
                  >
                    {numNotes}
                  </div>
                  <button
                    onClick={() => setNumNotes(prev => Math.min(60, prev + 1))}
                    aria-label="Increase note span"
                    className="w-4 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="w-[1px] h-4 bg-slate-800 shrink-0" />

              <div className="flex-1 h-full flex items-center justify-between px-1.5 min-w-0">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                  Base
                </span>
                <div className="flex items-center">
                  <button
                    onClick={() => setOctave(prev => Math.max(1, prev - 1))}
                    aria-label="Decrease base octave"
                    className="w-4 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    -
                  </button>
                  <div
                    role="spinbutton"
                    aria-label="Base Octave"
                    aria-valuenow={octave}
                    aria-valuemin={1}
                    aria-valuemax={8}
                    className="px-1 text-xs font-bold text-cyan-300 min-w-[1.6rem] text-center"
                  >
                    C{octave}
                  </div>
                  <button
                    onClick={() => setOctave(prev => Math.min(8, prev + 1))}
                    aria-label="Increase base octave"
                    className="w-4 h-6 flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2, Col 2: Oscillator Waveform Selector */}
            <div className="hw-well rounded-lg p-1 grid grid-cols-4 gap-0.5 h-9">
              {WAVES.map(t => (
                <button
                  key={t}
                  onClick={() => setWaveType(t)}
                  className={`h-full rounded-md flex items-center justify-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider transition-all ${
                    waveType === t
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <WaveGlyph type={t} />
                  <span>
                    {t === "sawtooth" ? "SAW" : t === "triangle" ? "TRI" : t === "square" ? "SQR" : "SIN"}
                  </span>
                </button>
              ))}
            </div>

            {/* Row 3, Col 1: Sequencer Edit Tools */}
            <div
              className={`hw-well rounded-lg p-1 flex items-center gap-0.5 h-9 transition-opacity ${
                viewMode === "pad" ? "opacity-35 pointer-events-none" : ""
              }`}
            >
              <button
                disabled={viewMode === "pad"}
                onClick={() => setEditTool("draw")}
                className={`flex-1 h-full rounded-md flex items-center justify-center gap-1 text-[10px] font-semibold uppercase transition-all ${
                  editTool === "draw"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Draw Lead Note"
              >
                <Activity size={11} />
                <span>Draw</span>
              </button>
              <button
                disabled={viewMode === "pad"}
                onClick={() => setEditTool("chord")}
                className={`flex-1 h-full rounded-md flex items-center justify-center gap-1 text-[10px] font-semibold uppercase transition-all ${
                  editTool === "chord"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Draw Backing Chord Note"
              >
                <Layers size={11} />
                <span>Chord</span>
              </button>
              {editTool === "chord" && viewMode === "roll" && (
                <div className="flex items-center gap-0.5 px-1 border-x border-slate-800 shrink-0">
                  <button
                    onClick={() => setChordVolumeDb(prev => Math.max(-6, prev - 1))}
                    aria-label="Decrease chord volume"
                    className="w-3.5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] text-slate-300 focus-visible:ring-1 focus-visible:ring-amber-400 focus:outline-none"
                  >
                    -
                  </button>
                  <span
                    role="spinbutton"
                    aria-label="Chord volume in decibels"
                    aria-valuenow={chordVolumeDb}
                    aria-valuemin={-6}
                    aria-valuemax={-1}
                    className="text-[9px] font-semibold text-amber-300 min-w-[1.8rem] text-center"
                  >
                    {chordVolumeDb}dB
                  </span>
                  <button
                    onClick={() => setChordVolumeDb(prev => Math.min(-1, prev + 1))}
                    aria-label="Increase chord volume"
                    className="w-3.5 h-5 flex items-center justify-center hover:bg-white/10 rounded text-[10px] text-slate-300 focus-visible:ring-1 focus-visible:ring-amber-400 focus:outline-none"
                  >
                    +
                  </button>
                </div>
              )}
              <button
                disabled={viewMode === "pad"}
                onClick={() => setEditTool("select")}
                aria-label="Marquee Select Tool"
                className={`flex-1 h-full rounded-md flex items-center justify-center gap-1 text-[10px] font-semibold uppercase transition-all focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                  editTool === "select"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Marquee Select Tool"
              >
                <LayoutGrid size={11} />
                <span>Select</span>
              </button>
            </div>

            {/* Row 3, Col 2: Clipboard Actions */}
            <div
              className={`hw-well rounded-lg p-1 flex items-center justify-between gap-0.5 h-9 transition-opacity ${
                viewMode === "pad" ? "opacity-35 pointer-events-none" : ""
              }`}
            >
              <button
                onClick={copySelection}
                disabled={selectedKeys.size === 0 || viewMode === "pad"}
                aria-label="Copy selected notes (Ctrl+C)"
                className={`flex-1 h-full rounded flex items-center justify-center gap-1 text-[9.5px] font-semibold transition-colors focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                  selectedKeys.size > 0
                    ? "text-cyan-300 hover:bg-cyan-500/10"
                    : "text-slate-600"
                }`}
                title="Copy (Ctrl+C)"
              >
                <Copy size={11} />
                <span>COPY</span>
              </button>
              <button
                onClick={cutSelection}
                disabled={selectedKeys.size === 0 || viewMode === "pad"}
                aria-label="Cut selected notes (Ctrl+X)"
                className={`flex-1 h-full rounded flex items-center justify-center gap-1 text-[9.5px] font-semibold transition-colors focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                  selectedKeys.size > 0
                    ? "text-cyan-300 hover:bg-cyan-500/10"
                    : "text-slate-600"
                }`}
                title="Cut (Ctrl+X)"
              >
                <Scissors size={11} />
                <span>CUT</span>
              </button>
              <button
                onClick={() => pasteSelection(false)}
                disabled={!clipboard || viewMode === "pad"}
                aria-label="Paste notes (Ctrl+V)"
                className={`flex-1 h-full rounded flex items-center justify-center gap-1 text-[9.5px] font-semibold transition-colors focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                  clipboard ? "text-emerald-300 hover:bg-emerald-500/10" : "text-slate-600"
                }`}
                title="Paste (Ctrl+V)"
              >
                <ClipboardPaste size={11} />
                <span>PASTE</span>
              </button>
              <div className="w-[1px] h-4 bg-slate-800 shrink-0" />
              <button
                onClick={deleteSelectedNotes}
                disabled={selectedKeys.size === 0 || viewMode === "pad"}
                aria-label="Delete selected notes (Delete)"
                className={`w-7 h-full rounded flex items-center justify-center text-[10px] font-semibold transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-rose-400 focus:outline-none ${
                  selectedKeys.size > 0 ? "text-rose-400 hover:bg-rose-500/10" : "text-slate-600"
                }`}
                title="Delete Selected (Del)"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Row 4, Col 1: Keybed Filter & Keymap Config */}
            <div className="hw-well rounded-lg p-1 grid grid-cols-2 gap-1 h-9">
              <button
                onClick={() => setHideDisabled(!hideDisabled)}
                aria-label={hideDisabled ? "Show disabled pads" : "Hide disabled pads"}
                className={`h-full rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase transition-all focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                  hideDisabled
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title={hideDisabled ? "Show Disabled Pads" : "Hide Disabled Pads"}
              >
                {hideDisabled ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{hideDisabled ? "Hidden" : "Filter"}</span>
              </button>
              <button
                disabled={viewMode === "roll"}
                onClick={() => {
                  setEditMode(!editMode);
                  setBindingIndex(null);
                }}
                aria-label={
                  editMode ? "Exit key binding mode" : "Configure key bindings and mute pads"
                }
                className={`h-full rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase transition-all focus-visible:ring-1 focus-visible:ring-amber-400 focus:outline-none ${
                  viewMode === "roll"
                    ? "opacity-30 cursor-not-allowed text-slate-600"
                    : editMode
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Configure Key Bindings & Mute Pads"
              >
                <Settings2 size={12} />
                <span>Keys</span>
              </button>
            </div>

            {/* Row 4, Col 2: Preset EXP/IMP & MIDI Status */}
            <div className="hw-well rounded-lg p-1 flex items-center justify-between gap-1 h-9">
              <button
                onClick={exportSequence}
                aria-label="Export sequence to JSON file"
                className="h-full px-2.5 hover:bg-white/5 rounded text-[9.5px] font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 shrink-0 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                title="Export JSON Sequence"
              >
                <Download size={11} />
                <span>EXP</span>
              </button>
              <div className="w-[1px] h-4 bg-slate-800 shrink-0" />
              <label
                aria-label="Import sequence from JSON file"
                className="h-full px-2.5 hover:bg-white/5 rounded text-[9.5px] font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 cursor-pointer shrink-0 focus-within:ring-1 focus-within:ring-cyan-400"
                title="Import JSON Sequence"
              >
                <Upload size={11} />
                <span>IMP</span>
                <input type="file" accept=".json" onChange={importSequence} className="hidden" />
              </label>
              <div className="w-[1px] h-4 bg-slate-800 shrink-0" />
              <div
                className={`flex-1 h-full px-1.5 rounded flex items-center justify-center gap-1.5 min-w-0 ${
                  midiStatus === "connected" ? "bg-cyan-950/30" : ""
                }`}
                title={`MIDI Status: ${midiStatus}`}
              >
                <Radio
                  size={10}
                  className={`shrink-0 ${
                    midiStatus === "connected" ? "text-cyan-400" : "text-slate-600"
                  }`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    midiStatus === "connected"
                      ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
                      : "bg-slate-600"
                  }`}
                />
                <span className="text-[8.5px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {midiStatus === "connected" ? "MIDI:ON" : `MIDI:${midiStatus.slice(0, 4)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN INSTRUMENT WORKSPACE */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto flex flex-col min-h-0">
        {viewMode === "pad" ? (
          <div className="hw-panel rounded-2xl p-4 md:p-5 flex-1 flex flex-col justify-between relative overflow-hidden">
            {/* Top rack status header inside the pad deck */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-400 border-b border-slate-800/80 pb-3 mb-2 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 font-semibold text-slate-300">
                  <span className="w-1.5 h-3.5 rounded-sm bg-cyan-400/80 shadow-[0_0_8px_#22d3ee]" />
                  HARMONIC KEYBED
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[9px] tracking-wider text-slate-400">
                  REF:{" "}
                  <strong className="text-cyan-300 font-bold">
                    {pivotNote !== null
                      ? `${getNoteName(pivotNote)}${octave + Math.floor(pivotNote / 12)}`
                      : "IDLE"}
                  </strong>
                </span>
                {activeNotes.size > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] tracking-wider text-emerald-300 font-semibold">
                    VOICES HELD: {activeNotes.size}
                  </span>
                )}
              </div>

              <span className="text-[9px] tracking-[0.16em] text-slate-400">
                {editMode ? (
                  <span className="text-amber-300 font-semibold">
                    KEYMAP EDIT // CLICK PAD TO BIND KEY · CLICK AGAIN TO MUTE/ENABLE
                  </span>
                ) : (
                  "HOLD NOTES OR USE KEYBOARD FOR REAL-TIME HARMONIC HEATMAP"
                )}
              </span>
            </div>

            {/* Pad Array */}
            <div className="relative w-full flex-1 flex items-stretch gap-1.5 pt-2 pb-1 overflow-x-auto md:overflow-x-visible no-scrollbar min-h-0">
              {Array.from({ length: numNotes })
                .map((_, i) => i)
                .filter(i => !hideDisabled || !disabledNotes.has(i))
                .map(i => {
                  const isDisabled = disabledNotes.has(i);
                  const isActive = activeNotes.has(i);
                  const noteLabel = getNoteName(i);
                  const noteOctave = octave + Math.floor(i / 12);
                  const isRootC = i % 12 === 0;
                  const accidental = isAccidental(i);
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

                  const renderShape = () => {
                    if (activeIndices.length === 0 || isDisabled) return null;
                    const baseIconSize = Math.max(13, Math.min(26, 380 / numNotes));
                    const baseDotSize = Math.max(6, Math.min(10, 130 / numNotes));
                    const containerClass =
                      "absolute inset-x-0 top-10 bottom-20 flex items-center justify-center pointer-events-none z-10";

                    const iconProps = {
                      size: baseIconSize,
                      className: "transition-all duration-150",
                      fill: isActive ? "currentColor" : "none",
                      strokeWidth: isActive ? 2.4 : 1.75,
                      style: {
                        filter: `drop-shadow(0 0 ${isActive ? glow.icon * 1.4 : glow.icon}px currentColor)`,
                        opacity: isActive ? 1 : 0.78,
                      },
                    };

                    const activeHalo = isActive ? (
                      <span
                        style={{
                          width: `${baseIconSize + 16}px`,
                          height: `${baseIconSize + 16}px`,
                          borderColor: `${displayColor}88`,
                          boxShadow: `0 0 14px ${displayColor}55, inset 0 0 8px ${displayColor}33`,
                        }}
                        className="absolute rounded-full border pointer-events-none animate-pulse"
                      />
                    ) : null;

                    switch (type) {
                      case "perfect":
                        return (
                          <div className={containerClass}>
                            {activeHalo}
                            <Diamond {...iconProps} className={`${iconProps.className} text-cyan-400`} />
                          </div>
                        );
                      case "consonant":
                        return (
                          <div className={containerClass}>
                            {activeHalo}
                            <Circle {...iconProps} className={`${iconProps.className} text-emerald-400`} />
                          </div>
                        );
                      case "slightly":
                        return (
                          <div className={containerClass}>
                            {activeHalo}
                            <Triangle {...iconProps} className={`${iconProps.className} text-amber-400`} />
                          </div>
                        );
                      case "dissonant":
                        return (
                          <div className={containerClass}>
                            {activeHalo}
                            <div
                              style={{
                                width: `${baseDotSize}px`,
                                height: `${baseDotSize}px`,
                                boxShadow: `0 0 ${glow.icon * 2}px #f43f5e`,
                              }}
                              className="bg-rose-500 rounded-full animate-pulse"
                            />
                          </div>
                        );
                      default:
                        return null;
                    }
                  };

                  const padBackground = isDisabled
                    ? "rgba(8, 11, 19, 0.35)"
                    : isActive
                    ? `linear-gradient(180deg, ${displayColor}50 0%, ${displayColor}1f 55%, ${displayColor}38 100%)`
                    : activeIndices.length > 0
                    ? `linear-gradient(180deg, ${displayColor}18 0%, rgba(10, 15, 28, 0.88) 45%, rgba(6, 9, 17, 0.96) 100%)`
                    : accidental
                    ? "linear-gradient(180deg, rgba(9, 13, 24, 0.95) 0%, rgba(4, 7, 14, 0.99) 100%)"
                    : "linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(12, 18, 32, 0.95) 100%)";

                  const padBorderColor = isBinding
                    ? "#f8fafc"
                    : isDisabled
                    ? "rgba(148, 163, 184, 0.06)"
                    : isActive
                    ? displayColor
                    : activeIndices.length > 0
                    ? `${displayColor}55`
                    : isRootC
                    ? "rgba(34, 211, 238, 0.32)"
                    : accidental
                    ? "rgba(148, 163, 184, 0.12)"
                    : "rgba(148, 163, 184, 0.22)";

                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={isDisabled ? -1 : 0}
                      aria-label={`Note ${noteLabel}${noteOctave}, ${type !== "neutral" ? BUCKET_TEXT[type as Bucket] : "neutral consonance"}${keyBindings[i]?.length ? `, key ${keyBindings[i].join(" ")}` : ""}`}
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
                        background: padBackground,
                        borderColor: padBorderColor,
                        boxShadow: isActive
                          ? `0 0 ${glow.outer}px -2px ${displayColor}99, inset 0 0 ${glow.inner}px ${displayColor}55`
                          : isBinding
                          ? "0 0 24px rgba(255,255,255,0.35)"
                          : "inset 0 1px 0 rgba(255,255,255,0.06)",
                        opacity: isDisabled ? 0.25 : 1,
                        height: "100%",
                      }}
                      className={`group relative rounded-xl border transition-all duration-150 flex-shrink-0 w-11 md:w-auto md:flex-1 md:min-w-0 h-full ${
                        isBinding ? "z-20 scale-[1.02] ring-2 ring-white/40" : ""
                      } ${
                        editMode ? "cursor-pointer" : "cursor-crosshair"
                      } focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none focus:z-30 overflow-hidden`}
                    >
                      {/* Top Phosphor LED Diffuser Bar */}
                      <div
                        style={{
                          backgroundColor: isDisabled
                            ? "transparent"
                            : activeIndices.length > 0 || isActive
                            ? displayColor
                            : isRootC
                            ? "#22d3ee"
                            : accidental
                            ? "#334155"
                            : "#64748b",
                          boxShadow:
                            isActive || activeIndices.length > 0
                              ? `0 0 12px ${displayColor}`
                              : "none",
                          opacity: isActive ? 1 : activeIndices.length > 0 ? 0.85 : isRootC ? 0.65 : 0.35,
                        }}
                        className="absolute top-0 inset-x-0 h-[3.5px] transition-all duration-200"
                      />

                      {/* Center Channel-Strip Signal Waveguide */}
                      {!isDisabled && (
                        <div
                          style={{
                            background:
                              isActive
                                ? `linear-gradient(180deg, ${displayColor}66 0%, ${displayColor}22 50%, ${displayColor}66 100%)`
                                : activeIndices.length > 0
                                ? `linear-gradient(180deg, ${displayColor}24 0%, transparent 50%, ${displayColor}18 100%)`
                                : "linear-gradient(180deg, rgba(148,163,184,0.08) 0%, transparent 50%, rgba(148,163,184,0.08) 100%)",
                          }}
                          className="absolute top-8 bottom-16 left-1/2 -translate-x-1/2 w-[1px] pointer-events-none"
                        />
                      )}

                      {/* Accidental recessed dark key chamber */}
                      {accidental && !isDisabled && (
                        <div className="absolute top-[3.5px] inset-x-1 h-5 rounded-b-md bg-black/40 border-x border-b border-slate-800/60 flex items-center justify-center pointer-events-none">
                          <span className="w-2 h-0.5 rounded-full bg-slate-500/50" />
                        </div>
                      )}

                      {renderShape()}

                      {/* Bottom Note & Sculpted Keycap Legend */}
                      <div className="absolute bottom-0 inset-x-0 pt-2 pb-2.5 bg-gradient-to-t from-black/45 via-black/20 to-transparent border-t border-white/[0.04] flex flex-col items-center pointer-events-none z-10 px-1 gap-1.5">
                        <span
                          className={`text-xs font-bold tracking-tight transition-colors ${
                            isActive
                              ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                              : isDisabled
                              ? "text-slate-700"
                              : isRootC
                              ? "text-cyan-300"
                              : accidental
                              ? "text-slate-400"
                              : "text-slate-200"
                          }`}
                        >
                          {noteLabel}
                          {isRootC && (
                            <sub className="text-[8px] font-semibold text-cyan-400/90 ml-0.5">
                              {noteOctave}
                            </sub>
                          )}
                        </span>

                        {isBinding ? (
                          <div className="flex flex-col items-center">
                            <span
                              className={`text-[7px] font-bold text-center uppercase px-1 py-0.5 rounded ${
                                bindingError
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-cyan-500/20 text-cyan-300 animate-pulse"
                              }`}
                            >
                              {bindingError || "BIND KEY"}
                            </span>
                            <span className="text-[7px] font-semibold text-slate-400 uppercase mt-0.5">
                              {keyBindings[i]?.join(" ")}
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`text-[8.5px] font-bold text-center px-1.5 py-0.5 rounded border break-all leading-none min-w-[1.45rem] transition-all ${
                              isActive
                                ? "bg-white/20 border-white/50 text-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                : isDisabled
                                ? "border-transparent text-slate-800"
                                : "bg-slate-950/80 border-slate-700/80 text-slate-300 shadow-sm group-hover:text-white group-hover:border-slate-500"
                            }`}
                          >
                            {isDisabled ? "OFF" : keyBindings[i]?.join(" ").toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Active Gate Indicator Bar at bottom edge */}
                      {isActive && !isDisabled && (
                        <div
                          style={{
                            backgroundColor: displayColor,
                            boxShadow: `0 0 12px ${displayColor}`,
                          }}
                          className="absolute bottom-0 inset-x-0 h-1 z-20"
                        />
                      )}

                      {editMode && !isBinding && !isDisabled && (
                        <div className="absolute inset-0 bg-amber-400/[0.03] group-hover:bg-amber-400/[0.09] transition-colors pointer-events-none" />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          /* SEQUENCER PIANO ROLL VIEW */
          <div className="hw-panel rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
            {/* Sequencer Top Status Bar & Visual Note Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#080d18] border-b border-slate-800/90 text-[10px] uppercase tracking-[0.16em] text-slate-400 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 font-semibold text-slate-300">
                  <span className="w-1.5 h-3.5 rounded-sm bg-cyan-400/80 shadow-[0_0_8px_#22d3ee]" />
                  HARMONIC STEP SEQUENCER
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] text-cyan-300 font-semibold">
                  TOOL: {editTool.toUpperCase()}
                </span>
                {cellHover && (
                  <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[9px] text-slate-300">
                    CURSOR: <strong className="text-white">STEP {cellHover.step + 1}</strong> ·{" "}
                    <strong className="text-cyan-300">
                      {getNoteName(cellHover.note)}
                      {octave + Math.floor(cellHover.note / 12)}
                    </strong>
                  </span>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-4 text-[9px] tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5" title="Left note cap color shows melodic consonance relative to the previous bass step">
                  <span className="w-1.5 h-3 rounded-l-sm bg-amber-400 inline-block shadow-[0_0_6px_#fbbf24]" />
                  LEFT CAP: STEP-TO-STEP MELODIC TENSION
                </span>
                <span className="flex items-center gap-1.5" title="Center horizontal core bar shows vertical chord consonance within the same step">
                  <span className="w-3.5 h-1 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" />
                  CORE LINE: VERTICAL CHORD CONSONANCE
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div
                className="flex-1 overflow-auto bg-[#050811]"
                ref={scrollRef}
                onScroll={updateViewport}
                onMouseLeave={() => setHoveredCell(null)}
                onMouseMove={e => {
                  if (!scrollRef.current) return;
                  const rect = scrollRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left + scrollRef.current.scrollLeft - 52;
                  const y = e.clientY - rect.top;

                  const scrollY = scrollRef.current.scrollTop;
                  const totalContentHeight = renderedNoteIndices.length * rowHeight;
                  const pianoRollTop = 32;

                  const step = Math.floor(x / effectiveStepWidth);
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
                      className="absolute bg-cyan-500/15 border border-cyan-400/70 pointer-events-none rounded-sm shadow-[0_0_16px_rgba(34,211,238,0.2)]"
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
                          isRootC ? "border-slate-800" : "border-slate-900/90"
                        } group shrink-0 ${
                          accidental ? "bg-[#04060d]" : "bg-[#080d19]"
                        } ${isDisabled ? "opacity-25 grayscale pointer-events-none" : ""}`}
                      >
                        {/* Sticky Piano Key Label with Live Sounding Illumination */}
                        <div
                          className={`sticky left-0 w-[52px] h-full flex items-center justify-between px-2 text-[10px] font-semibold border-r border-slate-800 z-50 shrink-0 transition-colors ${
                            isNoteSounding
                              ? "bg-cyan-500/25 text-white border-l-2 border-l-cyan-300 shadow-[inset_0_0_10px_rgba(34,211,238,0.3)]"
                              : accidental
                              ? "bg-[#050811] text-slate-500 shadow-[inset_-3px_0_6px_rgba(0,0,0,0.6)]"
                              : isRootC
                              ? "bg-[#0d1627] text-cyan-300 border-l-2 border-l-cyan-400"
                              : "bg-[#0a101d] text-slate-300"
                          } group-hover:text-white`}
                        >
                          <span>{getNoteName(noteIdx)}</span>
                          {isRootC && (
                            <span className="text-[8px] text-cyan-400 font-bold">
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
                                style={{ width: `${effectiveStepWidth}px` }}
                                className={`flex-shrink-0 border-r ${
                                  isBarStart
                                    ? "border-r-slate-700/80"
                                    : isBeatStart
                                    ? "border-r-slate-800"
                                    : "border-r-slate-900/80"
                                } cursor-pointer relative overflow-visible ${
                                  isCurrent
                                    ? "bg-cyan-500/[0.08]"
                                    : pasteAnchor === stepIdx
                                    ? "bg-cyan-500/[0.03]"
                                    : isAltBeatGroup
                                    ? "bg-white/[0.012]"
                                    : ""
                                } ${!isTouchDevice ? "hover:bg-white/[0.06]" : ""}`}
                              >
                                {isCurrent && (
                                  <div className="absolute inset-y-0 left-0 w-[1.5px] bg-cyan-400/50 pointer-events-none z-20" />
                                )}
                                {pasteAnchor === stepIdx && (
                                  <div className="absolute inset-y-0 left-0 w-[1px] bg-cyan-400/40 pointer-events-none z-0" />
                                )}
                                {propagationHintColor && (
                                  <div
                                    style={{
                                      background: isPropagationStart
                                        ? `linear-gradient(to right, ${propagationHintColor}44, ${propagationHintColor})`
                                        : propagationHintColor,
                                      opacity: 0.11,
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
                                          backgroundColor: "#22d3ee",
                                          opacity: 0.3,
                                          left: `${dragDelta.ds * effectiveStepWidth}px`,
                                          bottom: `${(t - renderedIdx) * rowHeight}px`,
                                          width: `${effectiveStepWidth}px`,
                                          height: `${rowHeight - 2}px`,
                                          zIndex: 40,
                                        }}
                                        className="absolute pointer-events-none rounded-sm ring-1 ring-cyan-300"
                                      />
                                    );
                                  })()}

                                {isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: isSelected
                                          ? "#334155"
                                          : isChord
                                          ? "#111827"
                                          : "#1e293b",
                                        left: hasPrev ? "-1px" : "2px",
                                        right: hasNext ? "-1px" : "3px",
                                        zIndex: 5,
                                        borderTopLeftRadius: hasPrev ? 0 : "3px",
                                        borderBottomLeftRadius: hasPrev ? 0 : "3px",
                                        borderTopRightRadius: hasNext ? 0 : "3px",
                                        borderBottomRightRadius: hasNext ? 0 : "3px",
                                        boxShadow: isSelected
                                          ? "0 0 12px rgba(34,211,238,0.35)"
                                          : "inset 0 1px 0 rgba(255,255,255,0.1)",
                                        border: isChord
                                          ? "1px dashed rgba(251,191,36,0.4)"
                                          : "1px solid rgba(148,163,184,0.22)",
                                        opacity: isChord ? 0.8 : 1,
                                      }}
                                      className={`absolute top-1 bottom-1 ${
                                        isSelected ? "ring-1 ring-cyan-400/70" : ""
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
                                            ? `0 0 10px ${noteInternalLineColor}`
                                            : "none",
                                        opacity: isChord ? 0.55 : 1,
                                      }}
                                      className="absolute pointer-events-none transition-colors duration-150 -translate-y-1/2"
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
                                          opacity: isChord ? 0.65 : 1,
                                        }}
                                        className="absolute top-1 bottom-1 rounded-l-sm"
                                      >
                                        {stepIdx === stepMetadata.firstStepWithNotes && (
                                          <div className="absolute inset-y-0 left-0 w-[2px] bg-white shadow-[0_0_8px_#fff]" />
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {!isTouchDevice && editTool === "draw" && isHovered && !isSet && (
                                  <>
                                    <div
                                      style={{
                                        backgroundColor: "#0f172a",
                                        left: "2px",
                                        right: "3px",
                                        borderRadius: "3px",
                                        zIndex: 5,
                                      }}
                                      className="absolute top-1 bottom-1 border border-slate-700/50"
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
                                          ? `0 0 10px ${ghostLineColor}`
                                          : "none",
                                      }}
                                      className="absolute pointer-events-none -translate-y-1/2"
                                    />
                                    <div
                                      style={{
                                        backgroundColor: ghostHeaderColor || "transparent",
                                        boxShadow: ghostHeaderColor
                                          ? `0 0 12px ${ghostHeaderColor}`
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

                  {/* Sticky Piano Roll Step Ruler */}
                  <div className="h-8 border-b border-slate-800 flex bg-[#070b14]/95 backdrop-blur-sm z-[100] sticky top-0 shrink-0">
                    <div className="w-[52px] border-r border-slate-800 shrink-0 bg-[#070b14] sticky left-0 z-[110] flex items-center justify-center text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      STEP
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
                          className={`flex-shrink-0 h-full flex items-center justify-center text-[10px] font-semibold border-r ${
                            isBar
                              ? "border-r-slate-700"
                              : isBeat
                              ? "border-r-slate-800"
                              : "border-r-slate-900"
                          } transition-colors cursor-pointer relative ${
                            currentStep === i
                              ? "bg-cyan-500/20 text-cyan-300 font-bold"
                              : pasteAnchor === i
                              ? "bg-cyan-500/10 text-cyan-200"
                              : hoveredCell?.step === i
                              ? "text-slate-200 bg-white/5"
                              : isBar
                              ? "text-slate-200 bg-slate-900/50"
                              : isBeat
                              ? "text-slate-400"
                              : "text-slate-600"
                          }`}
                        >
                          {i + 1}
                          {currentStep === i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                          )}
                          {pasteAnchor === i && currentStep !== i && (
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-500/50" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Integrated Sequencer Timing & Grid Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#070b14] border-t border-slate-800/90 z-40 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Pattern Length (Steps) */}
                  <div
                    onMouseDown={startNumericDrag(numSteps, setNumSteps, 4, 1024, 10)}
                    onWheel={e => {
                      if (e.deltaY < 0) setNumSteps(prev => Math.min(1024, prev + 4));
                      else setNumSteps(prev => Math.max(4, prev - 4));
                    }}
                    className="hw-well rounded-lg p-0.5 flex items-center h-7 cursor-ns-resize"
                  >
                    <span className="px-2 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      Steps
                    </span>
                    <button
                      onClick={() => setNumSteps(prev => Math.max(4, prev - 4))}
                      aria-label="Decrease pattern steps"
                      className="w-5 h-full flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                    >
                      -
                    </button>
                    <div
                      role="spinbutton"
                      aria-label="Pattern Steps"
                      aria-valuenow={numSteps}
                      aria-valuemin={4}
                      aria-valuemax={1024}
                      className="px-2 text-[11px] font-bold text-cyan-300 border-x border-slate-800 min-w-[2.2rem] text-center"
                    >
                      {numSteps}
                    </div>
                    <button
                      onClick={() => setNumSteps(prev => Math.min(1024, prev + 4))}
                      aria-label="Increase pattern steps"
                      className="w-5 h-full flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                    >
                      +
                    </button>
                  </div>

                  {/* Step Width Zoom */}
                  <div className="hw-well rounded-lg p-0.5 flex items-center h-7">
                    <span className="px-2 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      Zoom
                    </span>
                    <button
                      onClick={() => setStepWidth(prev => Math.max(16, prev - 8))}
                      aria-label="Zoom out sequencer step width"
                      className="w-5 h-full flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                    >
                      -
                    </button>
                    <div
                      role="spinbutton"
                      aria-label="Step Width Zoom"
                      aria-valuenow={effectiveStepWidth}
                      aria-valuemin={16}
                      aria-valuemax={160}
                      className="px-2 text-[10px] font-semibold text-slate-300 border-x border-slate-800"
                    >
                      {effectiveStepWidth}px
                    </div>
                    <button
                      onClick={() => setStepWidth(prev => Math.min(160, prev + 8))}
                      aria-label="Zoom in sequencer step width"
                      className="w-5 h-full flex items-center justify-center hover:bg-white/5 rounded text-xs text-slate-300 focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none"
                    >
                      +
                    </button>
                  </div>

                  {/* Tempo (BPM) */}
                  <div
                    onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 3)}
                    onWheel={e => {
                      if (e.deltaY < 0) setBpm(prev => Math.min(240, prev + 1));
                      else setBpm(prev => Math.max(40, prev - 1));
                    }}
                    className="hw-well rounded-lg px-2.5 h-7 flex items-center gap-2.5 cursor-ns-resize"
                  >
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      Tempo
                    </span>
                    <div className="text-[11px] font-bold text-emerald-400 min-w-[3.4rem]">
                      {bpm} <span className="text-[9px] text-slate-500 font-normal">BPM</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="240"
                      value={bpm}
                      aria-label="Master tempo in beats per minute"
                      onMouseDown={e => e.stopPropagation()}
                      onMouseUp={e => e.currentTarget.blur()}
                      onChange={e => setBpm(parseInt(e.target.value))}
                      className="w-28 hw-slider focus-visible:ring-1 focus-visible:ring-emerald-400 focus:outline-none"
                    />
                  </div>

                  {/* Playhead Auto-Scroll Follow Toggle */}
                  <button
                    onClick={() => setAutoScroll(prev => !prev)}
                    className={`hw-well rounded-lg px-2.5 h-7 flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-semibold transition-all focus-visible:ring-1 focus-visible:ring-cyan-400 focus:outline-none ${
                      autoScroll
                        ? "text-cyan-300 border border-cyan-500/40 bg-cyan-950/20"
                        : "text-slate-500 border border-slate-800"
                    }`}
                    title="Toggle automatic playhead viewport tracking during playback"
                    aria-label={`Toggle playhead auto-scroll (currently ${autoScroll ? "enabled" : "disabled"})`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        autoScroll ? "bg-cyan-400 shadow-[0_0_6px_#22d3ee]" : "bg-slate-600"
                      }`}
                    />
                    <span>Follow</span>
                  </button>
                </div>

                <div className="text-[10px] text-slate-400 uppercase tracking-wider hidden md:flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                    STEP <strong className="text-cyan-300">{currentStep + 1}</strong> / {numSteps}
                  </span>
                  <span className="text-slate-500">
                    {selectedKeys.size > 0 ? `${selectedKeys.size} SELECTED` : "READY"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}