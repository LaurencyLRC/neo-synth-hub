import { describe, it, expect } from "vitest";
import { bucketOf, consonanceBucket, describeInterval, detectChord, pairTension, setTension, noteVsSetBucket } from "./theory";

describe("detectChord", () => {
  const corpus: [string, number[], string][] = [
    ["Am7 with A in the bass", [9, 12, 16, 19], "Am7"],
    ["same notes with C in the bass", [0, 4, 7, 9], "C6"],
    ["Am7/E", [4, 7, 9, 12], "Am7/E"],
    ["C/E", [4, 7, 12], "C/E"],
    ["C5 with the root doubled", [0, 7, 12], "C5"],
    ["Csus4", [0, 5, 7], "Csus4"],
    ["C7", [0, 4, 7, 10], "C7"],
    ["Cmaj9", [0, 4, 7, 11, 14], "Cmaj9"],
    ["C6/9", [0, 4, 7, 9, 14], "C6/9"],
    ["Dm7b5", [2, 5, 8, 12], "Dm7b5"],
    ["octave-doubled dyad", [0, 4, 12], "C–E (major 3rd)"],
  ];
  it.each(corpus)("%s", (_label, pitches, name) => expect(detectChord(pitches).name).toBe(name));
  it("spells with flats on request", () => expect(detectChord([10, 14, 17], { flats: true }).name).toBe("Bb"));
  it("lists pitch classes instead of 'Cluster'", () => expect(detectChord([0, 1, 2]).name).toMatch(/^Unknown: C C# D/));
});

describe("consonance model", () => {
  it("scores an interval and its inversion alike", () => {
    for (let d = 0; d <= 12; d++) expect(pairTension(0, d)).toBe(pairTension(0, 12 - d));
  });
  it("ignores octave and transposition", () => {
    for (let d = 0; d < 12; d++) {
      expect(pairTension(0, d + 12)).toBe(pairTension(0, d));
      expect(pairTension(3, 3 + d)).toBe(pairTension(0, d));
    }
  });
  it("keeps the heatmap buckets", () => {
    expect([0, 5, 7].map(consonanceBucket)).toEqual(["perfect", "perfect", "perfect"]);
    expect([3, 4, 8, 9].map(consonanceBucket)).toEqual(Array(4).fill("consonant"));
    expect([2, 10].map(consonanceBucket)).toEqual(["slightly", "slightly"]);
    expect([1, 6, 11].map(consonanceBucket)).toEqual(Array(3).fill("dissonant"));
  });
  it("does not call a dominant 7th dissonant, but does flag a cluster", () => {
    expect(bucketOf(setTension([0, 4, 7, 10]).tension)).not.toBe("dissonant");
    expect(bucketOf(setTension([0, 1, 2]).tension)).toBe("dissonant");
  });
  it("applies the P4 stance only above the bass", () => {
    const o = { p4: "bass-dissonant" as const };
    expect(pairTension(0, 5, 0, o)).toBeGreaterThan(pairTension(0, 5, -12, o));
  });
  it("scores active notes in a minor second as dissonant, avoiding self-unison dilution", () => {
    expect(noteVsSetBucket(0, [0, 1])).toBe("dissonant");
    expect(noteVsSetBucket(1, [0, 1])).toBe("dissonant");
    expect(noteVsSetBucket(0, [0])).toBe("perfect");
  });
});

describe("describeInterval", () => {
  it("reports just ratio and cents", () => {
    const fifth = describeInterval(0, 7);
    expect(fifth.ratio).toBe("3:2");
    expect(Math.round(fifth.justCents)).toBe(702);
    expect(describeInterval(0, 19).ratio).toBe("3:1");
  });
});
