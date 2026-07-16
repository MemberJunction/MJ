"""Association-rule mining driver (Doc 3 T7).

Consumes a one-hot BASKET matrix (rows = transactions, columns = items, values 0/1)
and mines frequent itemsets → association rules (antecedent → consequent with support
/ confidence / lift). Emits a ``rules`` artifact — there is NO per-row prediction, so
main.py routes it to ``_run_pattern_training`` and the model IS the rule table.

``mlxtend`` is an OPTIONAL extra (requirements-pattern.txt), gated by _HAVE_MLXTEND.
"""
from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

try:
    import pandas as pd
    from mlxtend.frequent_patterns import apriori, association_rules

    _HAVE_MLXTEND = True
except Exception:  # pragma: no cover
    _HAVE_MLXTEND = False


class _AssociationRulesModel:
    """Apriori frequent-itemset mining + rule generation over a binary basket matrix."""

    def __init__(self, min_support: float = 0.05, min_confidence: float = 0.3,
                 max_rules: int = 200, **hp: Any):
        self.min_support = float(min_support)
        self.min_confidence = float(min_confidence)
        self.max_rules = int(max_rules)
        self.rules_: List[Dict[str, Any]] = []
        self.n_frequent_itemsets_ = 0

    def fit(self, matrix: np.ndarray, item_names: List[str]):
        df = pd.DataFrame((np.asarray(matrix) > 0).astype(bool), columns=item_names)
        itemsets = apriori(df, min_support=self.min_support, use_colnames=True)
        self.n_frequent_itemsets_ = int(len(itemsets))
        if itemsets.empty:
            self.rules_ = []
            return self
        rules = association_rules(itemsets, metric="confidence",
                                  min_threshold=self.min_confidence)
        rules = rules.sort_values("lift", ascending=False).head(self.max_rules)
        self.rules_ = [{
            "antecedents": sorted(map(str, r["antecedents"])),
            "consequents": sorted(map(str, r["consequents"])),
            "support": float(r["support"]),
            "confidence": float(r["confidence"]),
            "lift": float(r["lift"]),
        } for _, r in rules.iterrows()]
        return self

    def metrics(self) -> Dict[str, float]:
        return {"n_frequent_itemsets": float(self.n_frequent_itemsets_),
                "n_rules": float(len(self.rules_)),
                "max_lift": float(max((r["lift"] for r in self.rules_), default=0.0))}


def is_pattern(algorithm: str) -> bool:
    return algorithm == "association_rules"


def build_pattern(algorithm: str, hp: Dict[str, Any]):
    if algorithm == "association_rules":
        return _AssociationRulesModel(**hp)
    raise ValueError(f"unknown pattern algorithm '{algorithm}'")
