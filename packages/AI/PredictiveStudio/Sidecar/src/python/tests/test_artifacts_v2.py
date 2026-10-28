"""Every predictor the trainer can ship round-trips through the restricted unpickler, and the allow-list holds exactly
the globals those predictors pickle.

The dummy and the incumbent heuristic are yardsticks for the publishing gate and never ship, so building an artifact
from either is refused. The v1 and v2 content hashes are pinned so neither convention drifts.
"""

from __future__ import annotations

import base64
import functools
import hashlib
import io
import json
import os
import pickle
from pathlib import Path
from typing import Callable, Dict, FrozenSet, List, Optional, Set, Tuple

import joblib
import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest
from joblib.numpy_pickle import NumpyArrayWrapper, NumpyUnpickler
from joblib.numpy_pickle_utils import _read_fileobject
from sklearn.linear_model import Ridge

from app import artifacts, artifacts_v2, baselines as BL, calibration as CAL, encoding as E, folds as F, scores, trainer as TR
from app.algorithms import TabularFamily
from app.array_types import FArr
from app.trainer_schemas import CandidateSpec, EvaluationProtocol
from tests.tools.trainer_fixture import protocol

# scikit-learn 1.4.2's L-BFGS-B fits (logistic regression and the Poisson/Tweedie GLMs) pass `iprint` to scipy
# 1.17.1, which deprecates it; and the MLP on this unstructured fixture label stops at its iteration cap before its
# tolerance is met. Neither bears on whether the fitted predictor round-trips.
pytestmark = [pytest.mark.filterwarnings("ignore:scipy.optimize. The `disp` and `iprint` options:DeprecationWarning"),
              pytest.mark.filterwarnings("ignore::sklearn.exceptions.ConvergenceWarning")]

RNG = np.random.default_rng(0)
N = 300
X = pd.DataFrame({"a": RNG.normal(size=N), "b": RNG.integers(0, 5, N).astype(float),
                  "c": [str(v) for v in RNG.integers(0, 30, N)], "d": [str(v) for v in RNG.integers(0, 30, N)],
                  "e": [str(v) for v in RNG.integers(0, 30, N)], "f": [f"id-{i}" for i in range(N)]})
X.loc[::7, "a"] = np.nan
# Every shape a snapshot column can take: `a` imputed by default, `b` with a declared impute policy, `c` declaring 30
# levels against a cap of 10 (so its pipeline carries the in-fold overflow step), and the excluded identifier `f`.
COLS = [E.ColumnSpec("a", "a", E.NumericEncoding("numeric")),
        E.ColumnSpec("b", "b", E.NumericEncoding("numeric"), missing=E.MissingPolicy("constant", 0.0, False)),
        E.ColumnSpec("c", "c", E.CategoricalEncoding(10, "onehot"), levels=tuple(sorted(set(X["c"])))),
        E.ColumnSpec("d", "d", E.CategoricalEncoding(8, "hashed")),
        E.ColumnSpec("e", "e", E.CategoricalEncoding(10, "target-in-fold")),
        E.ColumnSpec("f", "f", E.IdentifierEncoding("exclude"))]
TREES = ("random_forest", "xgboost", "lightgbm")
ZERO_HASH = "0" * 64


class FamilyCase:
    """One task family: its class order (classification only), its label and the drivers the trainer fits for it."""

    def __init__(self, order: Optional[List[str]], y: npt.NDArray[np.generic], drivers: Tuple[str, ...]) -> None:
        self.order = order
        self.y = y
        self.drivers = drivers


CASES: Dict[TabularFamily, FamilyCase] = {
    "binary": FamilyCase(["x", "y"], (RNG.random(N) < 0.4).astype(np.int64),
                         ("logistic_regression", "random_forest", "mlp", "xgboost", "lightgbm")),
    "multiclass": FamilyCase(["x", "y", "z"], RNG.integers(0, 3, N).astype(np.int64),
                             ("logistic_regression", "random_forest", "mlp", "xgboost", "lightgbm")),
    "continuous": FamilyCase(None, RNG.normal(size=N), ("ridge", "random_forest", "mlp", "xgboost", "lightgbm")),
    "count": FamilyCase(None, RNG.poisson(2, N).astype(np.float64), ("poisson_glm", "random_forest", "xgboost", "lightgbm")),
    "non-negative": FamilyCase(None, np.where(RNG.random(N) < 0.5, 0.0, RNG.gamma(2, 10, N)),
                               ("tweedie_glm", "random_forest", "xgboost", "lightgbm")),
}
PAIRS: List[Tuple[TabularFamily, str]] = [(f, d) for f, case in CASES.items() for d in case.drivers]


def _spec(family: TabularFamily, driver: str) -> CandidateSpec:
    """The family's GLM is the GLM baseline's own spec; every other driver is an ordinary candidate."""
    if driver == BL.GLM_DRIVER[family]:
        return BL.glm_spec(family)
    return CandidateSpec(name=driver, algorithmId="00000000-0000-0000-0000-000000000000", driverKey=driver,
                         hyperparameters={"n_estimators": 20} if driver in TREES else {})


@functools.lru_cache(maxsize=None)
def _fitted(family: TabularFamily, driver: str) -> TR.TrainedPredictor:
    """A predictor fitted on every row; classifiers carry a calibration map (isotonic for xgboost, Platt otherwise)."""
    case = CASES[family]
    p = EvaluationProtocol.model_validate(protocol(family))
    enc = TR.EncodedLabel(case.y, family, case.order, 1.5 if family == "non-negative" else None)
    m = TR.fit_predictor(_spec(family, driver), COLS, X, enc, np.arange(N, dtype=np.int64), p, 1)
    if case.order is not None:
        m.calibrator = CAL.Calibrator("isotonic" if driver == "xgboost" else "platt").fit(case.y, m.predict_raw(X))
    return m


def _build(name: str, predictor: TR.TrainedPredictor, family: TabularFamily) -> artifacts_v2.BuiltArtifact:
    return artifacts_v2.build(name, predictor, COLS, family, CASES[family].order, ZERO_HASH, None, None)


class _RecordingWrapper(NumpyArrayWrapper):
    """joblib's array container, with object-array elements read through the recording unpickler too."""

    def read_array(self, unpickler: "_RecordingUnpickler") -> npt.NDArray[np.generic]:
        if self.dtype.hasobject:
            nested = _RecordingUnpickler(unpickler.filename, unpickler.file_handle, unpickler.seen)
            return np.asarray(nested.load())
        return np.asarray(super().read_array(unpickler))


class _RecordingUnpickler(NumpyUnpickler):
    """Records every (module, name) a joblib stream resolves, including those inside object arrays. Test-only: it
    loads trusted bytes this test produced, so it resolves without restriction."""

    def __init__(self, filename: str, file_handle: io.BufferedIOBase, seen: Set[Tuple[str, str]]) -> None:
        super().__init__(filename, file_handle)
        self.seen = seen

    def find_class(self, module: str, name: str) -> type:
        self.seen.add((module, name))
        if (module, name) == ("joblib.numpy_pickle", "NumpyArrayWrapper"):
            return _RecordingWrapper
        resolved: type = super().find_class(module, name)
        return resolved


def _pickled_globals(predictor: TR.TrainedPredictor) -> FrozenSet[Tuple[str, str]]:
    buf = io.BytesIO()
    joblib.dump(predictor, buf)
    seen: Set[Tuple[str, str]] = set()
    with _read_fileobject(io.BytesIO(buf.getvalue()), "<test>", mmap_mode=None) as fobj:
        _RecordingUnpickler("<test>", fobj, seen).load()
    return frozenset(seen)


@pytest.mark.parametrize("family,driver", PAIRS, ids=[f"{f}-{d}" for f, d in PAIRS])
def test_every_family_round_trips(family: TabularFamily, driver: str) -> None:
    m = _fitted(family, driver)
    art = _build(driver, m, family)
    loaded, env = artifacts.load_v2_envelope(base64.b64decode(art.bytes_base64))
    assert env.classOrder == CASES[family].order and env.taskKind == family
    assert env.featureSchemaHash == ZERO_HASH and [c.name for c in env.featureColumns] == [c.name for c in COLS]
    assert np.allclose(loaded.predict(X), m.predict(X))


def test_allow_list_holds_exactly_the_globals_every_shipped_predictor_pickles() -> None:
    used: Set[Tuple[str, str]] = set()
    for family, driver in PAIRS:
        found = _pickled_globals(_fitted(family, driver))
        refused = sorted(g for g in found if not artifacts._is_allowed_global(*g))
        assert refused == [], f"{family}/{driver} pickles globals the allow-list refuses: {refused}"
        used |= found
    unused = sorted(artifacts.PREDICTOR_V2_GLOBALS - used)
    assert unused == [], f"predictor allow-list pairs no shipped predictor pickles: {unused}"


def test_the_dummy_and_the_incumbent_heuristic_never_ship() -> None:
    for yardstick in (BL.ConstantPredictor(np.array(0.3)), BL.ColumnScorePredictor("__ps_incumbent_score")):
        with pytest.raises(artifacts_v2.NotShippableError):
            artifacts_v2.build("lr", yardstick, COLS, "binary", ["x", "y"], ZERO_HASH, None, None)  # type: ignore[arg-type]  # the refusal under test
    for name in (BL.DUMMY_MEMBER, f"{BL.HEURISTIC_PREFIX}renewal-score"):
        with pytest.raises(artifacts_v2.NotShippableError):
            _build(name, _fitted("binary", "logistic_regression"), "binary")


def _envelope_with_payload(payload: bytes) -> bytes:
    """A complete, valid v2 envelope (built from a real predictor) whose payload is replaced by `payload`, so the
    payload is what reaches the restricted unpickler."""
    envelope = json.loads(base64.b64decode(_build("lr", _fitted("binary", "logistic_regression"), "binary").bytes_base64))
    envelope["payload_b64"] = base64.b64encode(payload).decode("ascii")
    return json.dumps(envelope).encode("utf-8")


def _naming(module: str, name: str) -> bytes:
    """A protocol-2 pickle stream that resolves `module.name` and calls it with no arguments."""
    return b"\x80\x02c" + module.encode("ascii") + b"\n" + name.encode("ascii") + b"\n)R."


def test_a_payload_naming_another_global_is_refused(tmp_path: Path) -> None:
    marker = tmp_path / "ran"

    class Evil:
        def __reduce__(self) -> Tuple[object, Tuple[str]]:
            return (os.system, (f"touch {marker}",))

    with pytest.raises(artifacts.DisallowedGlobalError) as refused:
        artifacts.load_v2_envelope(_envelope_with_payload(pickle.dumps(Evil())))
    assert refused.value.name == "system" and refused.value.module in ("posix", "nt")
    assert not marker.exists()


# Sidecar functions and library names that are NOT on the allow-list: a module prefix must never admit them (the
# snapshot fetcher opens URLs; the trainer and encoder functions run fits and parsing on attacker-chosen arguments).
UNLISTED = [("app.encoding", "normalize"), ("app.snapshot", "fetch_verified"), ("app.snapshot", "_read_bounded"),
            ("app.trainer", "fit_predictor"), ("app.artifacts", "_bytes_to_model"),
            ("sklearn.preprocessing._function_transformer", "anything"), ("sklearn.pipeline", "make_pipeline")]


@pytest.mark.parametrize("module,name", UNLISTED, ids=[f"{m}.{n}" for m, n in UNLISTED])
def test_an_unlisted_global_is_refused_even_beside_allowed_ones(module: str, name: str) -> None:
    assert not artifacts._is_allowed_global(module, name)
    with pytest.raises(artifacts.DisallowedGlobalError) as refused:
        artifacts.load_v2_envelope(_envelope_with_payload(_naming(module, name)))
    assert (refused.value.module, refused.value.name) == (module, name)


def test_an_allowed_object_that_is_not_a_predictor_is_refused() -> None:
    buf = io.BytesIO()
    joblib.dump(Ridge().fit(np.eye(3), np.arange(3.0)), buf)
    with pytest.raises(artifacts.NotATrainerPredictorError):
        artifacts.load_v2_envelope(_envelope_with_payload(buf.getvalue()))


def _complete_envelope(**over: object) -> bytes:
    envelope = json.loads(base64.b64decode(_build("lr", _fitted("binary", "logistic_regression"), "binary").bytes_base64))
    envelope.update(over)
    return json.dumps(envelope).encode("utf-8")


def _truncated_payload() -> bytes:
    buf = io.BytesIO()
    joblib.dump(_fitted("binary", "logistic_regression"), buf)
    return buf.getvalue()[: len(buf.getvalue()) // 2]


MALFORMED: Dict[str, Callable[[], bytes]] = {
    "not-json": lambda: b"not json",
    "v1-format": lambda: json.dumps({"format": "joblib", "version": 1}).encode("utf-8"),
    "missing-fields": lambda: json.dumps({"format": "ps-predictor/v2", "version": 2}).encode("utf-8"),
    "version-3": lambda: _complete_envelope(version=3),
    "invalid-base64": lambda: _complete_envelope(payload_b64="!!!!"),
    "non-ascii-payload": lambda: _complete_envelope(payload_b64="\u00e9t\u00e9"),
    "garbage-payload": lambda: _envelope_with_payload(b"garbage, not a pickle"),
    "truncated-payload": lambda: _envelope_with_payload(_truncated_payload()),
}


@pytest.mark.parametrize("case", sorted(MALFORMED))
def test_a_malformed_envelope_is_refused(case: str) -> None:
    with pytest.raises(artifacts.ArtifactRefusedError):
        artifacts.load_v2_envelope(MALFORMED[case]())


def test_content_hash_conventions_are_pinned() -> None:
    """v1: `model_id` is the SHA-256 of the base64 TEXT. v2: `sha256` is the SHA-256 of the envelope BYTES."""
    v1_b64, model_id = artifacts.serialize_envelope(Ridge().fit(np.eye(3), np.arange(3.0)), {}, [])
    assert model_id == hashlib.sha256(v1_b64.encode("ascii")).hexdigest() == artifacts.artifact_hash(v1_b64)
    art = _build("lr", _fitted("binary", "logistic_regression"), "binary")
    raw = base64.b64decode(art.bytes_base64)
    assert art.sha256 == hashlib.sha256(raw).hexdigest()
    assert art.sha256 != hashlib.sha256(art.bytes_base64.encode("ascii")).hexdigest()


def test_the_envelope_is_deterministic_and_describes_the_columns() -> None:
    m = _fitted("multiclass", "lightgbm")
    first, second = _build("lgbm", m, "multiclass"), _build("lgbm", m, "multiclass")
    assert first.sha256 == second.sha256 and first.class_order == ["x", "y", "z"]
    env = json.loads(base64.b64decode(first.bytes_base64))
    assert env["format"] == "ps-predictor/v2" and env["version"] == 2
    assert env["featureColumns"][2] == {"name": "c", "sourceColumn": "c",
                                        "encoding": {"kind": "categorical", "cardinalityCap": 10, "method": "onehot"}}
    assert env["featureColumns"][0]["encoding"] == {"kind": "numeric"}
    baseline: FArr = np.array([0.1, 0.2], dtype=np.float64)
    with_extras = artifacts_v2.build("lgbm", m, COLS, "multiclass", ["x", "y", "z"], ZERO_HASH, baseline, ["a", "b"])
    _, parsed = artifacts.load_v2_envelope(base64.b64decode(with_extras.bytes_base64))
    assert parsed.driverBaseline == [0.1, 0.2] and parsed.transformedColumns == ["a", "b"]


def _baseline_inputs(baselines: List[Dict[str, str]]) -> Tuple[EvaluationProtocol, TR.EncodedLabel, List[F.Fold]]:
    """A binary label planted on column `b` (and nothing else), the fixture protocol with `baselines`, and its folds."""
    y = (X["b"].to_numpy() >= 3).astype(np.int64)
    p = EvaluationProtocol.model_validate(protocol("binary", baselines=baselines))
    return p, TR.EncodedLabel(y, "binary", ["x", "y"], None), F.repeated_stratified(y, 5, 1, 0, stratify=True)


def test_fit_all_fits_every_declared_tabular_baseline_in_order() -> None:
    declared = [{"kind": "dummy", "name": "base-rate"}, {"kind": "one-feature", "selection": "best-single-feature-inner-cv"},
                {"kind": "glm", "family": "logistic", "penalty": "l2"}, {"kind": "incumbent-heuristic", "name": "renewal-score"}]
    p, enc, folds = _baseline_inputs(declared)
    fitted = BL.fit_all(p, COLS, X, enc, folds, 1, "__ps_incumbent_score")
    assert [(b.name, b.role, b.spec_index) for b in fitted] == [
        ("dummy", "dummy", 0), ("oneFeature", "simple", 1), ("glm", "simple", 2), ("heuristic:renewal-score", "simple", 3)]
    assert np.allclose(fitted[0].predictor.predict(X), np.mean(enc.y))
    one = fitted[1]
    assert one.selected_source == "b" and sorted(one.detail) == ["a", "b", "c", "d", "e"]
    assert one.detail["b"] == min(one.detail.values())
    assert isinstance(fitted[2].predictor, TR.TrainedPredictor)


def test_fit_all_refuses_a_missing_dummy_or_incumbent_column() -> None:
    p, enc, folds = _baseline_inputs([{"kind": "glm", "family": "logistic", "penalty": "l2"}])
    with pytest.raises(ValueError, match="no dummy baseline"):
        BL.fit_all(p, COLS, X, enc, folds, 1, None)
    p, enc, folds = _baseline_inputs([{"kind": "dummy", "name": "base-rate"},
                                      {"kind": "incumbent-heuristic", "name": "renewal-score"}])
    with pytest.raises(ValueError, match="no incumbent-score column"):
        BL.fit_all(p, COLS, X, enc, folds, 1, None)


def test_the_multiclass_dummy_is_the_class_prior() -> None:
    y = np.array([0, 0, 1, 2], dtype=np.int64)
    prior = BL.dummy(TR.EncodedLabel(y, "multiclass", ["x", "y", "z"], None)).predict(X.iloc[:2])
    assert np.allclose(prior, [[0.5, 0.25, 0.25], [0.5, 0.25, 0.25]])


def test_one_feature_scores_each_source_out_of_fold_on_the_given_folds() -> None:
    """Each source's recorded score is the primary score of its single-source GLM's pooled out-of-fold predictions:
    fitted on each repeat-0 fold's training rows, scored on that fold's validation rows. An in-sample score (the GLM
    fitted on every row) differs, so a fit that leaks the validation rows changes the recorded number."""
    p, enc, folds = _baseline_inputs([{"kind": "dummy", "name": "base-rate"}])
    _, _, recorded = BL.one_feature(p, COLS, X, enc, folds, 1)
    primary = scores.primary_score(p.primaryScore.metric, None)
    y = np.asarray(enc.y, dtype=np.float64)
    first = [f for f in folds if f.repeat == 0]
    valid = np.concatenate([f.valid for f in first])
    all_rows = np.arange(N, dtype=np.int64)
    for src in ("a", "c"):
        cols = [c for c in COLS if c.source_column == src]
        oof = np.concatenate([TR.fit_predictor(BL.glm_spec("binary"), cols, X, enc, f.train, p, 1).predict(X.iloc[f.valid])
                              for f in first])
        assert recorded[src] == pytest.approx(primary.aggregate(y[valid], oof), rel=1e-12)
        in_sample = TR.fit_predictor(BL.glm_spec("binary"), cols, X, enc, all_rows, p, 1).predict(X.iloc[valid])
        assert abs(recorded[src] - primary.aggregate(y[valid], in_sample)) > 1e-4
