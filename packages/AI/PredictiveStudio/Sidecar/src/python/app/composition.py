"""Building a **composed** model — a tree of estimators rather than a single one.

The typed component model lets a model be a *structure* with filled slots: a Bagging Wrapper over a
Random Forest, a Stacking Wrapper whose ``estimators`` are three different families and whose
``final_estimator`` is a Logistic Regression. Until now that could be *described* and not *trained*;
this module is the runtime that makes ``reify`` and ``compose`` executable.

Three deliberate positions:

* **The sidecar knows nothing about the component tree.** Nodes arrive driver-keyed, already resolved
  from component-type names by the caller, and slots are checked here against what the *structure*
  accepts — not against MJ metadata. Validation against the real tree happens in TypeScript
  (``validateComponentGraph``) before anything reaches this process.
* **A reused child is FROZEN.** Its artifact travels with the request and is wrapped so neither
  ``clone`` nor an enclosing ``fit`` can update it. Silently re-fitting a component the caller asked
  to reuse would produce a different model than the one they described, and nothing downstream would
  notice.
* **A missing or mismatched reuse artifact is an error, never a re-fit.** Same reason.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sklearn.base import BaseEstimator
from sklearn.ensemble import (
    BaggingClassifier,
    BaggingRegressor,
    StackingClassifier,
    StackingRegressor,
)

from . import algorithms, artifacts
from .schemas import TrainComponentNode, TrainedComponentState

#: Structure drivers, and the slots each one accepts. A structure composes its children; any other
#: driver is a leaf, looked up in the estimator registry.
STRUCTURE_SLOTS: Dict[str, Tuple[str, ...]] = {
    "bagging": ("base_estimator",),
    "stacking": ("estimators", "final_estimator"),
}

#: Guard against a self-referential graph exhausting the stack.
MAX_DEPTH = 16


class CompositionError(ValueError):
    """Raised when a component graph cannot be built as described."""


class FrozenEstimator(BaseEstimator):
    """Wraps a fitted estimator so nothing in an enclosing fit can change it.

    sklearn 1.6 ships ``sklearn.frozen.FrozenEstimator``; this is the same idea for the 1.4
    pinned here. Two things make the freeze real, and both are load-bearing:

    * ``fit`` is a no-op returning ``self``.
    * ``__sklearn_clone__`` returns ``self``. Without it, ``clone()`` — which every ensemble
      calls before fitting — would rebuild the wrapper around an *unfitted* copy of the inner
      estimator, and the freeze would be silently undone.

    Note the honest caveat for stacking: sklearn builds meta-features with ``cross_val_predict``
    over the base estimators. A frozen child simply predicts for every fold, so if it was
    originally fitted on rows that overlap this training set, its meta-features are optimistic.
    That is inherent to reusing a fitted component, not something this wrapper can fix; the
    locked holdout is what keeps the reported numbers honest.
    """

    def __init__(self, estimator: Any):
        self.estimator = estimator

    def fit(self, X: Any, y: Any = None, **kwargs: Any) -> "FrozenEstimator":  # noqa: N803
        """No-op: the wrapped estimator is already fitted and must stay that way."""
        return self

    def __sklearn_clone__(self) -> "FrozenEstimator":
        """Survive ``clone()`` intact — cloning normally strips the fitted state."""
        return self

    def __sklearn_is_fitted__(self) -> bool:
        """Tell sklearn's ``check_is_fitted`` this estimator is ready to predict."""
        return True

    def predict(self, X: Any):  # noqa: N803
        return self.estimator.predict(X)

    def predict_proba(self, X: Any):  # noqa: N803
        return self.estimator.predict_proba(X)

    def decision_function(self, X: Any):  # noqa: N803
        return self.estimator.decision_function(X)

    @property
    def _estimator_type(self) -> Optional[str]:
        """Delegate classifier/regressor identity — ``is_classifier`` reads this."""
        return getattr(self.estimator, "_estimator_type", None)

    @property
    def classes_(self):  # noqa: D401 - sklearn attribute passthrough
        """The wrapped estimator's classes (stacking reads this)."""
        return getattr(self.estimator, "classes_", None)

    @property
    def n_features_in_(self) -> Optional[int]:
        """The width the wrapped estimator was fitted on."""
        return getattr(self.estimator, "n_features_in_", None)


def build_from_graph(
    node: TrainComponentNode,
    problem_type: str,
    output_columns: Optional[List[str]] = None,
    component_artifacts: Optional[Dict[str, str]] = None,
) -> Any:
    """Build the estimator tree described by ``node``.

    Args:
        node: The root of the composition.
        problem_type: ``classification`` or ``regression``; selects estimator variants.
        output_columns: Post-preprocessing column names, injected into name-keyed estimators
            (the glass-box rubric) exactly as the single-estimator path does, and used to
            check that a reused component was fitted on a matrix of the same width.
        component_artifacts: Base64 artifact envelopes keyed by ``reuse_instance_id``.

    Returns:
        An unfitted, sklearn-compatible estimator. Reused children inside it are already
        fitted and frozen.

    Raises:
        CompositionError: For an unknown slot, a missing or over-filled slot, a reuse id with
            no artifact, a reused component of the wrong width, or nesting past
            :data:`MAX_DEPTH`.
    """
    return _build(node, problem_type, output_columns or [], component_artifacts or {}, depth=0)


def describe_states(
    node: TrainComponentNode,
    fitted_root: Any,
    output_columns: Optional[List[str]] = None,
) -> List[TrainedComponentState]:
    """Report one state per graph node, depth-first, root first.

    Feature importance is reported per node only where that node's own estimator exposes one.
    A node that does not is reported without it, rather than with a map of zeros that would
    read as measured.
    """
    states: List[TrainedComponentState] = []
    _describe(node, fitted_root, output_columns or [], states, depth=0)
    return states


# ---------------------------------------------------------------------------
# building
# ---------------------------------------------------------------------------


def _build(
    node: TrainComponentNode,
    problem_type: str,
    output_columns: List[str],
    artifacts_by_id: Dict[str, str],
    depth: int,
) -> Any:
    if depth > MAX_DEPTH:
        raise CompositionError(
            f"The composition is nested more than {MAX_DEPTH} levels deep, which almost "
            f"certainly means it refers to itself."
        )

    if node.reuse_instance_id:
        return _load_frozen(node.reuse_instance_id, artifacts_by_id, output_columns)

    if node.driver in STRUCTURE_SLOTS:
        return _build_structure(node, problem_type, output_columns, artifacts_by_id, depth)

    est = algorithms.build_estimator(node.driver, problem_type, dict(node.hyperparameters or {}))
    # Name-keyed estimators (the glass-box rubric) need the matrix's column names, which
    # sklearn's fit(X, y) does not carry — the same injection the single-estimator path performs.
    if output_columns and hasattr(est, "mj_set_feature_names"):
        est.mj_set_feature_names(output_columns)
    return est


def _build_structure(
    node: TrainComponentNode,
    problem_type: str,
    output_columns: List[str],
    artifacts_by_id: Dict[str, str],
    depth: int,
) -> Any:
    slots = _group_children(node)
    hp = dict(node.hyperparameters or {})

    if node.driver == "bagging":
        base = _exactly_one(node, slots, "base_estimator")
        built = _build(base, problem_type, output_columns, artifacts_by_id, depth + 1)
        cls = BaggingClassifier if problem_type == "classification" else BaggingRegressor
        return cls(estimator=built, **hp)

    # stacking
    estimators = slots.get("estimators", [])
    if len(estimators) < 2:
        raise CompositionError(
            f"A stacking wrapper needs at least 2 components in 'estimators' "
            f"(got {len(estimators)}). With one, there is nothing to stack."
        )
    final = _exactly_one(node, slots, "final_estimator")
    named = [
        (
            f"{child.driver}_{i}",
            _build(child, problem_type, output_columns, artifacts_by_id, depth + 1),
        )
        for i, child in enumerate(estimators)
    ]
    final_built = _build(final, problem_type, output_columns, artifacts_by_id, depth + 1)
    cls = StackingClassifier if problem_type == "classification" else StackingRegressor
    return cls(estimators=named, final_estimator=final_built, **hp)


def _group_children(node: TrainComponentNode) -> Dict[str, List[TrainComponentNode]]:
    """Group a structure's children by slot, rejecting any slot it does not declare."""
    accepted = STRUCTURE_SLOTS[node.driver]
    grouped: Dict[str, List[TrainComponentNode]] = {}
    for child in node.children or []:
        slot = child.slot
        if not slot:
            raise CompositionError(
                f"A child of '{node.driver}' does not name the slot it fills. "
                f"Its slots are: {', '.join(accepted)}."
            )
        if slot not in accepted:
            raise CompositionError(
                f"'{node.driver}' has no slot called '{slot}'. Its slots are: {', '.join(accepted)}."
            )
        grouped.setdefault(slot, []).append(child)
    return grouped


def _exactly_one(
    node: TrainComponentNode, slots: Dict[str, List[TrainComponentNode]], slot: str
) -> TrainComponentNode:
    """The single child of a 1-arity slot, erroring clearly when it is missing or doubled."""
    children = slots.get(slot, [])
    if len(children) != 1:
        raise CompositionError(
            f"'{node.driver}' needs exactly 1 component in slot '{slot}' (got {len(children)})."
        )
    return children[0]


def _load_frozen(
    reuse_id: str, artifacts_by_id: Dict[str, str], output_columns: List[str]
) -> FrozenEstimator:
    """Deserialize a reused component's artifact envelope and freeze it."""
    envelope_b64 = artifacts_by_id.get(reuse_id)
    if not envelope_b64:
        raise CompositionError(
            f"The graph reuses component '{reuse_id}' but no artifact for it was supplied. "
            f"Reusing a component means loading its fitted state; refitting it here would "
            f"produce a different model than the one described."
        )
    try:
        estimator, _envelope = artifacts.deserialize_envelope(envelope_b64)
    except Exception as exc:  # noqa: BLE001 - surfaced as an actionable composition error
        raise CompositionError(f"Reused component '{reuse_id}' could not be loaded: {exc}") from exc

    fitted_width = getattr(estimator, "n_features_in_", None)
    if output_columns and fitted_width is not None and int(fitted_width) != len(output_columns):
        raise CompositionError(
            f"Reused component '{reuse_id}' was fitted on {int(fitted_width)} features but this "
            f"model assembles {len(output_columns)}. Reuse needs the same feature matrix; "
            f"re-train the component under this pipeline instead of reusing it."
        )
    return FrozenEstimator(estimator)


# ---------------------------------------------------------------------------
# describing
# ---------------------------------------------------------------------------


def _describe(
    node: TrainComponentNode,
    estimator: Any,
    output_columns: List[str],
    out: List[TrainedComponentState],
    depth: int,
) -> None:
    if depth > MAX_DEPTH:
        return

    frozen = bool(node.reuse_instance_id)
    out.append(
        TrainedComponentState(
            driver=node.driver,
            slot=node.slot,
            fitted=not frozen,
            reuse_instance_id=node.reuse_instance_id,
            feature_importance=_importance_of(estimator, output_columns),
        )
    )
    for child, child_estimator in _child_pairs(node, estimator):
        _describe(child, child_estimator, output_columns, out, depth + 1)


def _child_pairs(node: TrainComponentNode, estimator: Any) -> List[Tuple[TrainComponentNode, Any]]:
    """Pair each graph child with the fitted estimator it became, where that is recoverable."""
    children = node.children or []
    if node.driver == "bagging":
        # Every bag shares one base estimator spec; report it once per declared child.
        inner = getattr(estimator, "estimator", None)
        return [(c, inner) for c in children]
    if node.driver == "stacking":
        fitted = list(getattr(estimator, "estimators_", []) or [])
        pairs: List[Tuple[TrainComponentNode, Any]] = []
        i = 0
        for child in children:
            if child.slot == "final_estimator":
                pairs.append((child, getattr(estimator, "final_estimator_", None)))
            else:
                pairs.append((child, fitted[i] if i < len(fitted) else None))
                i += 1
        return pairs
    return [(c, None) for c in children]


def _importance_of(estimator: Any, output_columns: List[str]) -> Optional[Dict[str, float]]:
    """A node's own importances, keyed by column name, or ``None`` when it exposes none."""
    if estimator is None:
        return None
    inner = estimator.estimator if isinstance(estimator, FrozenEstimator) else estimator
    values = getattr(inner, "feature_importances_", None)
    if values is None:
        coef = getattr(inner, "coef_", None)
        if coef is None:
            return None
        flat = coef[0] if getattr(coef, "ndim", 1) > 1 else coef
        values = [abs(float(v)) for v in flat]
    values = list(values)
    names = output_columns if len(output_columns) == len(values) else [f"f{i}" for i in range(len(values))]
    return {name: float(value) for name, value in zip(names, values)}
