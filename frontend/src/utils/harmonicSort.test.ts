import { describe, it, expect } from 'vitest';
import { getCamelotKey, areKeysCompatible, computeHarmonicSequence, harmonicSortTracks } from './harmonicSort';
import type { TrackData } from '../services/api';

describe('harmonicSort Utilities', () => {
  describe('getCamelotKey', () => {
    it('should map Spotify key and mode correctly to Camelot notation', () => {
      expect(getCamelotKey(0, 0)).toBe('5A');
      expect(getCamelotKey(0, 1)).toBe('8B');
      expect(getCamelotKey(9, 0)).toBe('8A');
      expect(getCamelotKey(11, 1)).toBe('1B');
    });

    it('should fallback to default keys for invalid values', () => {
      expect(getCamelotKey(-1, 0)).toBe('8A');
      expect(getCamelotKey(15, 1)).toBe('8B');
    });
  });

  describe('areKeysCompatible', () => {
    it('should recognize identical keys as compatible', () => {
      expect(areKeysCompatible('8A', '8A')).toBe(true);
      expect(areKeysCompatible('12B', '12B')).toBe(true);
    });

    it('should recognize adjacent keys of same mode as compatible', () => {
      expect(areKeysCompatible('8A', '9A')).toBe(true);
      expect(areKeysCompatible('8A', '7A')).toBe(true);
      expect(areKeysCompatible('12A', '1A')).toBe(true);
      expect(areKeysCompatible('1A', '12A')).toBe(true);
    });

    it('should recognize same number different mode as compatible', () => {
      expect(areKeysCompatible('8A', '8B')).toBe(true);
      expect(areKeysCompatible('12B', '12A')).toBe(true);
    });

    it('should reject incompatible keys', () => {
      expect(areKeysCompatible('8A', '10A')).toBe(false);
      expect(areKeysCompatible('8A', '9B')).toBe(false);
      expect(areKeysCompatible('12A', '2A')).toBe(false);
    });
  });

  describe('computeHarmonicSequence', () => {
    const mockTracks: TrackData[] = [
      {
        id: 'track1',
        name: 'Track 1',
        uri: 'spotify:track:1',
        artists: 'Artist A',
        album_images: [],
        cluster: 0,
        x: 0,
        y: 0,
        coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
        popularity: 50,
        release_date: '2020-01-01',
        duration_ms: 180000,
        features: {
          key: 0,
          mode: 1,
          energy: 0.5,
          tempo: 120.0,
          valence: 0.5,
          acousticness: 0.1,
          danceability: 0.6,
          instrumentalness: 0,
          speechiness: 0,
          liveness: 0.1,
          mode_raw: 1,
          key_raw: 0
        },
        genres: []
      },
      {
        id: 'track2',
        name: 'Track 2',
        uri: 'spotify:track:2',
        artists: 'Artist B',
        album_images: [],
        cluster: 0,
        x: 0,
        y: 0,
        coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
        popularity: 60,
        release_date: '2021-01-01',
        duration_ms: 200000,
        features: {
          key: 0,
          mode: 1,
          energy: 0.9,
          tempo: 122.0,
          valence: 0.6,
          acousticness: 0.2,
          danceability: 0.7,
          instrumentalness: 0,
          speechiness: 0,
          liveness: 0.1
        },
        genres: []
      },
      {
        id: 'track3',
        name: 'Track 3',
        uri: 'spotify:track:3',
        artists: 'Artist C',
        album_images: [],
        cluster: 0,
        x: 0,
        y: 0,
        coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
        popularity: 40,
        release_date: '2019-01-01',
        duration_ms: 150000,
        features: {
          key: 5,
          mode: 1,
          energy: 0.7,
          tempo: 121.0,
          valence: 0.4,
          acousticness: 0.3,
          danceability: 0.5,
          instrumentalness: 0.1,
          speechiness: 0.05,
          liveness: 0.2
        },
        genres: []
      }
    ];

    it('should return empty array for empty tracks input', () => {
      expect(computeHarmonicSequence([])).toEqual([]);
    });

    it('should order tracks starting with the highest energy track', () => {
      const sequence = computeHarmonicSequence(mockTracks);
      expect(sequence.length).toBe(3);
      expect(sequence[0].track.id).toBe('track2');
      expect(sequence[0].transitionType).toBe('start');
    });

    it('should sequence remaining tracks harmonically', () => {
      const sequence = computeHarmonicSequence(mockTracks);
      expect(sequence[1].track.id).toBe('track3');
      expect(sequence[1].transitionType).toBe('harmonic');
      expect(sequence[2].track.id).toBe('track1');
      expect(sequence[2].transitionType).toBe('harmonic');
    });

    it('should sort tracks correctly via wrapper helper', () => {
      const sorted = harmonicSortTracks(mockTracks);
      expect(sorted[0].id).toBe('track2');
      expect(sorted[1].id).toBe('track3');
      expect(sorted[2].id).toBe('track1');
    });
  });
});
