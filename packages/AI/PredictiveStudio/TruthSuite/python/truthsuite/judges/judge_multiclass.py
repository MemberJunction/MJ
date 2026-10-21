# judge_multiclass.py — Task L4, W9-multiclass: truth-based verdicts for one PS multiclass run.
#
#   judge_multiclass.py <runDir> <worldSeedDir> <freshSeedDir> [--label L] [--regime R] [--selected true|false] [--out-dir DIR]
#
# Minimal multiclass extension of judge.py (ruling for L4). Appends one row to <out-dir>/truth-results-multiclass.csv
# and writes <runDir>/judge-multiclass.json (per-class detail).
#
# Score semantics (established empirically, checked on every row before use):
#   For a multiclass target PS's ScoreRecordSet returns ONE number per row, `score`, and a predicted `class`.
#   The sidecar sets score = P(predicted class) (Sidecar/src/python/app/main.py:621-627). The judge asserts the
#   facts that must hold if that is true: every score >= 1/K (an argmax probability cannot be below 1/K) and every
#   class is one of the K labels. The other K-1 probabilities are NOT returned, so per-class one-vs-rest AUC and a
#   full per-class reliability curve cannot be computed from PS output; what CAN be judged is top-label calibration
#   per predicted class (score vs TrueP_<predicted class> and vs the observed hit rate) and the predicted-class mix.
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import TypedDict

import numpy as np
import numpy.typing as npt
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score

from truthsuite.judges.holdout_rebuild import sqlserver_guid_key

Scalar = str | int | float | bool | None


class HoldoutReconstruction(TypedDict, total=False):
    fetchCap: int | None
    lockedHoldoutFraction: float
    targetColumn: str


class Lineage(TypedDict, total=False):
    lockedHoldoutRowCount: int


class ModelJson(TypedDict, total=False):
    """The fields of the harness's model.json that this judge reads."""
    algorithm: str
    status: str
    trustGrade: str
    canAct: bool
    trainingRowCount: int | None
    holdoutMetrics: dict[str, float] | None
    metrics: dict[str, float] | None
    lineage: Lineage | None
    trust: dict[str, Scalar] | None
    bandCounts: dict[str, int] | None
    outcomeConfig: dict[str, object] | None
    holdoutReconstruction: HoldoutReconstruction


class Semantics(TypedDict):
    k: int
    min_score: float
    rows_below_1_over_k: int
    unknown_classes: list[str]


class Evaluation(TypedDict):
    n: int
    accuracy: float
    oracle_accuracy: float
    majority_accuracy: float
    agreement_with_oracle_argmax: float
    top_label_mean_score: float
    top_label_mean_TrueP: float
    top_label_hit_rate: float
    top_label_mae_vs_TrueP: float
    top_label_calib_slope: float
    oracle_weighted_ovr_auc: float
    per_class: dict[str, dict[str, Scalar]]


class Holdout(TypedDict):
    train_rows_rebuilt: int
    train_rows_ps: int | None
    holdout_n: int
    ps_holdout_accuracy: float | None
    rebuilt_holdout_accuracy: float
    verified: bool
    ps_holdout_auc_weighted_ovr: float | None
    oracle_weighted_ovr_auc_on_ps_holdout: float
    oracle_accuracy_on_ps_holdout: float


def load(truth_csv: str, pred_csv: str) -> tuple[pd.DataFrame, int, int]:
    truth = pd.read_csv(truth_csv)
    pred = pd.read_csv(pred_csv, dtype={'Class': str})
    truth['key'] = truth.EventRegistrationID.str.lower()
    pred['key'] = pred.RecordID.str.lower()
    return truth.merge(pred, on='key', how='inner'), len(truth), len(pred)


def check_semantics(j: pd.DataFrame, classes: list[str]) -> Semantics:
    k = len(classes)
    bad_cls = sorted(set(j.Class) - set(classes))
    below = int((j.Score < 1.0 / k - 1e-9).sum())
    if bad_cls or below:
        raise SystemExit(f'score semantics check failed: unknown classes {bad_cls}, rows with score < 1/{k}: {below}')
    return {'k': k, 'min_score': float(j.Score.min()), 'rows_below_1_over_k': below, 'unknown_classes': bad_cls}


def slope(p: npt.NDArray[np.float64], y: npt.NDArray[np.int64]) -> float | None:
    if len(set(y)) < 2:
        return None
    p = p.clip(1e-6, 1 - 1e-6)
    return float(LogisticRegression(C=1e6).fit(np.log(p / (1 - p)).reshape(-1, 1), y).coef_[0][0])


def evaluate(j: pd.DataFrame, classes: list[str]) -> Evaluation:
    tp = j[[f'TrueP_{c}' for c in classes]].to_numpy()
    y = j.DrawnClass.to_numpy()
    oracle_pred = np.array(classes)[tp.argmax(1)]
    ptrue_of_pred = np.array([j[f'TrueP_{c}'].iloc[i] for i, c in enumerate(j.Class)])
    hit = (j.Class.to_numpy() == y).astype(int)
    per_class: dict[str, dict[str, Scalar]] = {}
    for c in classes:
        m = j.Class.to_numpy() == c
        per_class[c] = {
            'true_rate': round(float((y == c).mean()), 4),
            'predicted_share': round(float(m.mean()), 4),
            'oracle_predicted_share': round(float((oracle_pred == c).mean()), 4),
            'recall': round(float(((j.Class.to_numpy() == c) & (y == c)).sum() / max((y == c).sum(), 1)), 4),
            'oracle_recall': round(float(((oracle_pred == c) & (y == c)).sum() / max((y == c).sum(), 1)), 4),
            'n_predicted': int(m.sum()),
            'mean_score_when_predicted': round(float(j.Score[m].mean()), 4) if m.any() else None,
            'mean_TrueP_when_predicted': round(float(ptrue_of_pred[m].mean()), 4) if m.any() else None,
            'observed_hit_rate_when_predicted': round(float(hit[m].mean()), 4) if m.any() else None,
            'mae_score_vs_TrueP_when_predicted': round(float(np.abs(j.Score[m].to_numpy() - ptrue_of_pred[m]).mean()), 4) if m.any() else None,
            'calib_slope_when_predicted': (round(s, 3) if (s := slope(j.Score[m].to_numpy(), hit[m])) is not None else None) if m.sum() > 20 else None,
            'oracle_ovr_auc': round(float(roc_auc_score((y == c).astype(int), j[f'TrueP_{c}'])), 4),
        }
    return {
        'n': int(len(j)),
        'accuracy': round(float(accuracy_score(y, j.Class)), 4),
        'oracle_accuracy': round(float(accuracy_score(y, oracle_pred)), 4),
        'majority_accuracy': round(float(pd.Series(y).value_counts(normalize=True).iloc[0]), 4),
        'agreement_with_oracle_argmax': round(float((j.Class.to_numpy() == oracle_pred).mean()), 4),
        'top_label_mean_score': round(float(j.Score.mean()), 4),
        'top_label_mean_TrueP': round(float(ptrue_of_pred.mean()), 4),
        'top_label_hit_rate': round(float(hit.mean()), 4),
        'top_label_mae_vs_TrueP': round(float(np.abs(j.Score.to_numpy() - ptrue_of_pred).mean()), 4),
        'top_label_calib_slope': round(slope(j.Score.to_numpy(), hit) or float('nan'), 3),
        'oracle_weighted_ovr_auc': round(float(roc_auc_score(y, tp, multi_class='ovr', average='weighted', labels=classes)), 4),
        'per_class': per_class,
    }


def holdout(world_dir: str, model: ModelJson, j: pd.DataFrame, classes: list[str]) -> Holdout:
    """Rebuild PS's locked holdout (clustered-PK order, trailing 20%) and verify it via PS's holdout ACCURACY
    (AUC cannot be recomputed: PS does not return the full probability vector)."""
    hr = model['holdoutReconstruction']
    rows = pd.read_csv(f'{world_dir}/rows.csv', usecols=['ID', hr['targetColumn']], dtype=str, keep_default_na=False)
    rows['k'] = rows.ID.map(sqlserver_guid_key)
    rows = rows.sort_values('k').reset_index(drop=True)
    fetched = rows.iloc[:hr['fetchCap']] if hr.get('fetchCap') else rows
    lab = fetched[fetched[hr['targetColumn']] != ''].reset_index(drop=True)
    # Task 17a: prefer PS's own lineage holdout count over the harness-recorded fraction (see judge.py).
    lineage: Lineage = model.get('lineage') or {}
    lin_hold = lineage.get('lockedHoldoutRowCount')
    n = len(lab); n_hold = lin_hold if isinstance(lin_hold, int) else int(n * hr['lockedHoldoutFraction']); n_train = n - n_hold
    if isinstance(lin_hold, int) and lin_hold != int(n * hr['lockedHoldoutFraction']):
        print(f'WRONG: harness lockedHoldoutFraction={hr["lockedHoldoutFraction"]} gives holdout '
              f'{int(n * hr["lockedHoldoutFraction"])}, PS lineage says {lin_hold}; using the lineage count', file=sys.stderr)
    ids: set[str] = set(lab.ID.iloc[n_train:].str.lower())
    jh = j[j.key.isin(ids)]
    ps: dict[str, float] = model.get('holdoutMetrics') or {}
    ps_acc = ps.get('accuracy')
    acc = float(accuracy_score(jh.DrawnClass, jh.Class))
    tp = jh[[f'TrueP_{c}' for c in classes]].to_numpy()
    return {
        'train_rows_rebuilt': n_train, 'train_rows_ps': model.get('trainingRowCount'), 'holdout_n': len(jh),
        'ps_holdout_accuracy': ps_acc, 'rebuilt_holdout_accuracy': round(acc, 6),
        'verified': ps_acc is not None and abs(acc - ps_acc) < 1e-9 and n_train == model.get('trainingRowCount'),
        'ps_holdout_auc_weighted_ovr': ps.get('auc'),
        'oracle_weighted_ovr_auc_on_ps_holdout': round(float(roc_auc_score(jh.DrawnClass, tp, multi_class='ovr', average='weighted', labels=classes)), 4),
        'oracle_accuracy_on_ps_holdout': round(float(accuracy_score(jh.DrawnClass, np.array(classes)[tp.argmax(1)])), 4),
    }


def main(run_dir: str, world_dir: str, fresh_dir: str, label: str | None, regime: str | None, selected: bool, out_dir: str | None = None) -> None:
    run_dir = run_dir.rstrip('/')
    model: ModelJson = json.load(open(f'{run_dir}/model.json'))
    man = json.load(open(f'{world_dir}/manifest.json'))
    classes = sorted(man['classRates'])
    j, nt, npred = load(f'{world_dir}/truth.csv', f'{run_dir}/predictions.csv')
    fj, fnt, fnpred = load(f'{fresh_dir}/truth.csv', f'{run_dir}/predictions.fresh.csv')
    sem = check_semantics(j, classes); check_semantics(fj, classes)
    orig = evaluate(j, classes); fresh = evaluate(fj, classes); hold = holdout(world_dir, model, j, classes)
    detail = {'semantics': sem, 'original': orig, 'fresh': fresh, 'holdout': hold,
              'ps_metrics_inner_val': model.get('metrics'), 'ps_holdout_metrics': model.get('holdoutMetrics'),
              'trust': model.get('trust'), 'bandCounts': model.get('bandCounts'), 'outcomeConfig': model.get('outcomeConfig')}
    out_base = Path(out_dir or os.environ.get('TRUTH_RESULTS_DIR') or 'results') / 'judges'
    out_base.mkdir(parents=True, exist_ok=True)
    json.dump(detail, open(f'{run_dir}/judge-multiclass.json', 'w'), indent=1)
    row: dict[str, Scalar] = {
        'world': man['id'], 'seed': man['seed'], 'label': label or os.path.basename(run_dir), 'regime': regime, 'selected': selected,
        'algorithm': model['algorithm'], 'status': model['status'], 'trust': model['trustGrade'], 'canAct': model['canAct'],
        'train_rows': model.get('trainingRowCount'), 'coverage_pct': round(100 * len(j) / nt, 3), 'fresh_coverage_pct': round(100 * len(fj) / fnt, 3),
        'ps_holdout_auc_weighted_ovr': hold['ps_holdout_auc_weighted_ovr'], 'oracle_auc_on_ps_holdout': hold['oracle_weighted_ovr_auc_on_ps_holdout'],
        'holdout_rebuild_verified': hold['verified'], 'ps_holdout_accuracy': hold['ps_holdout_accuracy'],
        'oracle_accuracy_on_ps_holdout': hold['oracle_accuracy_on_ps_holdout'],
        'fresh_accuracy': fresh['accuracy'], 'fresh_oracle_accuracy': fresh['oracle_accuracy'], 'fresh_majority_accuracy': fresh['majority_accuracy'],
        'fresh_top_label_mean_score': fresh['top_label_mean_score'], 'fresh_top_label_mean_TrueP': fresh['top_label_mean_TrueP'],
        'fresh_top_label_hit_rate': fresh['top_label_hit_rate'], 'fresh_top_label_mae_vs_TrueP': fresh['top_label_mae_vs_TrueP'],
        'fresh_top_label_calib_slope': fresh['top_label_calib_slope'],
        **{f'fresh_pred_share_{c}': fresh['per_class'][c]['predicted_share'] for c in classes},
        **{f'fresh_recall_{c}': fresh['per_class'][c]['recall'] for c in classes},
    }
    out_csv = out_base / 'truth-results-multiclass.csv'
    new = pd.DataFrame([row])
    if out_csv.exists():
        old = pd.read_csv(out_csv, dtype=str, keep_default_na=False)
        cols = list(old.columns) + [c for c in new.columns if c not in old.columns]
        pd.concat([old, new.map(lambda v: '' if v is None else str(v))], ignore_index=True).reindex(columns=cols).to_csv(out_csv, index=False)
    else:
        new.to_csv(out_csv, index=False)
    print(json.dumps(detail, indent=1))


if __name__ == '__main__':
    pos: list[str] = []; kw: dict[str, str] = {}
    a = sys.argv[1:]; i = 0
    while i < len(a):
        if a[i].startswith('--'):
            kw[a[i][2:]] = a[i + 1]; i += 2
        else:
            pos.append(a[i]); i += 1
    main(pos[0], pos[1], pos[2], kw.get('label'), kw.get('regime'), kw.get('selected', 'true').lower() == 'true', kw.get('out-dir'))
