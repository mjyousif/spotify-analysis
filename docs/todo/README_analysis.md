# TODO: New Data Analysis Sections

This specification details the frontend widgets and backend data extensions for the new analysis features.

## 1. Data Extensions

To support these visualizations, we must extract additional track details.

### Track Popularity & Release Dates
In `backend/app/services/spotify.py` at `get_playlist_tracks`:
- Retrieve `popularity` and `album(release_date)` in the Spotify track query.
- Add these to the tracks payload.

### Key, Mode, & Liveness
In `backend/app/services/reccobeats.py`:
- ReccoBeats returns `key`, `mode`, and `liveness`.
- Make sure these are parsed and returned in each track's `features` map.

---

## 2. Widget Specifications

We will implement three new interactive widgets in `frontend/src/components/Dashboard/`:

### A. Taste Profile Widget (The Hipster Meter)
* **File**: `TasteProfileWidget.tsx`
* **Layout**:
  - A dashboard card with a header: `Taste Profile / Hipster Meter`.
  - A horizontal slider indicator showing where the average popularity lies on a scale from **Obscure / Indie** (0-35) to **Balanced / Cultured** (36-70) to **Mainstream / Billboard** (71-100).
  - A list of two highlight tracks:
    1. **"The Underground Diamond"** (Song with the lowest non-zero popularity).
    2. **"The Crowd Pleaser"** (Song with the highest popularity).
* **Styling**: Tailwind/CSS with high-contrast indicator arrows and a glowing backdrop gradient.

### B. DJ Deck Widget (Camelot Wheel Transition Flow)
* **File**: `DJDeckWidget.tsx`
* **Concept**: DJ harmonic mixing relies on transitioning between compatible keys (e.g. `8A` to `9A` or `8B`).
* **Logic**:
  - Map Spotify standard numeric keys (0-11) and mode (0=Minor, 1=Major) to Camelot keys:
    - Minor keys (mode 0): C=5A, C#=12A, D=7A, D#=2A, E=9A, F=4A, F#=11A, G=6A, G#=1A, A=8A, A#=3A, B=10A.
    - Major keys (mode 1): C=8B, C#=3B, D=10B, D#=5B, E=12B, F=7B, F#=2B, G=9B, G#=4B, A=11B, A#=6B, B=1B.
  - Compute a sequence of tracks ordered such that transition gaps are minimized (Harmonic Ordering).
* **Layout**:
  - Visual grid showing Camelot key counts (how many songs are in `8A`, `9A`, etc.).
  - A scrollable "Perfect DJ Flow" sequence that displays the tracks sorted in order of harmonic compatibility. Highlighting adjacent transitions (e.g., "Smooth Key Change" badges).

### C. Era Timeline Widget (Release Year Distribution)
* **File**: `EraTimelineWidget.tsx`
* **Logic**:
  - Parse track release dates (from `release_date`, which can be `"YYYY"`, `"YYYY-MM"`, or `"YYYY-MM-DD"`).
  - Bucket tracks into decades: `Pre-70s`, `70s`, `80s`, `90s`, `00s`, `10s`, `20s`.
* **Layout**:
  - A bar chart showing the track count per decade.
  - Modern timeline-style line graph or customized CSS flexbox columns showing the decade distribution with a gradient fill.
  - Displays the "Oldest Track" and "Newest Track" with their release years.
