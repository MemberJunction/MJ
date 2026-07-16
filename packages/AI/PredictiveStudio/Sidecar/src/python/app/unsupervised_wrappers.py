"""Unsupervised drivers (Doc 3 T3 + pattern-mining): clustering, dim-reduction,
anomaly, topic models. These fit on X with NO target; the standard supervised
train path doesn't apply, so main.py routes them to `_run_unsupervised_training`.

Each factory returns a fitted-on-call sklearn estimator; `fit_metric` reports a
task-appropriate honest number (silhouette / explained-variance / perplexity).
All sklearn — no new dependency.
"""
from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.decomposition import LatentDirichletAllocation, PCA
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
from sklearn.mixture import GaussianMixture

try:
    from umap import UMAP

    _HAVE_UMAP = True
except Exception:  # pragma: no cover
    _HAVE_UMAP = False


def _kmeans(hp):
    return KMeans(**{"n_init": 10, "random_state": 0, **hp})


def _dbscan(hp):
    return DBSCAN(**hp)


def _gmm(hp):
    return GaussianMixture(**{"random_state": 0, **hp})


def _hierarchical(hp):
    return AgglomerativeClustering(**hp)


def _pca(hp):
    return PCA(**{"random_state": 0, **hp})


def _isolation_forest(hp):
    return IsolationForest(**{"random_state": 0, **hp})


def _lda(hp):
    return LatentDirichletAllocation(**{"random_state": 0, **hp})


def _umap(hp):
    return UMAP(**{"random_state": 0, "n_components": 2, **hp})


_UNSUP_REGISTRY = {
    "kmeans": _kmeans,
    "dbscan": _dbscan,
    "gmm": _gmm,
    "hierarchical": _hierarchical,
    "pca": _pca,
    "isolation_forest": _isolation_forest,
    "lda": _lda,
    "umap": _umap,
}

# how each family produces per-row output (used at /predict; recorded on the fitted payload)
_OUTPUT_KIND = {
    "kmeans": "cluster", "dbscan": "cluster", "gmm": "cluster", "hierarchical": "cluster",
    "pca": "vector", "isolation_forest": "anomaly_score", "lda": "vector", "umap": "vector",
}

# optional-dependency runnability (all others are pure sklearn — always runnable)
_REQUIREMENTS = {"umap": _HAVE_UMAP}


def runnable(algorithm: str) -> bool:
    return _REQUIREMENTS.get(algorithm, True)


def is_unsupervised(algorithm: str) -> bool:
    return algorithm in _UNSUP_REGISTRY


def build_unsupervised(algorithm: str, hp: Dict[str, Any]):
    return _UNSUP_REGISTRY[algorithm](dict(hp))


def output_kind(algorithm: str) -> str:
    return _OUTPUT_KIND.get(algorithm, "cluster")


def fit_and_metric(algorithm: str, estimator, X: np.ndarray) -> Dict[str, float]:
    """Fit the estimator on X and return an honest task-appropriate fit metric."""
    Xa = np.asarray(X, dtype=float)
    if algorithm in ("kmeans", "gmm"):
        labels = estimator.fit_predict(Xa)
        try:
            sil = float(silhouette_score(Xa, labels)) if len(set(labels)) > 1 else 0.0
        except Exception:
            sil = 0.0
        return {"silhouette": sil, "n_clusters": float(len(set(labels)))}
    if algorithm in ("dbscan", "hierarchical"):
        labels = estimator.fit_predict(Xa)
        n = len(set(labels) - {-1})
        try:
            sil = float(silhouette_score(Xa, labels)) if n > 1 else 0.0
        except Exception:
            sil = 0.0
        return {"silhouette": sil, "n_clusters": float(n)}
    if algorithm == "pca":
        estimator.fit(Xa)
        return {"explained_variance_ratio": float(np.sum(estimator.explained_variance_ratio_))}
    if algorithm == "isolation_forest":
        estimator.fit(Xa)
        scores = estimator.score_samples(Xa)
        return {"mean_anomaly_score": float(-np.mean(scores))}
    if algorithm == "lda":
        # LDA needs non-negative counts; clip to be safe on arbitrary features
        estimator.fit(np.clip(Xa, 0, None))
        return {"perplexity": float(estimator.perplexity(np.clip(Xa, 0, None)))}
    if algorithm == "umap":
        emb = estimator.fit_transform(Xa)
        # trustworthiness: how well the low-D embedding preserves local neighborhoods
        from sklearn.manifold import trustworthiness
        n_nb = min(10, max(2, len(Xa) - 1))
        return {"trustworthiness": float(trustworthiness(Xa, emb, n_neighbors=n_nb)),
                "n_components": float(estimator.n_components)}
    estimator.fit(Xa)
    return {}
