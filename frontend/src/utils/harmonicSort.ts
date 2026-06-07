import type { TrackData } from '../services/api';

// Map Spotify key (0-11) and mode (0=Minor, 1=Major) to Camelot Notation
// Minor keys map to 'A', Major keys map to 'B'
export const getCamelotKey = (key: number, mode: number): string => {
  const minorMap: Record<number, string> = {
    0: '5A',  // C minor
    1: '12A', // C# minor
    2: '7A',  // D minor
    3: '2A',  // D# minor
    4: '9A',  // E minor
    5: '4A',  // F minor
    6: '11A', // F# minor
    7: '6A',  // G minor
    8: '1A',  // G# minor
    9: '8A',  // A minor
    10: '3A', // A# minor
    11: '10A',// B minor
  };

  const majorMap: Record<number, string> = {
    0: '8B',  // C major
    1: '3B',  // C# major
    2: '10B', // D major
    3: '5B',  // D# major
    4: '12B', // E major
    5: '7B',  // F major
    6: '2B',  // F# major
    7: '9B',  // G major
    8: '4B',  // G# major
    9: '11B', // A major
    10: '6B', // A# major
    11: '1B', // B major
  };

  return mode === 0 ? minorMap[key] || '8A' : majorMap[key] || '8B';
};

// Check if two Camelot keys are compatible for harmonic mixing
export const areKeysCompatible = (keyA: string, keyB: string): boolean => {
  if (keyA === keyB) return true;

  const numA = parseInt(keyA.slice(0, -1));
  const letterA = keyA.slice(-1);
  const numB = parseInt(keyB.slice(0, -1));
  const letterB = keyB.slice(-1);

  // Same letter, adjacent number (+/- 1, wrapping 12 to 1)
  if (letterA === letterB) {
    const diff = Math.abs(numA - numB);
    return diff === 1 || diff === 11;
  }

  // Different letters, same number (e.g. 8A to 8B)
  if (numA === numB) {
    return true;
  }

  return false;
};

export interface HarmonicSequenceItem {
  track: TrackData;
  transitionType: 'start' | 'harmonic' | 'tempo' | 'direct';
  camelotKey: string;
  tempoDiff?: number;
}

// Greedy nearest-neighbor harmonic sequencing
// Returns tracks reordered for optimal DJ flow
export const computeHarmonicSequence = (tracks: TrackData[]): HarmonicSequenceItem[] => {
  if (!tracks || tracks.length === 0) return [];

  const unsequenced = [...tracks];

  // Start with the highest energy track
  let currentIdx = 0;
  let maxEnergy = -1;
  for (let i = 0; i < unsequenced.length; i++) {
    if (unsequenced[i].features.energy > maxEnergy) {
      maxEnergy = unsequenced[i].features.energy;
      currentIdx = i;
    }
  }

  const sequence: HarmonicSequenceItem[] = [];

  // Add start track
  const startTrack = unsequenced.splice(currentIdx, 1)[0];
  const startCamelot = getCamelotKey(startTrack.features.key, startTrack.features.mode);
  sequence.push({
    track: startTrack,
    transitionType: 'start',
    camelotKey: startCamelot,
  });

  while (unsequenced.length > 0) {
    const lastItem = sequence[sequence.length - 1];
    const lastCamelot = lastItem.camelotKey;
    const lastTempo = lastItem.track.features.tempo;

    let bestNextIdx = -1;
    let bestNextScore = -999999;
    let transitionType: 'harmonic' | 'tempo' | 'direct' = 'direct';

    for (let i = 0; i < unsequenced.length; i++) {
      const candidate = unsequenced[i];
      const candidateCamelot = getCamelotKey(candidate.features.key, candidate.features.mode);
      const isCompatible = areKeysCompatible(lastCamelot, candidateCamelot);
      const tempoDiff = Math.abs(lastTempo - candidate.features.tempo);

      let score = 0;
      if (isCompatible) {
        score += 1000;
      }
      score -= tempoDiff * 5;

      if (score > bestNextScore) {
        bestNextScore = score;
        bestNextIdx = i;
        transitionType = isCompatible ? 'harmonic' : (tempoDiff < 15 ? 'tempo' : 'direct');
      }
    }

    if (bestNextIdx !== -1) {
      const nextTrack = unsequenced.splice(bestNextIdx, 1)[0];
      const nextCamelot = getCamelotKey(nextTrack.features.key, nextTrack.features.mode);
      const diff = Math.round(nextTrack.features.tempo - lastItem.track.features.tempo);

      sequence.push({
        track: nextTrack,
        transitionType,
        camelotKey: nextCamelot,
        tempoDiff: diff,
      });
    }
  }

  return sequence;
};

// Convenience: just return the reordered tracks (no metadata)
export const harmonicSortTracks = (tracks: TrackData[]): TrackData[] => {
  return computeHarmonicSequence(tracks).map(item => item.track);
};
