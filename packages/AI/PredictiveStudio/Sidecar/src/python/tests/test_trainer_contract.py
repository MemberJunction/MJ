"""The pydantic mirror of the trainer contract, the snapshot fixture's bytes, the failure stages and the run clock."""

from __future__ import annotations

import json

import pytest
from pydantic import BaseModel, TypeAdapter, ValidationError

from app.failures import RunClock, TrainerFailure
from app.trainer_schemas import EvaluationProtocol, TrainerCompleted, TrainerFailed, TrainerRequest, TrainerResult
from tests.tools.trainer_fixture import FileServer, candidates, protocol, request, snapshot_files
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

# Copied from Core/src/trainer-contract.ts (TRAINER_REQUEST_KEYS, TRAINER_COMPLETED_KEYS, TRAINER_FAILED_KEYS), whose
# compile-time guards tie each list to its TypeScript type; a member added on either side without the other fails here.
TRAINER_REQUEST_KEYS = [
    "trainingRunId", "snapshot", "incumbent", "protocol", "task", "candidates", "seed", "threads", "timeoutSeconds", "maxRetries",
]
TRAINER_COMPLETED_KEYS = [
    "status", "trainingRunId", "codeVersion", "computeSeconds", "innerScores", "finalist", "holdoutAccess", "holdout",
    "baselines", "comparisons", "gate", "artifacts", "incumbentDiff", "calibration", "slices", "operatingPoint", "cost",
    "importance", "leakageFlags", "predictionIntervalCoverage", "residualDiagnostics", "forecast", "innerSplitContrast",
]
TRAINER_FAILED_KEYS = ["status", "trainingRunId", "stage", "message", "computeSeconds"]
# The members of Core/src/evaluation-protocol.ts EvaluationProtocolSpec, in declaration order.
EVALUATION_PROTOCOL_KEYS = [
    "id", "lineageRootId", "version", "name", "holdout", "innerValidation", "seed", "holdoutAccessBudget", "primaryScore",
    "secondaryMetrics", "baselines", "calibration", "resampling", "intervals", "promotion", "allowedOutcomes",
    "leakageAudit", "exclusions", "slices", "predictionIntervals", "residualDiagnostics", "retrainTriggers", "search",
    "budgets", "minMinorityClassRows", "guardFieldsEditableBy", "authoredBy",
]


@pytest.mark.parametrize("model, keys, count", [
    (TrainerRequest, TRAINER_REQUEST_KEYS, 10),
    (TrainerCompleted, TRAINER_COMPLETED_KEYS, 23),
    (TrainerFailed, TRAINER_FAILED_KEYS, 5),
    (EvaluationProtocol, EVALUATION_PROTOCOL_KEYS, 27),
])
def test_the_mirror_has_exactly_the_typescript_members(model: type[BaseModel], keys: list[str], count: int) -> None:
    assert len(keys) == count
    assert sorted(model.model_fields) == sorted(keys)


def test_contract_round_trips_and_forbids_unknown_fields() -> None:
    server = FileServer()
    try:
        raw = request(server, b"{}\n", b"", TASK, protocol("binary"), candidates("binary"))
    finally:
        server.close()
    req = TrainerRequest.model_validate(raw)
    assert req.protocol.holdoutAccessBudget == 1 and req.candidates[0].driverKey == "logistic_regression"
    assert req.snapshot.featureSchemaHash == raw["snapshot"]["featureSchemaHash"]
    assert TrainerRequest.model_validate_json(req.model_dump_json()) == req
    raw["protocol"]["holdoutAccesBudget"] = 1  # misspelled guard field
    with pytest.raises(ValidationError):
        TrainerRequest.model_validate(raw)


def test_a_download_that_does_not_expire_states_null_lifetime_and_expiry(server: FileServer) -> None:  # noqa: F811
    raw = request(server, b"{}\n", b"", TASK, protocol("binary"), candidates("binary"), expires=None)
    req = TrainerRequest.model_validate(raw)
    assert req.snapshot.matrix.expiresAt is None and req.snapshot.matrix.driverLifetimeSeconds is None


def test_a_failed_result_names_a_contract_stage_and_nothing_else() -> None:
    adapter: TypeAdapter[TrainerCompleted | TrainerFailed] = TypeAdapter(TrainerResult)
    failed = {"status": "failed", "trainingRunId": "00000000-0000-0000-0000-000000000004", "stage": "inner-cv",
              "message": "boom", "computeSeconds": 1.5}
    assert isinstance(adapter.validate_python(failed), TrainerFailed)
    with pytest.raises(ValidationError):
        adapter.validate_python({**failed, "stage": "training"})
    with pytest.raises(ValidationError):
        adapter.validate_python({**failed, "holdout": {}})  # a failure carries no partial metrics


def test_snapshot_files_are_canonical_positional_json_lines() -> None:
    df = binary_frame(6)
    matrix, manifest = snapshot_files(df, FEATS, ["r5"])
    m_lines, n_lines = matrix.decode().splitlines(), manifest.decode().splitlines()
    assert len(m_lines) == 7 and len(n_lines) == 6
    for line in m_lines + n_lines:
        assert line == json.dumps(json.loads(line), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    header = json.loads(m_lines[0])
    assert header["columns"] == ["x1", "x2", "city", "__ps_label"] and header["format"] == "ps-snapshot-matrix/v1"
    assert [json.loads(n)["rowId"] for n in n_lines] == list(df["ID"])
    assert [json.loads(n)["role"] for n in n_lines] == ["development"] * 5 + ["locked-holdout"]
    assert all(isinstance(json.loads(r)[3], int) for r in m_lines[1:])  # an integral label is written as an integer


def test_budget_hard_stop_raises_budget_exceeded() -> None:
    clock = RunClock(timeout_seconds=3600, max_compute_seconds=0.0)
    sum(i * i for i in range(200000))
    with pytest.raises(TrainerFailure) as e:
        clock.check("inner CV")
    assert e.value.stage == "budget-exceeded"


def test_timeout_raises_timeout() -> None:
    clock = RunClock(timeout_seconds=0.0, max_compute_seconds=3600)
    with pytest.raises(TrainerFailure) as e:
        clock.check("inner CV")
    assert e.value.stage == "timeout"
