# TODO: Configurable Clustering Algorithms & Outlier Handling

This spec describes the implementation of multiple playlist-splitting algorithms and standardizing how outliers are identified, visualised, and exported.

## 1. Algorithm Descriptions & Parameters

We will implement three algorithms in `backend/app/analysis/processors/clustering.py`:

### K-Means (Standard)
* **Goal**: Spherical, balanced groupings.
* **Backend Implementation**: `sklearn.cluster.KMeans` (already implemented).
* **Parameters**: $k$ (number of clusters).

### Agglomerative Clustering (Hierarchical)
* **Goal**: Bottom-up tree grouping. Creates highly cohesive sub-genres and runs deterministically (no random state initialization).
* **Backend Implementation**: `sklearn.cluster.AgglomerativeClustering`
* **Parameters**: `n_clusters=k`, `linkage="ward"` (minimizes variance of clusters merged).

### DBSCAN (Density-Based Spatial Clustering)
* **Goal**: Groups tracks in high-density areas and filters out unique, outlier tracks. Auto-calculates the number of vibes.
* **Backend Implementation**: `sklearn.cluster.DBSCAN`
* **Parameters**: `eps` (maximum distance between two samples to be considered neighbors), `min_samples` (minimum songs in a neighborhood, default to 2 or 3).
* **Outlier Tagging**: Any track with label `-1` is marked as an outlier.

---

## 2. DBSCAN Outlier / Wildcard Handling Spec

When DBSCAN runs, it flags songs that don't fit any main cluster. We need to handle this gracefully:

### Backend
1. **Cluster Label `-1`**: Map outlier tracks to `cluster_idx = -1`.
2. **Profile Generation**: Generate a special profile for `cluster_id = -1` named `"Wildcards / Outliers"`.
3. **LLM/Static Recommendations**:
   - Generate a fun name for the outliers group like `"The Eclectic Wildcards"`, `"The Misfit Mix"`, or `"Sonic Oddities"`.
   - The description should state: *"These are the unique tracks that stood out from the main cohesive vibes of your playlist."*

### Frontend
1. **Scatter Plot Color**: Color outliers with a distinct neutral color (e.g., medium gray `#6B7280` or a muted dash pattern) so they are visually separate from the vibrant cluster colors.
2. **Export Tab**: In `RecommendationsWidget.tsx`, display the Wildcard group as its own tab.
3. **Spotify Export**: Give users the choice to export these outlier tracks into their own separate playlist (e.g., "[Original Name] - Wildcards") so the other playlists remain 100% vibe-pure.

---

## Todo List

- [ ] Import `AgglomerativeClustering` and `DBSCAN` in `backend/app/analysis/processors/clustering.py`.
- [ ] Read `algorithm` from `context` (passed from request query parameters).
- [ ] Route fitting logic:
  - If `algorithm == "dbscan"`:
    - Scale inputs.
    - Set dynamic `eps` based on average distance or static value (e.g. `eps=0.3` to `0.45` on normalized MinMaxScaler features).
    - Map DBSCAN labels (including `-1` for noise).
  - If `algorithm == "agglomerative"`:
    - Run `AgglomerativeClustering(n_clusters=k)`.
- [ ] In `clustering.py`, format profile details for the `-1` cluster if present.
- [ ] Update frontend UI to show algorithm select menu.
