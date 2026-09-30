// theory.ts: pure harmony model for NeonSynthPad (no React, no DOM).
// A pitch is an integer semitone index; pitch % 12 is the pitch class (0 = C). Your pad index already works as a pitch.
//
// Wiring into the component (replaces getConsonanceType, getHarmonicTypeForSet, getChordName and the "%" readout):
//   import { consonanceBucket, noteVsSetBucket, detectChord, describeInterval, BUCKET_TEXT } from "./theory";
//   const getConsonanceType = consonanceBucket;
//   const getHarmonicTypeForSet = (t: number, held: number[]) => (held.length ? noteVsSetBucket(t, held) : "neutral");
//   const getChordName = (idx: number[]) => detectChord(idx).name;
//   // in getIntervalInfo, once p1/p2 are known (keep the "Chord Mode" branches):
//   const d = describeInterval(p1, p2);
//   return { name: d.name, percentage: `${d.ratio} · ${Math.round(d.cents)}¢`, consonance: BUCKET_TEXT[d.bucket], diff: d.semitones };
//   // in the JSX, print `${interval.percentage}` without the trailing "%".

export const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const pc = (p: number) => ((p % 12) + 12) % 12;
export const noteName = (p: number, flats = false) => (flats ? NOTE_FLAT : NOTE_SHARP)[pc(p)];

export type Bucket = "perfect" | "consonant" | "slightly" | "dissonant";
export const BUCKET_TEXT: Record<Bucket, string> = {
  perfect: "perfectly consonant",
  consonant: "consonant",
  slightly: "slightly consonant",
  dissonant: "dissonant",
};
export type Options = { p4?: "consonant" | "bass-dissonant" };

export const MODEL_NOTE =
  "Tension is looked up by interval class, so an interval and its inversion score the same (M3 = m6, m3 = M6, P4 = P5). " +
  "The ordering follows Euler's gradus averaged over each inversion pair; the numbers are a judgement, not a measurement. " +
  "Register and timbre are ignored. A P4 is consonant unless p4 is 'bass-dissonant' (classical counterpoint: P4 above the bass). " +
  "A chord's score is the mean of its pairs, pulled a quarter of the way toward its harshest pair.";

// Tension by interval class 0..6 (0 = settled, 1 = most tense).
const IC_TENSION = [0, 0.9, 0.6, 0.35, 0.3, 0.15, 0.8];
const ic = (semis: number) => {
  const d = pc(semis);
  return Math.min(d, 12 - d);
};

export const bucketOf = (t: number): Bucket => (t < 0.2 ? "perfect" : t < 0.45 ? "consonant" : t < 0.7 ? "slightly" : "dissonant");
export const consonanceBucket = (semis: number): Bucket => bucketOf(IC_TENSION[ic(semis)]);

/** Tension 0-1 between two pitches. `bassPitch` (lowest sounding pitch) only matters for the P4 stance. */
export function pairTension(a: number, b: number, bassPitch = Math.min(a, b), o: Options = {}): number {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (o.p4 === "bass-dissonant" && lo === bassPitch && pc(hi - lo) === 5) return 0.6;
  return IC_TENSION[ic(hi - lo)];
}

const blend = (ts: number[]) => {
  if (!ts.length) return 0;
  const mean = ts.reduce((s, t) => s + t, 0) / ts.length;
  return mean + 0.25 * (Math.max(...ts) - mean);
};

/** Distinct pitch classes, each at its lowest pitch, ascending. Index 0 is the bass. */
const distinct = (pitches: number[]) => {
  const seen = new Map<number, number>();
  [...pitches].sort((a, b) => a - b).forEach(p => { if (!seen.has(pc(p))) seen.set(pc(p), p); });
  return Array.from(seen.values());
};

/** How much a candidate pitch clashes with the notes currently held (drives the pad heatmap). */
export function noteVsSetTension(target: number, held: number[], o: Options = {}): number {
  const others = distinct(held).filter(h => pc(h) !== pc(target));
  if (!others.length) return 0;
  const bass = Math.min(target, ...others);
  return blend(others.map(h => pairTension(target, h, bass, o)));
}
export const noteVsSetBucket = (target: number, held: number[], o?: Options) => bucketOf(noteVsSetTension(target, held, o));

/** Pairwise matrix plus one chord-level score (not worst-case). Octave doublings collapse to one pitch class. */
export function setTension(pitches: number[], o: Options = {}) {
  const ps = distinct(pitches);
  const matrix = ps.map((a, i) => ps.map((b, j) => (i === j ? 0 : pairTension(a, b, ps[0], o))));
  const pairs: number[] = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) pairs.push(matrix[i][j]);
  return { pitches: ps, matrix, tension: blend(pairs), worst: Math.max(0, ...pairs) };
}

const FULL = ["unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th"];
const SHORT = ["P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];
const JUST: [number, number][] = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Plain-language interval readout: name, just ratio, cents (12-TET and just), tension. */
export function describeInterval(a: number, b: number, o: Options = {}) {
  const semis = Math.abs(a - b), octs = Math.floor(semis / 12), r = semis % 12;
  const num = JUST[r][0] * Math.pow(2, octs), den = JUST[r][1], g = gcd(num, den);
  const oct = octs === 1 ? "octave" : `${octs} octaves`;
  const name = octs === 0 ? FULL[r] : r === 0 ? oct : `${oct} + ${FULL[r]}`;
  const t = pairTension(a, b, Math.min(a, b), o);
  return { semitones: semis, name, ic: ic(semis), ratio: `${num / g}:${den / g}`, cents: semis * 100, justCents: 1200 * Math.log2(num / den), tension: t, bucket: bucketOf(t) };
}

// [suffix, intervals above the root, prior]. The fifth may be omitted from chords of four or more tones.
const CHORDS: [string, number[], number][] = [
  ["", [0, 4, 7], 0.5], ["m", [0, 3, 7], 0.5], ["dim", [0, 3, 6], 0.3], ["aug", [0, 4, 8], 0.3],
  ["sus2", [0, 2, 7], 0.1], ["sus4", [0, 5, 7], 0.2], ["5", [0, 7], 0.2],
  ["6", [0, 4, 7, 9], 0], ["m6", [0, 3, 7, 9], 0], ["7", [0, 4, 7, 10], 0.4], ["maj7", [0, 4, 7, 11], 0.4], ["m7", [0, 3, 7, 10], 0.4],
  ["m(maj7)", [0, 3, 7, 11], 0.1], ["m7b5", [0, 3, 6, 10], 0.3], ["dim7", [0, 3, 6, 9], 0.3], ["7sus4", [0, 5, 7, 10], 0.2], ["7#5", [0, 4, 8, 10], 0.1],
  ["add9", [0, 2, 4, 7], 0.1], ["9", [0, 2, 4, 7, 10], 0.3], ["maj9", [0, 2, 4, 7, 11], 0.3], ["m9", [0, 2, 3, 7, 10], 0.3],
  ["6/9", [0, 2, 4, 7, 9], 0.2], ["7b9", [0, 1, 4, 7, 10], 0.1], ["7#9", [0, 3, 4, 7, 10], 0.1],
];

/** Bass-aware chord naming: exact pitch-class match, root in the bass preferred, slash chords for other basses. */
export function detectChord(pitches: number[], { flats = false }: { flats?: boolean } = {}) {
  const ps = distinct(pitches);
  const pcs = ps.map(pc);
  if (!pcs.length) return { name: "", root: null as number | null, quality: null as string | null, bass: -1, pcs };
  const bass = pcs[0];
  const nm = (p: number) => noteName(p, flats);

  let best: { score: number; root: number; suffix: string } | null = null;
  if (pcs.length >= 2) {
    for (const root of pcs) {
      const rel = new Set(pcs.map(p => pc(p - root)));
      for (const [suffix, iv, prior] of CHORDS) {
        const fifthOptional = iv.length >= 4 && iv.includes(7);
        const missing = iv.filter(i => !(fifthOptional && i === 7) && !rel.has(i));
        const extra = Array.from(rel).filter(i => !iv.includes(i));
        if (missing.length || extra.length) continue;
        if (suffix === "5" && root !== bass) continue;
        const score = prior + (root === bass ? 1.5 : 0) - (fifthOptional && !rel.has(7) ? 1.5 : 0);
        if (!best || score > best.score) best = { score, root, suffix };
      }
    }
  }
  if (best) {
    const { root, suffix } = best;
    return { name: nm(root) + suffix + (root !== bass ? `/${nm(bass)}` : ""), root, quality: suffix || "major", bass, pcs };
  }
  if (pcs.length === 1) return { name: nm(bass), root: bass, quality: null, bass, pcs };
  const name = pcs.length === 2
    ? `${nm(pcs[0])}–${nm(pcs[1])} (${FULL[pc(pcs[1] - bass)]})`
    : `Unknown: ${pcs.map(nm).join(" ")} (${pcs.slice(1).map(p => SHORT[pc(p - bass)]).join(", ")} above bass)`;
  return { name, root: null as number | null, quality: null as string | null, bass, pcs };
}
