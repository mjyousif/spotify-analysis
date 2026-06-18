import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LyricSentimentWidget } from './LyricSentimentWidget';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    getTrackLyrics: vi.fn(),
    getPlaylistLyricsAnalysis: vi.fn(),
  },
}));

describe('LyricSentimentWidget Component', () => {
  const mockTracks = [
    {
      id: 't1',
      name: 'Song One',
      uri: 'spotify:track:t1',
      artists: 'Artist A',
      album_images: [],
      cluster: 1,
      x: 0.1,
      y: 0.2,
      popularity: 50,
      release_date: '2020',
      duration_ms: 180000,
      features: {
        tempo: 120,
        energy: 0.8,
        valence: 0.9,
        acousticness: 0.1,
        danceability: 0.7,
        instrumentalness: 0.0,
        speechiness: 0.05,
        liveness: 0.1,
        mode: 1,
        key: 5,
      },
      genres: [],
    },
    {
      id: 't2',
      name: 'Song Two',
      uri: 'spotify:track:t2',
      artists: 'Artist B',
      album_images: [],
      cluster: 2,
      x: -0.1,
      y: -0.2,
      popularity: 40,
      release_date: '2019',
      duration_ms: 200000,
      features: {
        tempo: 90,
        energy: 0.3,
        valence: 0.2,
        acousticness: 0.8,
        danceability: 0.4,
        instrumentalness: 0.9,
        speechiness: 0.03,
        liveness: 0.08,
        mode: 0,
        key: 2,
      },
      genres: [],
    }
  ];

  const mockOnSelectTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation to avoid .then error on component mount
    vi.mocked(apiService.getTrackLyrics).mockResolvedValue({
      lyrics: 'default lyrics text',
      mood: 'calm',
      summary: 'default summary',
      instrumental: false,
      synced_lyrics: null,
      prominent_words: [],
      key_themes: [],
    });
  });

  it('renders standby state for Playlist Vibe tab by default', () => {
    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    expect(screen.getByText('Scan Playlist Vibe')).toBeInTheDocument();
    expect(screen.getByText('Analyze Playlist Lyrical Vibe')).toBeInTheDocument();
  });

  it('performs playlist batch analysis and renders results under spotify_model strategy', async () => {
    const mockPlaylistAnalysis = {
      tracks: {
        t1: {
          lyrics: 'Happy lyrics text',
          mood: 'joyful happiness',
          lyrical_valence: 0.85,
          lyrical_energy: 0.75,
          emotional_ambiguity: 0.1,
          sentiment_score: 0.8,
          summary: 'A happy song description.',
          instrumental: false,
          synced_lyrics: null,
          prominent_words: ['happy', 'love'],
          key_themes: ['joy'],
        },
        t2: {
          lyrics: 'Melancholy text',
          mood: 'sad heartbreak',
          lyrical_valence: 0.15,
          lyrical_energy: 0.25,
          emotional_ambiguity: 0.4,
          sentiment_score: -0.6,
          summary: 'A sad song description.',
          instrumental: false,
          synced_lyrics: null,
          prominent_words: ['sad', 'tears'],
          key_themes: ['heartbreak'],
        }
      },
      playlist_sentiment: {
        mood_distribution: {},
        top_words: [{ text: 'happy', value: 5 }, { text: 'sad', value: 3 }],
        average_sentiment: 0.1,
      }
    };

    vi.mocked(apiService.getPlaylistLyricsAnalysis).mockResolvedValue(mockPlaylistAnalysis);

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    const scanBtn = screen.getByText('Scan Playlist Vibe');
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(apiService.getPlaylistLyricsAnalysis).toHaveBeenCalledWith('p123', 'spotify_model');
      expect(screen.getByText('Average Playlist Sentiment')).toBeInTheDocument();
    });

    expect(screen.getByText('+0.10')).toBeInTheDocument();
    expect(screen.getByText('Joyful Bias')).toBeInTheDocument();
    expect(screen.getByText('Lyrical Valence (Happiness)')).toBeInTheDocument();
    expect(screen.getByText('Lyrical Energy (Intensity)')).toBeInTheDocument();
    expect(screen.getByText('Emotional Ambiguity (Complexity)')).toBeInTheDocument();
    
    // Check tags cloud
    expect(screen.getByText('happy')).toBeInTheDocument();
    expect(screen.getByText('sad')).toBeInTheDocument();
  });

  it('performs playlist batch analysis and renders results under 6d_emotions strategy', async () => {
    const mockPlaylistAnalysis = {
      tracks: {
        t1: {
          lyrics: 'Angry rebel rock lyrics',
          mood: 'intense rage',
          emotions: {
            joy: 0.1,
            sadness: 0.2,
            anger: 0.8,
            fear_anxiety: 0.3,
            love_romance: 0.05,
            nostalgia_longing: 0.1,
          },
          summary: 'An angry song.',
          instrumental: false,
          synced_lyrics: null,
          prominent_words: ['fire', 'burn'],
          key_themes: ['rage'],
        }
      },
      playlist_sentiment: {
        mood_distribution: {},
        top_words: [],
        average_sentiment: -0.4,
      }
    };

    vi.mocked(apiService.getPlaylistLyricsAnalysis).mockResolvedValue(mockPlaylistAnalysis);

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="6d_emotions"
      />
    );

    fireEvent.click(screen.getByText('Scan Playlist Vibe'));

    await waitFor(() => {
      expect(screen.getByText('-0.40')).toBeInTheDocument();
      expect(screen.getByText('Heavy Bias')).toBeInTheDocument();
    });

    // Check that 6D emotional dimensions are visible
    expect(screen.getByText('Joy')).toBeInTheDocument();
    expect(screen.getByText('Sadness')).toBeInTheDocument();
    expect(screen.getByText('Anger')).toBeInTheDocument();
    expect(screen.getByText('Fear/Anxiety')).toBeInTheDocument();
    expect(screen.getByText('Love')).toBeInTheDocument();
    expect(screen.getByText('Nostalgia')).toBeInTheDocument();
  });

  it('handles playlist analysis API failure', async () => {
    vi.mocked(apiService.getPlaylistLyricsAnalysis).mockRejectedValue(new Error('Batch scan failed'));

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    fireEvent.click(screen.getByText('Scan Playlist Vibe'));

    await waitFor(() => {
      expect(screen.getByText('Batch scan failed')).toBeInTheDocument();
    });
  });

  it('switches tabs and auto-triggers single track focus lyrics fetch', async () => {
    const mockTrackLyrics = {
      lyrics: 'Love and romance lyrics',
      mood: 'romantic passion',
      lyrical_valence: 0.7,
      lyrical_energy: 0.5,
      emotional_ambiguity: 0.2,
      summary: 'A romance song.',
      instrumental: false,
      synced_lyrics: null,
      prominent_words: ['love', 'sweet'],
      key_themes: ['romance'],
    };

    vi.mocked(apiService.getTrackLyrics).mockResolvedValue(mockTrackLyrics);

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={mockTracks[0]}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    // Should auto-switch to 'track' tab since selectedTrack is provided
    await waitFor(() => {
      expect(apiService.getTrackLyrics).toHaveBeenCalledWith(
        't1',
        'Song One',
        'Artist A',
        '',
        180000,
        0.9,
        0.8,
        'spotify_model'
      );
      expect(screen.getByText('Romantic')).toBeInTheDocument();
      expect(screen.getByText('Love and romance lyrics')).toBeInTheDocument();
      expect(screen.getByText('A romance song.')).toBeInTheDocument();
    });
  });

  it('handles instrumental and missing lyrics cases under track focus', async () => {
    vi.mocked(apiService.getTrackLyrics)
      .mockResolvedValueOnce({
        lyrics: '',
        mood: 'calm reflecting peace',
        summary: 'Instrumental vibe.',
        instrumental: true,
        synced_lyrics: null,
        prominent_words: [],
        key_themes: [],
      })
      .mockResolvedValueOnce({
        lyrics: '',
        mood: 'unknown',
        summary: 'No lyrics.',
        instrumental: false,
        synced_lyrics: null,
        prominent_words: [],
        key_themes: [],
      });

    const { rerender } = render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={mockTracks[0]}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    // Case 1: Instrumental
    await waitFor(() => {
      expect(screen.getByText('Peaceful')).toBeInTheDocument();
      expect(screen.getByText('Instrumental Track')).toBeInTheDocument();
    });

    // Case 2: Missing lyrics (non-instrumental empty lyrics)
    rerender(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={mockTracks[1]}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Lyrics not found')).toBeInTheDocument();
    });
  });

  it('handles track lyrics fetch API error', async () => {
    vi.mocked(apiService.getTrackLyrics).mockRejectedValue(new Error('Lyrics service offline'));

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={mockTracks[0]}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Lyrics service offline')).toBeInTheDocument();
    });
  });

  it('triggers onSelectTrack on track selection dropdown changes', async () => {
    vi.mocked(apiService.getTrackLyrics).mockResolvedValue({
      lyrics: 'Some text',
      mood: 'chilled ambient',
      summary: 'Chill',
      instrumental: false,
    } as any);

    render(
      <LyricSentimentWidget
        playlistId="p123"
        tracks={mockTracks}
        selectedTrack={mockTracks[0]}
        onSelectTrack={mockOnSelectTrack}
        lyricsStrategy="spotify_model"
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Some text')).toBeInTheDocument();
    });

    // Change select dropdown
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: 't2' } });
    });

    await waitFor(() => {
      expect(mockOnSelectTrack).toHaveBeenCalledWith(mockTracks[1]);
    });
  });

  it('covers different mood meta mapping conditions', async () => {
    const moods = [
      { mood: 'melancholic sadness heartbreak', expected: 'Melancholic' },
      { mood: 'angry rebellious intense', expected: 'Intense/Angry' },
      { mood: 'energetic hyped upbeat workout', expected: 'Energetic' },
      { mood: 'desperate hopeless anxious anxiety fear', expected: 'Desperate' },
      { mood: 'custom-style', expected: 'Custom-style' },
    ];

    for (const { mood, expected } of moods) {
      vi.mocked(apiService.getTrackLyrics).mockResolvedValue({
        lyrics: 'lyrics text',
        mood: mood,
        summary: 'summary text',
        instrumental: false,
        emotions: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear_anxiety: 0.1,
          love_romance: 0.1,
          nostalgia_longing: 0.1,
        }
      } as any);

      const { unmount } = render(
        <LyricSentimentWidget
          playlistId="p123"
          tracks={mockTracks}
          selectedTrack={mockTracks[0]}
          onSelectTrack={mockOnSelectTrack}
          lyricsStrategy="6d_emotions"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(expected)).toBeInTheDocument();
      });

      unmount();
    }
  });
});

