# Brainstormed Ideas for Spotify Playlist Vibe Splitter & Analyzer

This document contains ideas for extending the core functionality of the Spotify Playlist Vibe Splitter & Analyzer. Following the modular architecture (Processors and Widgets), these features can be incrementally added.

## 1. Backend: New Analysis Processors

*   **`LyricSentimentProcessor`**:
    *   **Concept**: Integrate with a lyrics API (e.g., Genius or Musixmatch) to fetch track lyrics. Run a sentiment analysis model (via LLM or specialized NLP library) to classify the mood (e.g., angry, melancholic, joyful, romantic).
    *   **Frontend Output**: A word cloud widget highlighting the most prominent emotional words, or a sentiment distribution pie chart.
*   **`DecadesDistributionProcessor`**:
    *   **Concept**: Extract the `release_date` from track album metadata to calculate the release decade (e.g., 80s, 90s, 2010s).
    *   **Frontend Output**: A histogram or bar chart showing the timeline/era distribution of the playlist.
*   **`PopularityAnalyzer`**:
    *   **Concept**: Utilize Spotify's built-in `popularity` metric (0-100) to measure how mainstream vs. obscure the playlist is.
    *   **Frontend Output**: A "Hipster Score" dial widget or a distribution curve of underground vs. top-40 tracks.
*   **`HarmonicMixingProcessor`**:
    *   **Concept**: Analyze the key and tempo of tracks to suggest an optimal ordering within the split playlists for seamless cross-fading (using the Camelot Wheel).
    *   **Frontend Output**: A suggested tracklist order specifically tailored for DJ-like transitions.

## 2. Frontend: New Dashboard Widgets

*   **Audio Feature Radar Chart**:
    *   **Concept**: For each suggested split playlist, display a radar/spider chart overlaying average metrics (Danceability, Acousticness, Energy, Valence). This provides a quick visual fingerprint of the cluster's vibe.
*   **Playlist "Flow" Line Graph**:
    *   **Concept**: Plot the energy or BPM of tracks in their original playlist order to visualize the emotional "journey" of the playlist from start to finish.
*   **Alternative Dimensionality Reduction Toggles**:
    *   **Concept**: Allow users to switch between PCA, UMAP, and t-SNE in the 2D Scatter Plot widget to see how different algorithms interpret the track distances.

## 3. General Platform Features

*   **Multi-Platform Export**:
    *   **Concept**: Allow users to export their newly split playlists not only back to Spotify, but also to Apple Music, YouTube Music, or Tidal.
*   **Collaborative Vibe Check**:
    *   **Concept**: Allow two users to authenticate and select one playlist from each account. The engine merges them, plots them on the same 2D canvas (color-coded by user), and finds the "overlap vibe" where their tastes intersect.
*   **Scheduled Auto-Splitter**:
    *   **Concept**: For massive "dump" playlists that users constantly add to, allow a cron job to automatically sort new additions into their respective vibe clusters daily.
