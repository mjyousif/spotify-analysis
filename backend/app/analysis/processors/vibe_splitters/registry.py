from typing import Dict
from .base import BaseVibeSplitter
from .algorithms import KMeansSplitter, AgglomerativeSplitter, DbscanSplitter
from .heuristics import MoodMappingSplitter, GenreFirstSplitter
from .llm import LlmSemanticSplitter

# Extensible Strategy Registry
SPLITTER_REGISTRY: Dict[str, BaseVibeSplitter] = {
    "kmeans": KMeansSplitter(),
    "agglomerative": AgglomerativeSplitter(),
    "dbscan": DbscanSplitter(),
    "mood_mapping": MoodMappingSplitter(),
    "genre_first": GenreFirstSplitter(),
    "llm_semantic": LlmSemanticSplitter(),
}

def get_vibe_splitter(algorithm_name: str) -> BaseVibeSplitter:
    """Returns the registered vibe splitter for the given algorithm name, falling back to KMeans if not found."""
    return SPLITTER_REGISTRY.get(algorithm_name.lower(), SPLITTER_REGISTRY["kmeans"])
