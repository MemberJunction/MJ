# judge.py — truth-based verdicts for one PS run (Task L3, PS ML-soundness review)
#
#   judge.py <runDir> <worldSeedDir> <freshSeedDir> [--label L] [--regime R] [--selected true|false] [--out-dir DIR]
#
# L4 additions: label/regime/selected columns, holdout n/neg (for Hanley-McNeil), calibration-in-the-large,
# target column taken from model.json.holdoutReconstruction.targetColumn, union-of-columns CSV append.
#
# Joins the harness's predictions to the world's truth.csv (which never entered the DB) and appends one row
# to <out-dir>/truth-results.csv.
#
# p_positive rule (established empirically in the L3 smoke runs):
#   PS's stored `score` for a binary target is P(label == lexicographically-last class) on EVERY row,
#   independent of the predicted `class` (sidecar main.py:622-624; MLModelInferenceProcessor.toPayload passes
#   it through unchanged, ml-model-inference-processor.ts:362-384). For the bit target `Renewed` the classes
#   arrive as the strings "false"/"true" | "0"/"1" | "False"/"True", so the last class is the positive one and
#   p_positive = score. The judge refuses to guess: it asserts the observed class labels form a binary set
#   whose lexicographically-last member is a "positive" token, and it checks the score/class consistency
#   (class == last label  <=>  score >= 0.5 for every row) before using the rule.
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import TypedDict

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score

from truthsuite.judges.holdout_rebuild import sqlserver_guid_key

Scalar = str | int | float | bool | None
FloatArray = npt.NDArray[np.float64]


class HoldoutReconstruction(TypedDict, total=False):
    order: str
    fetchCap: int | None
    fetchCapSource: str
    lockedHoldoutFraction: float
    targetColumn: str


class Lineage(TypedDict, total=False):
    lockedHoldoutRowCount: int
    trainingRowCount: int


class ModelJson(TypedDict, total=False):
    """The fields of the harness's model.json that this judge reads (probe-truth-harness.ts writes them)."""
    algorithm: str
    status: str
    trustGrade: str
    canAct: bool
    leakageNote: str | None
    publishedBy: str | None
    trainingRowCount: int | None
    featureImportance: dict[str, float | str] | None
    holdoutMetrics: dict[str, float] | None
    metrics: dict[str, float] | None
    lineage: Lineage | None
    regime: str | None
    holdoutReconstruction: HoldoutReconstruction

POSITIVE_TOKENS = {'1', 'true', 'True', 'TRUE', 'Renewed', 'yes', 'Yes'}


def p_positive(pred: pd.DataFrame) -> FloatArray:
    """P(Renewed=1) from PS Score/Class, per the empirically established rule above."""
    labels = sorted(set(pred.Class.astype(str)))
    if not 1 <= len(labels) <= 2:
        raise SystemExit(f'p_positive: expected a binary class set, got {labels}')
    last = labels[-1]
    if labels in (['False'], ['false'], ['0']):
        # the model predicted the negative class for EVERY row (seen: W7 logistic_regression, 5-8% positives).
        # The sidecar still returns scores[:, 1] = P(encoded class 1) because the label map has 2 classes
        # (main.py:621-624); consistent iff no score exceeds 0.5.
        s: FloatArray = pred.Score.to_numpy(dtype=np.float64)
        if (s > 0.5).any():
            raise SystemExit(f'p_positive: all-negative class set but {int((s > 0.5).sum())} scores > 0.5')
        return s
    if last not in POSITIVE_TOKENS:
        raise SystemExit(f'p_positive: lexicographically-last class {last!r} is not a positive token; rule does not apply')
    s = pred.Score.to_numpy(dtype=np.float64)
    is_last = pred.Class.astype(str).to_numpy() == last
    # an exact 0.5 is a tie: sklearn's argmax picks the FIRST class (False) while score >= 0.5 — seen only for
    # random_forest (vote fractions), e.g. W1-signal s43: 23 rows, all Score == 0.5 exactly, all Class 'False'
    inconsistent = int(np.sum((is_last != (s >= 0.5)) & (s != 0.5)))
    if inconsistent:
        raise SystemExit(f'p_positive: {inconsistent} rows where class==\'{last}\' disagrees with score>=0.5 — Score is not P({last})')
    return s


def reconstruct_holdout(world_dir: str, model: ModelJson) -> tuple[set[str] | None, str]:
    """Rebuild PS's locked holdout (row ids) from the documented engine behaviour recorded by the harness in
    model.json.holdoutReconstruction: first `fetchCap` rows in clustered-PK order, drop null labels, trailing
    floor(n * fraction). Returns (ids, note); ids is None when the rebuild cannot be checked against PS's counts."""
    hr = model.get('holdoutReconstruction')
    if not hr:
        return None, 'no holdoutReconstruction in model.json'
    tcol = hr.get('targetColumn', 'Renewed')
    rows = pd.read_csv(f'{world_dir}/rows.csv', usecols=['ID', tcol], dtype=str, keep_default_na=False).rename(columns={tcol: 'Renewed'})
    rows['k'] = rows.ID.map(sqlserver_guid_key)
    rows = rows.sort_values('k').reset_index(drop=True)
    cap = hr.get('fetchCap')
    fetched = rows.iloc[:cap] if cap else rows
    labeled = fetched[fetched.Renewed != ''].reset_index(drop=True)
    n = len(labeled)
    # Task 17a: take the holdout size from PS's own lineage (lockedHoldoutRowCount) when present, instead of trusting
    # the harness-recorded fraction; a disagreement between the two is reported as WRONG, not as merely unverified.
    frac_hold = min(max(int(n * hr['lockedHoldoutFraction']), 1 if hr['lockedHoldoutFraction'] > 0 else 0), n - 1)
    lineage: Lineage = model.get('lineage') or {}
    lin_hold = lineage.get('lockedHoldoutRowCount')
    n_hold = lin_hold if isinstance(lin_hold, int) else frac_hold
    src = 'lineage.lockedHoldoutRowCount' if isinstance(lin_hold, int) else 'holdoutReconstruction.lockedHoldoutFraction'
    n_train = n - n_hold
    if isinstance(lin_hold, int) and lin_hold != frac_hold:
        print(f'WRONG: harness lockedHoldoutFraction={hr["lockedHoldoutFraction"]} gives holdout {frac_hold}, '
              f'PS lineage says {lin_hold}; using the lineage count', file=sys.stderr)
    ps_train = model.get('trainingRowCount')
    if ps_train is not None and n_train != ps_train:
        return None, f'WRONG: rebuild gives {n_train} training rows, PS reports {ps_train} (holdout from {src})'
    ids: set[str] = set(labeled.ID.iloc[n_train:].str.lower())
    return ids, f'fetched={len(fetched)} labeled={n} train={n_train} holdout={n_hold} (from {src})'


def calib_slope(p: FloatArray, y: npt.NDArray[np.int64]) -> float:
    p = p.clip(1e-6, 1 - 1e-6)
    return float(LogisticRegression(C=1e6).fit(np.log(p / (1 - p)).reshape(-1, 1), y).coef_[0][0])


def join_truth(truth_csv: str, pred_csv: str) -> tuple[pd.DataFrame, int, int]:
    truth = pd.read_csv(truth_csv)
    pred = pd.read_csv(pred_csv, dtype={'Class': str})
    truth['key'] = truth.MembershipYearID.str.lower()
    pred['key'] = pred.RecordID.str.lower()
    j = truth.merge(pred, on='key', how='inner')  # key = lowercase MembershipYearID
    return j[j.Censored == 0], len(truth), len(j)


def rank_of(fi: dict[str, float], names: list[str]) -> int | None:
    order = sorted(fi, key=lambda k: -abs(float(fi[k])))
    ranks = [order.index(k) for k in names if k in order]
    return min(ranks) if ranks else None


def append_row(row: dict[str, Scalar], out_dir: str | None = None) -> None:
    base = Path(out_dir or os.environ.get('TRUTH_RESULTS_DIR') or 'results') / 'judges'
    base.mkdir(parents=True, exist_ok=True)
    out = base / 'truth-results.csv'
    new = pd.DataFrame([row])
    if out.exists():
        old = pd.read_csv(out, dtype=str, keep_default_na=False)
        cols = list(old.columns) + [c for c in new.columns if c not in old.columns]
        pd.concat([old, new.map(lambda v: '' if v is None else str(v))], ignore_index=True).reindex(columns=cols).to_csv(out, index=False)
    else:
        new.to_csv(out, index=False)


def main(run_dir: str, world_dir: str, fresh_dir: str, label: str | None = None, regime: str | None = None, selected: bool = True, out_dir: str | None = None) -> None:
    run_dir = run_dir.rstrip('/')
    model: ModelJson = json.load(open(f'{run_dir}/model.json'))
    man = json.load(open(f'{world_dir}/manifest.json'))
    fman = json.load(open(f'{fresh_dir}/manifest.json'))
    j, n_truth, n_join = join_truth(f'{world_dir}/truth.csv', f'{run_dir}/predictions.csv')
    ft, nf_truth, nf_join = join_truth(f'{fresh_dir}/truth.csv', f'{run_dir}/predictions.fresh.csv')
    p = p_positive(j); y = j.Drawn.to_numpy()
    pf = p_positive(ft); yf = ft.Drawn.to_numpy()

    fi: dict[str, float] = {k: float(v) for k, v in (model.get('featureImportance') or {}).items() if isinstance(v, (int, float))}
    true_names = sorted(man['betas'], key=lambda k: -abs(man['betas'][k]))
    true_cols = [k for k in fi if any(k.startswith(t) or k.endswith('_' + t) or k.endswith('=' + t) for t in true_names)]
    noise_cols = [k for k in fi if k.startswith(('Noise', 'PostalCode', 'MemberNumber', 'Region'))]

    # PS's locked holdout, rebuilt from truth-side row order; verified by re-computing PS's own holdout AUC
    hold_ids, hold_note = reconstruct_holdout(world_dir, model)
    ps_hold = (model.get('holdoutMetrics') or {}).get('auc')
    oracle_on_hold: float | None = None; model_on_hold: float | None = None; hold_verified = False
    hold_n: int | None = None; hold_neg: int | None = None
    if hold_ids is not None:
        jh = j[j.key.isin(hold_ids)]
        if jh.Drawn.nunique() > 1:
            oracle_on_hold = round(float(roc_auc_score(jh.Drawn, jh.TrueP)), 4)
            model_on_hold = float(roc_auc_score(jh.Drawn, p_positive(jh)))
            hold_verified = ps_hold is not None and abs(model_on_hold - ps_hold) < 1e-9
        hold_n, hold_neg = len(jh), int((jh.Drawn == 0).sum())
        hold_note += f' n={hold_n} neg={hold_neg}'
    print(f'holdout reconstruction: {hold_note}; model AUC on rebuilt holdout={model_on_hold} vs PS {ps_hold} -> verified={hold_verified}', file=sys.stderr)

    orig_auc: float | None = round(float(roc_auc_score(y, p)), 4) if len(set(y)) > 1 else None
    fresh_auc: float | None = round(float(roc_auc_score(yf, pf)), 4) if len(set(yf)) > 1 else None
    oracle_hold_verified: float | None = oracle_on_hold if hold_verified else None
    fresh_oracle_auc = round(float(fman['oracle']['auc']), 4)
    row: dict[str, Scalar] = {
        'world': man['id'], 'seed': man['seed'], 'path': os.path.basename(run_dir), 'algorithm': model['algorithm'],
        'status': model['status'], 'trust': model['trustGrade'], 'canAct': model['canAct'],
        'leakageFlag': bool(model.get('leakageNote')), 'publishedBy': model.get('publishedBy'),
        'train_rows': model.get('trainingRowCount'),
        'coverage_pct': round(100 * n_join / n_truth, 3), 'fresh_coverage_pct': round(100 * nf_join / nf_truth, 3),
        'oracle_auc': round(man['oracle']['auc'], 4),
        'ps_reported_holdout_auc': ps_hold,
        # MLModel.Metrics = the sidecar's INNER validation fold (20% of the dev rows, main.py:349-362), not train AUC
        'ps_reported_inner_val_auc': (model.get('metrics') or {}).get('auc'),
        'oracle_auc_on_ps_holdout': oracle_hold_verified,
        'holdout_rebuild_verified': hold_verified,
        'orig_auc': orig_auc,
        'fresh_oracle_auc': fresh_oracle_auc,
        'fresh_auc': fresh_auc,
        'fresh_oracle_brier': round(fman['oracle']['brier'], 4),
        'fresh_brier': round(float(brier_score_loss(yf, pf)), 4),
        'fresh_mean_abs_err_vs_trueP': round(float(np.mean(np.abs(pf - ft.TrueP.to_numpy()))), 4),
        'fresh_calib_slope': round(calib_slope(pf, yf), 3),
        'fresh_spearman_vs_trueP': round(float(spearmanr(pf, ft.TrueP).statistic), 3),
        'best_true_driver_rank': rank_of(fi, true_cols), 'best_noise_rank': rank_of(fi, noise_cols),
        'optimism': None, 'holdout_luck': None, 'model_optimism': None,
        'label': label or os.path.basename(run_dir), 'regime': regime or model.get('regime'), 'selected': selected,
        'holdout_n': hold_n, 'holdout_neg': hold_neg,
        'fresh_mean_p': round(float(pf.mean()), 4), 'fresh_mean_trueP': round(float(ft.TrueP.mean()), 4),
        'n_features_imp': len(fi),
    }
    if ps_hold is not None and fresh_auc is not None:
        # optimism = reported holdout AUC − achieved fresh AUC
        optimism = round(ps_hold - fresh_auc, 4)
        row['optimism'] = optimism
        if oracle_hold_verified is not None:
            # holdout_luck = how much easier PS's holdout rows were than the fresh population, for the ORACLE
            holdout_luck = round(oracle_hold_verified - fresh_oracle_auc, 4)
            row['holdout_luck'] = holdout_luck
            # model_optimism = optimism not explained by holdout luck
            #                = (PS holdout − oracle on those rows) − (fresh AUC − fresh oracle)
            row['model_optimism'] = round(optimism - holdout_luck, 4)
    append_row(row, out_dir=out_dir)
    print(json.dumps(row, indent=1))


def parse_cli(argv: list[str]) -> tuple[list[str], dict[str, str]]:
    pos: list[str] = []; kw: dict[str, str] = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            kw[argv[i][2:]] = argv[i + 1]; i += 2
        else:
            pos.append(argv[i]); i += 1
    return pos, kw


if __name__ == '__main__':
    pos, kw = parse_cli(sys.argv[1:])
    main(pos[0], pos[1], pos[2], kw.get('label'), kw.get('regime'), kw.get('selected', 'true').lower() == 'true', kw.get('out-dir'))
