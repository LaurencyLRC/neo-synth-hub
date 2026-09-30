import React, { useState, useEffect, useCallback, useRef } from "react";
import { Info, Settings2, Eye, EyeOff, Circle, Triangle, Diamond, LayoutGrid, Activity, Layers } from "lucide-react";
import { consonanceBucket, noteVsSetBucket, detectChord, describeInterval, BUCKET_TEXT, bucketOf, setTension } from "./theory";

type Snap = { seq: Set<string>; chord: Set<string> };
const WAVES: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const CODE_TO_KEY: Record<string, string> = {
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backslash: "\\",
  Comma: ",", Period: ".", Semicolon: ";", Slash: "/", Enter: "enter", Escape: "escape",
};
const keyFromEvent = (e: KeyboardEvent) =>
  CODE_TO_KEY[e.code] ??
  (e.code.startsWith("Key") ? e.code.slice(3).toLowerCase()
    : e.code.startsWith("Digit") ? e.code.slice(5)
    : e.key.toLowerCase());

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const getNoteName = (index: number) => {
  return NOTE_NAMES[index % 12];
};

const DEFAULT_KEYS_EXTENDED = [
  "z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m",
  "q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u",
  "i", "8", "o", "9", "p", "0", "[", "-", "]", "=", "\\", "enter"
];

const getChordName = (idx: number[]) => detectChord(idx).name;


const COLORS = {
  neutral: "#ffffff",
  perfect: "#22d3ee",
  consonant: "#10b981",
  slightly: "#fbbf24",
  dissonant: "#ef4444"
};

const GLOW_CONFIG = {
  perfect: { outer: 80, inner: 40, icon: 16 },
  consonant: { outer: 55, inner: 25, icon: 10 },
  slightly: { outer: 35, inner: 15, icon: 6 },
  dissonant: { outer: 20, inner: 8, icon: 4 },
  neutral: { outer: 0, inner: 0, icon: 0 }
};

const getConsonanceType = consonanceBucket;
const getHarmonicTypeForSet = (t: number, held: number[]) => (held.length ? noteVsSetBucket(t, held) : "neutral");

export default function NeonSynthPad() {
  const [waveType, setWaveType] = useState<OscillatorType>("sawtooth");
  const [numNotes, setNumNotes] = useState(24);
  const [numSteps, setNumSteps] = useState(16);
  const [stepWidth, setStepWidth] = useState(48);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [disabledNotes, setDisabledNotes] = useState<Set<number>>(new Set());
  const [lastNotes, setLastNotes] = useState<number[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [pivotNote, setPivotNote] = useState<number | null>(null);
  const [octave, setOctave] = useState(4);
  const [keyBindings, setKeyBindings] = useState<string[][]>(DEFAULT_KEYS_EXTENDED.slice(0, 12).map(k => [k]));
  const [bindingIndex, setBindingIndex] = useState<number | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [hideDisabled, setHideDisabled] = useState(false);
  const [viewMode, setViewMode] = useState<"pad" | "roll">("pad");
  const [editTool, setEditTool] = useState<"draw" | "select" | "chord">("draw");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<{ s1: number; n1: number; s2: number; n2: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ ds: number; dn: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ s: number; n: number } | null>(null);
  const [sequencerNotes, setSequencerNotes] = useState<Set<string>>(new Set());
  const [chordNotes, setChordNotes] = useState<Set<string>>(new Set());
  const [chordVolumeDb, setChordVolumeDb] = useState(-5);

  const chordVolRef = useRef(chordVolumeDb);
  useEffect(() => { chordVolRef.current = chordVolumeDb; }, [chordVolumeDb]);
  const chordNotesRef = useRef(chordNotes);
  useEffect(() => { chordNotesRef.current = chordNotes; }, [chordNotes]);
  const seqNotesRef = useRef(sequencerNotes);
  useEffect(() => { seqNotesRef.current = sequencerNotes; }, [sequencerNotes]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [pasteAnchor, setPasteAnchor] = useState<number | null>(null);
  const [bpm, setBpm] = useState(120);
  const [hoveredCell, setHoveredCell] = useState<{ step: number; note: number } | null>(null);
  const [clipboard, setClipboard] = useState<{ relS: number; relN: number; absN: number; chord: boolean }[] | null>(null);
  const liveHoverRef = useRef<{ step: number; note: number } | null>(null);
  const [viewportSteps, setViewportSteps] = useState({ start: 0, end: 20 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [midiStatus, setMidiStatus] = useState<"unsupported" | "locked" | "connected" | "disconnected">("disconnected");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  const bpmRef = useRef(bpm);            bpmRef.current = bpm;
  const numStepsRef = useRef(numSteps);  numStepsRef.current = numSteps;
  const numNotesRef = useRef(numNotes);  numNotesRef.current = numNotes;
  const octaveRef = useRef(octave);      octaveRef.current = octave;
  const masterRef = useRef<GainNode | null>(null);
  const uiTimersRef = useRef(new Set<number>());
  const finishPointerRef = useRef<() => void>(() => {});
  const midiHeldRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!hasInteracted) return;
    if (!navigator.requestMIDIAccess) { setMidiStatus("unsupported"); return; }
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
      inputs.forEach(i => { i.onmidimessage = onMessage; });
      setMidiStatus(inputs.length ? "connected" : "disconnected");
    };

    navigator.requestMIDIAccess()
      .then(access => { if (cancelled) return; midi = access; midi.onstatechange = attach; attach(); })
      .catch(() => setMidiStatus("locked"));

    return () => {
      cancelled = true;
      if (midi) { midi.onstatechange = null; midi.inputs.forEach(i => { i.onmidimessage = null; }); }
    };
  }, [hasInteracted]);

  const renderedNoteIndices = React.useMemo(() => {
    return Array.from({ length: numNotes })
      .map((_, i) => i)
      .filter(i => !hideDisabled || !disabledNotes.has(i));
  }, [numNotes, hideDisabled, disabledNotes]);

  const inRange = useCallback((key: string) => {
    const [s, n] = key.split("-").map(Number);
    return s >= 0 && s < numSteps && n >= 0 && n < numNotes;
  }, [numSteps, numNotes]);

  const exportSequence = () => {
    const data = {
      version: 2,
      sequencerNotes: Array.from(sequencerNotes).filter(inRange),
      chordNotes: Array.from(chordNotes).filter(inRange),
      disabledNotes: Array.from(disabledNotes),
      keyBindings, waveType, chordVolumeDb, numSteps, numNotes, bpm, octave,
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
        if (!d || typeof d !== "object" || !Array.isArray(d.sequencerNotes)) throw new Error("missing sequencerNotes");
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
        setDisabledNotes(new Set<number>(Array.isArray(d.disabledNotes)
          ? d.disabledNotes.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < notes) : []));
        setSelectedKeys(new Set());
        setNumSteps(steps);
        setNumNotes(notes);
        setBpm(clampInt(d.bpm, 40, 240, 120));
        setOctave(clampInt(d.octave, 1, 8, 4));
        if (WAVES.includes(d.waveType)) setWaveType(d.waveType);
        if (typeof d.chordVolumeDb === "number") setChordVolumeDb(clampInt(d.chordVolumeDb, -6, -1, -5));
        if (Array.isArray(d.keyBindings) && d.keyBindings.every((b: unknown) => Array.isArray(b) && b.every(x => typeof x === "string")))
          setKeyBindings(d.keyBindings.slice(0, notes));
      } catch {
        window.alert("Couldn't open that file. It needs to be a NeonSynthPad sequence saved as .json.");
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
      if (pitchesAtStep[s].length > 0) { lastStepFound = s; break; }
    }
    let runningPrev = lastStepFound;
    for (let s = 0; s < numSteps; s++) {
      prevGlobalSteps[s] = runningPrev;
      if (pitchesAtStep[s].length > 0) runningPrev = s;
    }

    return { prevGlobalSteps, pitchesAtStep, firstStepWithNotes, bassAtStep, absoluteLastStep: lastStepFound };
  }, [sequencerNotes, numSteps, numNotes]);

  const rowHeight = renderedNoteIndices.length <= 18
    ? (528 / renderedNoteIndices.length)
    : (528 / 18);

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
  const oscillatorsRef = useRef<{ [key: number]: { osc: OscillatorNode; gain: GainNode; isChord: boolean } }>({});
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

  const getFreq = useCallback((index: number) => 261.63 * Math.pow(2, octave - 4 + index / 12), [octave]);

  const uiAt = useCallback((time: number | undefined, fn: () => void) => {
    const ctx = audioContextRef.current;
    const ms = time !== undefined && ctx ? (time - ctx.currentTime) * 1000 : 0;
    if (ms <= 4) { fn(); return; }
    const id = window.setTimeout(() => { uiTimersRef.current.delete(id); fn(); }, ms);
    uiTimersRef.current.add(id);
  }, []);

  const startNote = useCallback((index: number, sourceId: string, time?: number, volMul = 1.0, isChord = false) => {
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
  }, [disabledNotes, editMode, octave, getFreq, waveType, uiAt]);

  const stopNote = useCallback((index: number, sourceId: string, time?: number) => {
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
      uiAt(time, () => setActiveNotes(prev => { const next = new Set(prev); next.delete(index); return next; }));
    }
  }, [uiAt]);

  const startNoteRef = useRef(startNote);
  const stopNoteRef = useRef(stopNote);
  useEffect(() => {
    startNoteRef.current = startNote;
    stopNoteRef.current = stopNote;
  }, [startNote, stopNote]);

  const scheduleNote = useCallback((step: number, time: number) => {
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
  }, [stopNote, uiAt]);

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
    setClipboard(notes.map(x => ({ relS: x.s - a.s, relN: x.n - a.n, absN: x.n, chord: x.chord })));
  }, [selectedKeys, chordNotes]);

  const pasteSelection = useCallback((isKeyboard = false) => {
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
  }, [clipboard, pasteAnchor, numSteps, numNotes]);

  const cutSelection = useCallback(() => {
    copySelection();
    deleteSelectedNotes();
  }, [copySelection, deleteSelectedNotes]);

  const dragDelta = React.useMemo(() => {
    if (!dragOffset || selectedKeys.size === 0) return null;
    let s0 = Infinity, s1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    selectedKeys.forEach(k => {
      const [s, n] = k.split("-").map(Number);
      s0 = Math.min(s0, s); s1 = Math.max(s1, s);
      n0 = Math.min(n0, n); n1 = Math.max(n1, n);
    });
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    return { ds: clamp(dragOffset.ds, -s0, numSteps - 1 - s1), dn: clamp(dragOffset.dn, -n0, numNotes - 1 - n1) };
  }, [dragOffset, selectedKeys, numSteps, numNotes]);

  finishPointerRef.current = () => {
    if (isSelecting && selectionRect) {
      const sMin = Math.min(selectionRect.s1, selectionRect.s2), sMax = Math.max(selectionRect.s1, selectionRect.s2);
      const nMin = Math.min(selectionRect.n1, selectionRect.n2), nMax = Math.max(selectionRect.n1, selectionRect.n2);
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
      const visible = Array.from(moved.keys()).every(k => renderedNoteIndices.includes(Number(k.split("-")[1])));
      if (visible) {
        const next = new Set(Array.from(sequencerNotes).filter(k => !selectedKeys.has(k)));
        const nextChord = new Set(Array.from(chordNotes).filter(k => !selectedKeys.has(k)));
        moved.forEach((isChord, k) => { next.add(k); if (isChord) nextChord.add(k); else nextChord.delete(k); });
        setSequencerNotes(next);
        setChordNotes(nextChord);
        setSelectedKeys(new Set(moved.keys()));
      }
    }
    setIsSelecting(false); setIsDragging(false);
    setSelectionRect(null); setDragOffset(null); setDragStartPos(null);
  };

  useEffect(() => {
    const up = () => finishPointerRef.current();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const histRef = useRef<{ past: Snap[]; future: Snap[]; cur: Snap; skip: boolean }>({
    past: [], future: [], cur: { seq: sequencerNotes, chord: chordNotes }, skip: false,
  });
  useEffect(() => {
    const h = histRef.current;
    if (h.cur.seq === sequencerNotes && h.cur.chord === chordNotes) return;
    if (!h.skip) { h.past.push(h.cur); if (h.past.length > 100) h.past.shift(); h.future = []; }
    h.skip = false;
    h.cur = { seq: sequencerNotes, chord: chordNotes };
  }, [sequencerNotes, chordNotes]);

  const undo = useCallback(() => {
    const h = histRef.current, prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.cur); h.skip = true;
    setSequencerNotes(prev.seq); setChordNotes(prev.chord);
  }, []);
  const redo = useCallback(() => {
    const h = histRef.current, next = h.future.pop();
    if (!next) return;
    h.past.push(h.cur); h.skip = true;
    setSequencerNotes(next.seq); setChordNotes(next.chord);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest("input, textarea, select")) return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isMod) {
        if (key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (viewMode === "roll") {
          if (key === "c") { copySelection(); e.preventDefault(); return; }
          if (key === "v") { pasteSelection(true); e.preventDefault(); return; }
          if (key === "x") { cutSelection(); e.preventDefault(); return; }
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

          const existingNoteIdx = keyBindings.findIndex((keys, idx) => idx !== bindingIndex && keys.includes(newKey));

          if (existingNoteIdx !== -1) {
            setBindingError(`"${newKey.toUpperCase()}" already bound to ${getNoteName(existingNoteIdx)}`);
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
      const noteIndex = keyBindings.findIndex((keys, idx) => keys.includes(shortcutKey) && !disabledNotes.has(idx));
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
  }, [editMode, keyBindings, bindingIndex, disabledNotes, viewMode, selectedKeys, sequencerNotes, inRange,
   undo, redo, deleteSelectedNotes, copySelection, pasteSelection, cutSelection]);

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
        setChordNotes(c => { const n = new Set(c); n.delete(key); return n; });
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

  const getIntervalInfo = () => {
    const activeIndices = Array.from(activeNotes);
    const sequencedPitches = isPlaying ? stepMetadata.pitchesAtStep[currentStep] : [];
    if (activeIndices.length >= 3) {
      const chord = getChordName(activeIndices);
      const consonance = BUCKET_TEXT[bucketOf(setTension(activeIndices).tension)];
      return { name: chord, percentage: "Chord Mode", consonance, diff: activeIndices.length };
    }
    if (sequencedPitches.length >= 3) {
      const chord = getChordName(sequencedPitches);
      const consonance = BUCKET_TEXT[bucketOf(setTension(sequencedPitches).tension)];
      return { name: chord, percentage: "Chord Mode", consonance, diff: sequencedPitches.length };
    }

    let p1, p2;
    if (activeIndices.length === 2) {
      [p1, p2] = activeIndices;
    } else if (lastNotes.length >= 2) {
      [p1, p2] = lastNotes;
    } else {
      return null;
    }

    const d = describeInterval(p1, p2);
    return { name: d.name, percentage: `${d.ratio} · ${Math.round(d.cents)}¢`, consonance: BUCKET_TEXT[d.bucket], diff: d.semitones };
  };

  const interval = getIntervalInfo();

  const handleInteraction = () => {
    setHasInteracted(true);
    initAudio();
  };

  const startNumericDrag = useCallback((
    initialValue: number,
    setter: (val: number) => void,
    min: number,
    max: number,
    sensitivity = 5
  ) => (e: React.MouseEvent) => {
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
  }, []);

  const cellHover = hoveredCell && hoveredCell.note >= 0 ? hoveredCell : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4 font-mono select-none">
      {!hasInteracted && (
        <div
          onClick={handleInteraction}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center cursor-pointer group"
        >
          <div className="text-cyan-400 text-2xl font-black tracking-[0.4em] animate-pulse group-hover:scale-105 transition-transform text-center px-8">
            CLICK MOUSE BUTTON TO START
          </div>
          <div className="mt-6 text-zinc-500 text-[10px] uppercase tracking-[0.3em]">
            Interaction required for Audio & Keyboard
          </div>
        </div>
      )}

      {/* Interval Info Overlay */}
      <div className="absolute top-8 left-8 flex flex-col gap-2">
        <div className="p-4 bg-white/5 backdrop-blur-md rounded-lg border border-white/10 w-64">
          <div className="flex items-center gap-2 mb-2 text-zinc-400">
            <Info size={14} />
            <span className="text-[10px] uppercase tracking-widest">Last Interval</span>
          </div>
          {interval ? (
            <div>
              <div className="text-xl font-bold text-white leading-tight">{interval.name}</div>
              <div className="text-xs text-zinc-400 mt-1">
                {interval.diff} {interval.percentage === "Chord Mode" ? "Notes" : "semitones"} ({interval.percentage})
              </div>
              <div className={`text-[10px] uppercase mt-2 font-black tracking-tighter ${
                interval.consonance.includes("perfectly") ? "text-cyan-400" :
                interval.consonance === "consonant" ? "text-emerald-400" :
                interval.consonance === "slightly consonant" ? "text-amber-400" : "text-rose-500"
              }`}>
                {interval.consonance}
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500 italic">Play two notes...</div>
          )}
        </div>

        {clipboard && clipboard.length > 0 && (
          <div className="p-3 bg-cyan-500/10 backdrop-blur-md rounded-lg border border-cyan-500/20 w-64 flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_#22d3ee]" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-black text-cyan-400 tracking-[0.2em]">Clipboard</span>
              <span className="text-xs font-bold text-white leading-none">{clipboard.length} notes stored</span>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
        <div className="flex items-center gap-4">
          <div className={`flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1 transition-opacity ${viewMode === "pad" ? "opacity-20 pointer-events-none" : ""}`}>
            <button
              onClick={copySelection}
              disabled={selectedKeys.size === 0 || viewMode === "pad"}
              className={`px-2 py-1 rounded transition-colors text-[9px] font-bold ${selectedKeys.size > 0 ? "text-cyan-400 hover:bg-cyan-400/10" : "text-zinc-600 opacity-50"}`}
            >
              COPY
            </button>
            <button
              onClick={cutSelection}
              disabled={selectedKeys.size === 0 || viewMode === "pad"}
              className={`px-2 py-1 rounded transition-colors text-[9px] font-bold ${selectedKeys.size > 0 ? "text-cyan-400 hover:bg-cyan-400/10" : "text-zinc-600 opacity-50"}`}
            >
              CUT
            </button>
            <button
              onClick={() => pasteSelection(false)}
              disabled={!clipboard || viewMode === "pad"}
              className={`px-2 py-1 rounded transition-colors text-[9px] font-bold ${clipboard ? "text-emerald-400 hover:bg-emerald-400/10" : "text-zinc-600 opacity-50"}`}
            >
              PASTE
            </button>
            <div className="w-[1px] bg-white/10 mx-1 self-stretch" />
            <button
              onClick={deleteSelectedNotes}
              disabled={selectedKeys.size === 0 || viewMode === "pad"}
              className={`px-2 py-1 rounded transition-colors text-[9px] font-bold ${selectedKeys.size > 0 ? "text-rose-500 hover:bg-rose-500/10" : "text-zinc-600 opacity-50"}`}
            >
              DEL
            </button>
          </div>

          <div className={`flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1 transition-opacity ${viewMode === "pad" ? "opacity-20 pointer-events-none" : ""}`}>
            <button
              disabled={viewMode === "pad"}
              onClick={() => setEditTool("draw")}
              className={`p-2 rounded transition-all ${editTool === "draw" ? "bg-cyan-500 text-black" : "text-white hover:bg-white/10"}`}
              title="Draw Tool"
            >
              <Activity size={14} />
            </button>
            <button
              disabled={viewMode === "pad"}
              onClick={() => setEditTool("chord")}
              className={`p-2 rounded transition-all ${editTool === "chord" ? "bg-amber-500 text-black shadow-[0_0_10px_#f59e0b]" : "text-white hover:bg-white/10"}`}
              title="Chord Note Tool"
            >
              <Layers size={14} />
            </button>
            {editTool === "chord" && (
              <div className="flex flex-col items-center justify-center px-2 border-l border-white/10 ml-1 animate-in fade-in slide-in-from-left-1">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setChordVolumeDb(prev => Math.max(-6, prev - 1))}
                    className="w-4 h-4 flex items-center justify-center hover:bg-white/10 rounded text-[8px] font-black"
                  >-</button>
                  <span className="text-[9px] font-black text-amber-500 w-6 text-center">{chordVolumeDb}dB</span>
                  <button
                    onClick={() => setChordVolumeDb(prev => Math.min(-1, prev + 1))}
                    className="w-4 h-4 flex items-center justify-center hover:bg-white/10 rounded text-[8px] font-black"
                  >+</button>
                </div>
                <span className="text-[6px] uppercase font-bold text-zinc-500 tracking-tighter">Velocity</span>
              </div>
            )}
            <button
              disabled={viewMode === "pad"}
              onClick={() => setEditTool("select")}
              className={`p-2 rounded transition-all ${editTool === "select" ? "bg-cyan-500 text-black" : "text-white hover:bg-white/10"}`}
              title="Select Tool"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          <div className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1 rounded transition-colors text-xs font-bold ${isPlaying ? "text-rose-500 bg-rose-500/10" : "text-emerald-500 bg-emerald-500/10"}`}
            >
              {isPlaying ? "STOP" : "PLAY"}
            </button>
          </div>

          <div
            onMouseDown={startNumericDrag(numNotes, setNumNotes, 1, 60, 15)}
            onWheel={(e) => {
              if (e.deltaY < 0) setNumNotes(prev => Math.min(60, prev + 1));
              else setNumNotes(prev => Math.max(1, prev - 1));
            }}
            className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1 cursor-ns-resize"
          >
            <div className="px-3 py-1 text-[8px] uppercase font-black text-zinc-500 self-center">Span</div>
            <button onClick={() => setNumNotes(prev => Math.max(1, prev - 1))} className="px-3 py-1 hover:bg-white/10 rounded text-xs font-bold">-</button>
            <div className="px-3 py-1 text-xs font-bold text-white border-x border-white/10 min-w-[3rem] text-center">{numNotes}</div>
            <button onClick={() => setNumNotes(prev => Math.min(60, prev + 1))} className="px-3 py-1 hover:bg-white/10 rounded text-xs font-bold">+</button>
          </div>

          <div className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1">
            <button onClick={() => setOctave(prev => Math.max(1, prev - 1))} className="px-3 py-1 hover:bg-white/10 rounded text-xs font-bold">OCT-</button>
            <div className="px-3 py-1 text-xs font-bold text-cyan-400 border-x border-white/10">C{octave}</div>
            <button onClick={() => setOctave(prev => Math.min(8, prev + 1))} className="px-3 py-1 hover:bg-white/10 rounded text-xs font-bold">OCT+</button>
          </div>

          <button onClick={() => setViewMode(viewMode === "pad" ? "roll" : "pad")} className={`p-3 rounded-full transition-all ${viewMode === "roll" ? "bg-purple-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"}`}>
            {viewMode === "roll" ? <LayoutGrid size={20} /> : <Activity size={20} />}
          </button>

          <button
            onClick={() => setHideDisabled(!hideDisabled)}
            className={`p-3 rounded-full transition-all ${hideDisabled ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]" : "bg-white/10 hover:bg-white/20 text-white"}`}
            title={hideDisabled ? "Show Disabled Keys" : "Hide Disabled Keys"}
          >
            {hideDisabled ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>

          <button
            disabled={viewMode === "roll"}
            onClick={() => { setEditMode(!editMode); setBindingIndex(null); }}
            className={`p-3 rounded-full transition-all ${viewMode === "roll" ? "opacity-20 cursor-not-allowed" : (editMode ? "bg-white text-black ring-4 ring-white/20 shadow-[0_0_20px_rgba(255,255,255,0.4)]" : "bg-white/10 hover:bg-white/20")}`}
            title="Edit Key Bindings"
          >
            <Settings2 size={20} />
          </button>

          <div className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1">
            <button onClick={exportSequence} className="px-3 py-1 hover:bg-white/10 rounded text-[10px] font-bold text-zinc-400">EXP</button>
            <label className="px-3 py-1 hover:bg-white/10 rounded text-[10px] font-bold text-zinc-400 cursor-pointer">IMP<input type="file" accept=".json" onChange={importSequence} className="hidden" /></label>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 transition-all ${midiStatus === "connected" ? "border-cyan-500/50 bg-cyan-500/5" : ""}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              midiStatus === "connected" ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" :
              midiStatus === "unsupported" ? "bg-zinc-700" : "bg-zinc-500"
            }`} />
            <span className="text-[9px] font-black uppercase tracking-tighter text-zinc-400">
              MIDI: {midiStatus}
            </span>
          </div>
        </div>

        <div className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/10 p-1">
          {WAVES.map((t) => (
            <button
              key={t}
              onClick={() => setWaveType(t)}
              className={`px-3 py-1 rounded text-[8px] font-black uppercase transition-all ${
                waveType === t ? "bg-cyan-500 text-black shadow-[0_0_10px_#22d3ee]" : "text-zinc-500 hover:text-white"
              }`}
            >
              {t === "sawtooth" ? "SAW" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      {viewMode === "pad" ? (
        <div className="relative w-full max-w-[98vw] h-[500px] flex items-end gap-1 px-16 pb-16 overflow-x-auto md:overflow-x-visible no-scrollbar">
          {Array.from({ length: numNotes })
            .map((_, i) => i)
            .filter(i => !hideDisabled || !disabledNotes.has(i))
            .map((i) => {
              const isDisabled = disabledNotes.has(i);
              const isActive = activeNotes.has(i);
              const noteName = getNoteName(i);
              const isBinding = bindingIndex === i;
              const activeIndices = activeNotes.size > 0 ? Array.from(activeNotes) : (pivotNote !== null ? [pivotNote] : []);
              const type = getHarmonicTypeForSet(i, activeIndices);
              const displayColor = COLORS[type as keyof typeof COLORS] || COLORS.neutral;
              const glow = GLOW_CONFIG[type as keyof typeof GLOW_CONFIG] || GLOW_CONFIG.neutral;

              const renderShape = () => {
                if (activeIndices.length === 0) return null;
                const baseIconSize = Math.max(12, Math.min(40, 480 / numNotes));
                const baseDotSize = Math.max(4, Math.min(12, 144 / numNotes));
                const containerClass = "absolute left-0 right-0 bottom-[110px] h-[60px] flex items-center justify-center pointer-events-none z-0";

                const iconProps = {
                  size: baseIconSize,
                  className: "opacity-70 transition-all duration-300",
                  fill: "currentColor",
                  style: {
                    filter: `drop-shadow(0 0 ${glow.icon}px currentColor)`
                  }
                };

                switch(type) {
                  case "perfect":
                    return (
                      <div className={containerClass}>
                        <Diamond {...iconProps} className={`${iconProps.className} text-cyan-400`} />
                      </div>
                    );
                  case "consonant":
                    return (
                      <div className={containerClass}>
                        <Circle {...iconProps} className={`${iconProps.className} text-emerald-400`} />
                      </div>
                    );
                  case "slightly":
                    return (
                      <div className={containerClass}>
                        <Triangle {...iconProps} className={`${iconProps.className} text-amber-400`} />
                      </div>
                    );
                  case "dissonant":
                    return (
                      <div className={containerClass}>
                        <div
                          style={{
                            width: `${baseDotSize}px`,
                            height: `${baseDotSize}px`,
                            boxShadow: `0 0 ${glow.icon * 2}px #f43f5e`
                          }}
                          className="bg-rose-500 rounded-full animate-pulse"
                        />
                      </div>
                    );
                  default: return null;
                }
              };

              return (
                <div key={i}
                  onMouseDown={() => !editMode && startNote(i, "mouse")}
                  onMouseEnter={(e) => !editMode && e.buttons === 1 && startNote(i, "mouse")}
                  onMouseUp={() => !editMode && stopNote(i, "mouse")}
                  onMouseLeave={() => !editMode && stopNote(i, "mouse")}
                  onTouchStart={(e) => { e.preventDefault(); if(!editMode) startNote(i, "touch"); }}
                  onTouchEnd={(e) => { e.preventDefault(); if(!editMode) stopNote(i, "touch"); }}
                  onClick={() => { if (editMode) { if (bindingIndex === i) toggleNoteDisabled(i); else setBindingIndex(i); } }}
                  style={{
                    backgroundColor: isDisabled ? "transparent" : (isActive ? displayColor : "transparent"),
                    borderColor: isBinding ? "#fff" : (isDisabled ? "rgba(255,255,255,0.05)" : displayColor),
                    boxShadow: isActive ? `0 0 ${glow.outer}px ${displayColor}, inset 0 0 ${glow.inner}px ${displayColor}` : (isBinding ? '0 0 25px #fff' : 'none'),
                    opacity: isDisabled ? 0.2 : (pivotNote === null ? 0.4 : 1),
                    height: `${60 + ((i % 12) * 3)}%`,
                  }}
                  className={`relative rounded-sm border-2 transition-all duration-300 flex-shrink-0 w-12 md:w-auto md:flex-1 md:min-w-0 ${isBinding ? "z-10 scale-110 ring-4 ring-white/20" : ""} ${editMode ? "cursor-pointer" : "cursor-crosshair"} overflow-hidden`}
                >
                  {renderShape()}
                  <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center pointer-events-none z-10 px-1">
                    <span className={`text-[10px] font-bold ${isActive ? "text-black" : (isDisabled ? "text-zinc-700" : "text-white")}`}>{noteName}</span>
                    {isBinding ? (
                      <>
                        <span className={`text-[7px] mt-0.5 font-black text-center uppercase ${bindingError ? "text-rose-500" : "text-cyan-400 animate-pulse"}`}>
                          {bindingError || "PRESS KEY"}
                        </span>
                        <span className="text-[7px] font-black text-center text-zinc-400 uppercase break-all leading-none">
                          {keyBindings[i]?.join(" ")}
                        </span>
                      </>
                    ) : (
                      <span className={`text-[7px] mt-0.5 font-black text-center break-all leading-[0.8] ${isActive ? "text-black" : (isDisabled ? "text-zinc-800" : "text-zinc-500")}`}>
                        {isDisabled ? "OFF" : keyBindings[i]?.join(" ").toUpperCase()}
                      </span>
                    )}
                  </div>
                  {editMode && !isBinding && !isDisabled && (
                    <div className="absolute inset-0 bg-white/5 hover:bg-white/10 transition-colors pointer-events-none" />
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="relative w-full max-w-5xl h-[600px] bg-white/5 rounded-xl border border-white/10 overflow-hidden flex flex-col">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-black/20"
              ref={scrollRef}
              onScroll={updateViewport}
              onMouseLeave={() => setHoveredCell(null)}
              onMouseMove={(e) => {
                if (!scrollRef.current) return;
                const rect = scrollRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left + scrollRef.current.scrollLeft - 48;
                const y = e.clientY - rect.top;

                const scrollY = scrollRef.current.scrollTop;
                const totalContentHeight = renderedNoteIndices.length * rowHeight;
                const pianoRollTop = 32;

                const step = Math.floor(x / stepWidth);
                const renderedIdx = Math.floor((totalContentHeight - (y + scrollY - pianoRollTop)) / rowHeight);
                const note = renderedNoteIndices[renderedIdx];

                if (step >= 0 && step < numSteps && renderedIdx >= 0 && renderedIdx < renderedNoteIndices.length) {
                  liveHoverRef.current = { step, note };
                }

                if (isSelecting) {
                  setSelectionRect(prev => prev ? { ...prev, s2: step, n2: renderedIdx } : null);
                } else if (isDragging && dragStartPos && note !== undefined) {
                  setDragOffset({ ds: step - dragStartPos.s, dn: note - dragStartPos.n });
                }
              }}
            >
              <div className="flex flex-col-reverse min-w-max min-h-full relative" style={{ width: `${numSteps * stepWidth + 48}px` }}>
                {/* Visual Marquee Rectangle */}
                {selectionRect && (
                  <div
                    style={{
                      left: `${Math.min(selectionRect.s1, selectionRect.s2) * stepWidth + 48}px`,
                      bottom: `${Math.min(selectionRect.n1, selectionRect.n2) * rowHeight}px`,
                      width: `${(Math.abs(selectionRect.s2 - selectionRect.s1) + 1) * stepWidth}px`,
                      height: `${(Math.abs(selectionRect.n2 - selectionRect.n1) + 1) * rowHeight}px`,
                      zIndex: 40
                    }}
                    className="absolute bg-cyan-500/20 border-2 border-cyan-500/50 pointer-events-none"
                  />
                )}

                {Array.from({ length: renderedNoteIndices.length }).map((_, renderedIdx) => {
                  const noteIdx = renderedNoteIndices[renderedIdx];
                  const isDisabled = disabledNotes.has(noteIdx);
                  return (
                    <div key={noteIdx} style={{ height: `${rowHeight}px` }} className={`flex border-b border-white/5 group shrink-0 ${isDisabled ? "opacity-25 grayscale pointer-events-none" : ""}`}>
                      <div className="sticky left-0 w-12 h-full flex items-center justify-center text-[10px] font-bold border-r border-white/10 bg-zinc-950/90 backdrop-blur-sm z-50 shrink-0 text-zinc-600 group-hover:text-zinc-300">
                        {getNoteName(noteIdx)}
                      </div>
                      <div style={{ width: `${Math.min(viewportSteps.start, numSteps) * stepWidth}px` }} className="flex-shrink-0 h-full pointer-events-none" />
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
                          const isHovered = !isTouchDevice && cellHover?.step === stepIdx && cellHover?.note === noteIdx;

                          const prevRealStep = stepMetadata.prevGlobalSteps[stepIdx];
                          let displayHeaderColor = null;
                          let isHeaderIntercepted = false;

                          let propagationHintColor = null;
                          let isPropagationStart = false;
                          if (stepMetadata.absoluteLastStep !== -1 && stepIdx > stepMetadata.absoluteLastStep) {
                            const lastBass = stepMetadata.bassAtStep[stepMetadata.absoluteLastStep];
                            const type = getConsonanceType(noteIdx - lastBass);
                            propagationHintColor = COLORS[type as keyof typeof COLORS];
                            isPropagationStart = stepIdx === stepMetadata.absoluteLastStep + 1;
                          }

                          if (isSet && !hasPrev) {
                            if (!isTouchDevice && cellHover && cellHover.step !== stepIdx) {
                               const distToPrev = prevRealStep === -1 ? Infinity : (stepIdx - prevRealStep + numSteps) % numSteps;
                               const distToHover = (stepIdx - cellHover.step + numSteps) % numSteps;
                               const trueDistToPrev = distToPrev === 0 ? numSteps : distToPrev;
                               const trueDistToHover = distToHover === 0 ? numSteps : distToHover;

                               if (trueDistToHover <= trueDistToPrev) {
                                 const type = getConsonanceType(noteIdx - cellHover.note);
                                 displayHeaderColor = COLORS[type as keyof typeof COLORS] || COLORS.perfect;
                                 isHeaderIntercepted = true;
                               }
                            }
                            if (!isHeaderIntercepted) {
                              if (prevRealStep !== -1) {
                                const currentBass = stepMetadata.bassAtStep[stepIdx];
                                const prevBass = stepMetadata.bassAtStep[prevRealStep];
                                const type = getConsonanceType(currentBass - prevBass);
                                displayHeaderColor = COLORS[type as keyof typeof COLORS] || COLORS.perfect;
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
                               ghostHeaderColor = COLORS[type as keyof typeof COLORS] || COLORS.perfect;
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
                             if (!isTouchDevice && editTool === "draw" && cellHover && cellHover.step === stepIdx && cellHover.note !== noteIdx) {
                                const type = getConsonanceType(noteIdx - cellHover.note);
                                noteInternalLineColor = COLORS[type as keyof typeof COLORS];
                             } else {
                                const othersInChord = stepMetadata.pitchesAtStep[stepIdx].filter(p => p !== noteIdx);
                                if (othersInChord.length > 0) {
                                    const type = getHarmonicTypeForSet(noteIdx, stepMetadata.pitchesAtStep[stepIdx]);
                                    noteInternalLineColor = COLORS[type as keyof typeof COLORS];
                                } else {
                                    noteInternalLineColor = null;
                                }
                             }
                          }

                          return (
                            <div key={stepIdx}
                              onMouseDown={(e) => {
                                if (editTool === "select") {
                                  if (isSet && isSelected) {
                                    setIsDragging(true);
                                    setDragStartPos({ s: stepIdx, n: noteIdx });
                                  } else {
                                    setIsSelecting(true);
                                    setSelectionRect({ s1: stepIdx, n1: renderedIdx, s2: stepIdx, n2: renderedIdx });
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
                              className={`flex-shrink-0 border-r border-white/5 cursor-pointer relative overflow-visible ${isCurrent ? "bg-white/5" : (pasteAnchor === stepIdx ? "bg-purple-500/5" : "")} ${!isTouchDevice ? "hover:bg-white/10" : ""}`}
                            >
                              {pasteAnchor === stepIdx && (
                                <div className="absolute inset-y-0 left-0 w-[1px] bg-purple-500/30 pointer-events-none z-0" />
                              )}
                              {propagationHintColor && (
                                <div
                                  style={{
                                    background: isPropagationStart
                                      ? `linear-gradient(to right, ${propagationHintColor}44, ${propagationHintColor})`
                                      : propagationHintColor,
                                    opacity: 0.12,
                                    zIndex: 1,
                                    left: isPropagationStart ? "3px" : "-1px",
                                    borderTopLeftRadius: isPropagationStart ? "2px" : "0px",
                                    borderBottomLeftRadius: isPropagationStart ? "2px" : "0px"
                                  }}
                                  className="absolute inset-y-1 right-0 pointer-events-none transition-colors duration-300"
                                />
                              )}
                              {isDragging && dragDelta && isSelected && (() => {
                                const t = renderedNoteIndices.indexOf(noteIdx + dragDelta.dn);
                                return t < 0 ? null : (
                                  <div
                                    style={{
                                      backgroundColor: "#fff",
                                      opacity: 0.3,
                                      left: `${dragDelta.ds * stepWidth}px`,
                                      bottom: `${(t - renderedIdx) * rowHeight}px`,
                                      width: `${stepWidth}px`,
                                      height: `${rowHeight - 2}px`,
                                      zIndex: 40
                                    }}
                                    className="absolute pointer-events-none rounded-sm ring-1 ring-white"
                                  />
                                );
                              })()}

                              {isSet && (
                                <>
                                  <div
                                    style={{
                                      backgroundColor: isSelected ? "#71717a" : (isChord ? "#18181b" : "#3f3f46"),
                                      left: hasPrev ? "-1px" : "2px",
                                      right: hasNext ? "-1px" : "3px",
                                      zIndex: 5,
                                      borderTopLeftRadius: hasPrev ? 0 : "2px",
                                      borderBottomLeftRadius: hasPrev ? 0 : "2px",
                                      borderTopRightRadius: hasNext ? 0 : "2px",
                                      borderBottomRightRadius: hasNext ? 0 : "2px",
                                      boxShadow: isSelected ? "0 0 15px rgba(255,255,255,0.3)" : (isChord ? "none" : "none"),
                                      border: isChord ? "1px dashed rgba(255,255,255,0.2)" : "none",
                                      opacity: isChord ? 0.7 : 1
                                    }}
                                    className={`absolute top-1 bottom-1 ${isSelected ? "ring-1 ring-white/50" : ""}`}
                                  />
                                  <div
                                    style={{
                                        backgroundColor: noteInternalLineColor || "transparent",
                                        height: isChord ? '1px' : '3px',
                                        left: hasPrev ? "-1px" : "6px",
                                        right: hasNext ? "-1px" : "7px",
                                        top: '50%',
                                        zIndex: 10,
                                        boxShadow: (noteInternalLineColor && !isChord) ? `0 0 10px ${noteInternalLineColor}` : 'none',
                                        opacity: isChord ? 0.4 : 1
                                    }}
                                    className="absolute pointer-events-none transition-colors duration-150 -translate-y-1/2"
                                  />
                                  {displayHeaderColor && (
                                    <div style={{ backgroundColor: displayHeaderColor, boxShadow: (isHeaderIntercepted || !isChord) ? `0 0 15px ${displayHeaderColor}` : `none`, width: isHeaderIntercepted ? '6px' : '4px', left: isHeaderIntercepted ? '-1px' : '2px', zIndex: 10, opacity: isChord ? 0.5 : 1 }} className="absolute top-1 bottom-1 rounded-l-sm">
                                      {stepIdx === stepMetadata.firstStepWithNotes && <div className="absolute inset-y-0 left-0 w-[2px] bg-white shadow-[0_0_8px_#fff] animate-pulse" />}
                                    </div>
                                  )}
                                </>
                              )}
                              {!isTouchDevice && editTool === "draw" && isHovered && !isSet && (
                                <>
                                  <div style={{ backgroundColor: "#09090b", left: '2px', right: '3px', borderRadius: '2px', zIndex: 5 }} className="absolute top-1 bottom-1" />
                                  <div
                                    style={{
                                        backgroundColor: ghostLineColor || "transparent",
                                        height: '3px',
                                        left: '6px',
                                        right: '7px',
                                        top: '50%',
                                        zIndex: 10,
                                        boxShadow: ghostLineColor ? `0 0 10px ${ghostLineColor}` : 'none'
                                    }}
                                    className="absolute pointer-events-none -translate-y-1/2"
                                  />
                                  <div
                                    style={{
                                      backgroundColor: ghostHeaderColor || "transparent",
                                      boxShadow: ghostHeaderColor ? `0 0 15px ${ghostHeaderColor}` : "none",
                                      width: '4px', left: '2px', zIndex: 10
                                    }}
                                    className="absolute top-1 bottom-1 rounded-l-sm animate-pulse"
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

                {/* Piano Roll Header */}
                <div className="h-8 border-b border-white/10 flex bg-black/80 backdrop-blur-sm z-[100] sticky top-0 shrink-0">
                  <div className="w-12 border-r border-white/10 shrink-0 bg-black sticky left-0 z-[110]" />
                  {Array.from({ length: numSteps }).map((_, i) => (
                    <div key={i}
                      onClick={() => {
                        setPasteAnchor(i);
                        if (!isPlaying) {
                          currentStepRef.current = i;
                          setCurrentStep(i);
                        }
                      }}
                      onMouseEnter={() => !isTouchDevice && setHoveredCell(prev => ({ step: i, note: prev?.note ?? -1 }))}
                      onMouseLeave={() => !isTouchDevice && setHoveredCell(null)}
                      style={{ width: `${stepWidth}px` }}
                      className={`flex-shrink-0 h-full flex items-center justify-center text-[10px] font-bold border-r border-white/5 transition-colors cursor-pointer relative ${
                        currentStep === i
                          ? "bg-cyan-500/20 text-cyan-400"
                          : (pasteAnchor === i ? "bg-purple-500/20 text-purple-400" : (hoveredCell?.step === i ? "text-zinc-300 bg-white/5" : "text-zinc-600"))
                      }`}
                    >
                      {i + 1}
                      {pasteAnchor === i && (
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-500 shadow-[0_0_8px_#a855f7]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 bg-black/60 border-t border-white/10 z-40">
              <div
                onMouseDown={startNumericDrag(numSteps, setNumSteps, 4, 1024, 10)}
                onWheel={(e) => {
                  if (e.deltaY < 0) setNumSteps(prev => Math.min(1024, prev + 4));
                  else setNumSteps(prev => Math.max(4, prev - 4));
                }}
                className="flex bg-white/5 backdrop-blur-md rounded-lg border border-white/5 p-0.5 cursor-ns-resize"
              >
                <button onClick={() => setNumSteps(prev => Math.max(4, prev - 4))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full text-[10px] font-bold text-white">-</button>
                <div className="w-8 h-6 flex items-center justify-center text-[10px] font-bold text-purple-400">{numSteps}</div>
                <button onClick={() => setNumSteps(prev => Math.min(1024, prev + 4))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full text-[10px] font-bold text-white">+</button>
              </div>
              <div className="flex bg-zinc-900/90 backdrop-blur-md rounded-full border border-white/5 p-0.5 shadow-2xl overflow-hidden">
                <button onClick={() => setStepWidth(prev => Math.max(12, prev - 4))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full text-[10px] font-bold text-white">-</button>
                <div className="px-2 py-1 text-[7px] uppercase font-black text-zinc-500 self-center">Zoom</div>
                <button onClick={() => setStepWidth(prev => Math.min(64, prev + 4))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full text-[10px] font-bold text-white">+</button>
              </div>
              <div
                onMouseDown={startNumericDrag(bpm, setBpm, 40, 240, 3)}
                onWheel={(e) => {
                  if (e.deltaY < 0) setBpm(prev => Math.min(240, prev + 1));
                  else setBpm(prev => Math.max(40, prev - 1));
                }}
                className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md rounded-full border border-white/5 p-0.5 pr-3 shadow-2xl transition-all hover:bg-zinc-800 cursor-ns-resize"
              >
                <div className="w-8 h-6 flex items-center justify-center text-[10px] font-black text-emerald-500 border-r border-white/5 mr-1">{bpm}</div>
                <input type="range" min="40" max="240" value={bpm}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.currentTarget.blur()}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  className="w-40 accent-emerald-500 h-0.5 bg-white/10 rounded-lg appearance-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === "pad" && (
        <div className="mt-12 flex items-center justify-center w-full max-w-5xl px-4 text-zinc-500 text-[10px] uppercase tracking-[0.2em] text-center">
          {editMode ? "Click a pad to start rebinding its key • Click again to disable" : "Click and hold or use keyboard to play"}
        </div>
      )}
    </div>
  );
}