# verdicts.py — Task L4 Step 2: per-world pass/fail checks against the planted truth.
#   python -m truthsuite.judges.verdicts [--results-dir DIR] [--data-dir DIR]
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import cast

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score

from truthsuite.judges.holdout_rebuild import sqlserver_guid_key
from truthsuite.judges.judge import ModelJson, calib_slope, reconstruct_holdout
from truthsuite.paths import data_root

TRUE_DRIVERS: list[str] = ['EventsAttended', 'Plan=Premium', 'AutoRenew', 'IncomeK']


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float('nan'), float('nan'))
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def hm_se(auc: float, n_pos: int, n_neg: int) -> float:
    """Hanley & McNeil (1982) standard error of an AUC."""
    q1 = auc / (2 - auc); q2 = 2 * auc * auc / (1 + auc)
    v = (auc * (1 - auc) + (n_pos - 1) * (q1 - auc * auc) + (n_neg - 1) * (q2 - auc * auc)) / (n_pos * n_neg)
    return math.sqrt(max(v, 0.0))


def hm_ci_logit(auc: float, n_pos: int, n_neg: int) -> list[float] | None:
    """Hanley-McNeil 95% interval computed on the logit scale (bounded in (0,1)); None when AUC is 0 or 1."""
    if not 0 < auc < 1 or n_pos == 0 or n_neg == 0:
        return None
    se = hm_se(auc, n_pos, n_neg); lg = math.log(auc / (1 - auc)); sl = se / (auc * (1 - auc))
    def inv(v: float) -> float:
        return 1.0 / (1.0 + math.exp(-v))
    return [round(inv(lg - 1.96 * sl), 3), round(inv(lg + 1.96 * sl), 3)]


def pf(b: bool) -> str:
    return 'PASS' if b else 'FAIL'


def main(results_dir: str | None = None, data_dir: str | None = None) -> dict[str, object]:
    rbase = Path(results_dir or os.environ.get('TRUTH_RESULTS_DIR') or 'results') / 'judges'
    dbase = Path(data_dir) if data_dir else data_root()
    R = pd.read_csv(rbase / 'truth-results.csv', keep_default_na=False, na_values=[''])
    R['label'] = R.label.fillna(R.path)
    OUT: dict[str, object] = {}
    DL: dict[str, dict[str, object]] = json.loads((rbase / 'L4-delong.json').read_text())

    def delong(world: str, seed: int, label: str) -> dict[str, object]:
        return DL[f'{world}/{seed}/{label}']

    def run_dir(world: str, seed: int, label: str) -> str:
        return str(rbase / 'truth-runs' / world / str(seed) / label)

    def model_of(world: str, seed: int, label: str) -> dict[str, object]:
        return cast(dict[str, object], json.load(open(f'{run_dir(world, seed, label)}/model.json')))

    def holdout_counts(world: str, seed: int, label: str) -> tuple[int, int]:
        row = R[(R.world == world) & (R.seed == seed) & (R.label == label)].iloc[0]
        if not pd.isna(row.get('holdout_n')):
            return int(row.holdout_n), int(row.holdout_neg)
        m = model_of(world, seed, label.split('/')[0])
        w_obj = m.get('world')
        w_dict = w_obj if isinstance(w_obj, dict) else {}
        wdir = str(w_dict.get('worldDir') or (dbase / 'worlds' / world / f'seed-{seed}'))
        ids, _ = reconstruct_holdout(wdir, cast(ModelJson, m))
        t = pd.read_csv(f'{wdir}/truth.csv')
        t = t[t.MembershipYearID.str.lower().isin(ids or set()) & (t.Censored == 0)]
        return len(t), int((t.Drawn == 0).sum())

    def learned_signs(world: str, seed: int, label: str, fresh_dir: str) -> dict[str, float]:
        p = pd.read_csv(f'{run_dir(world, seed, label)}/predictions.fresh.csv', dtype={'Class': str})
        rows = pd.read_csv(f'{fresh_dir}/rows.csv', keep_default_na=False, na_values=[''])
        rows['Region'] = rows.Region.fillna('(blank)')
        rows['key'] = rows.ID.str.lower(); p['key'] = p.RecordID.str.lower()
        j = rows.merge(p, on='key')
        X = pd.DataFrame({
            'EventsAttended': j.EventsAttended, 'Plan=Premium': (j.Plan == 'Premium').astype(float), 'AutoRenew': j.AutoRenew.astype(float),
            'IncomeK': j.IncomeK, 'Year': j.Year, **{f'Noise{i}': j[f'Noise{i}'] for i in range(1, 6)},
            **{f'Region={r}': (j.Region == r).astype(float) for r in sorted(j.Region.unique())[1:]},
        })
        s = j.Score.clip(1e-6, 1 - 1e-6)
        y = np.log(s / (1 - s))
        A = np.column_stack([np.ones(len(X)), X.to_numpy(dtype=float)])
        coef = np.linalg.lstsq(A, y, rcond=None)[0][1:]
        return {str(k): float(v) for k, v in zip(X.columns, coef)}

    w1: list[dict[str, object]] = []
    w1_rows = R[(R.world == 'W1-signal') & ((R.label.str.startswith('full')) | (R.label == 'agent'))]
    for _, r in w1_rows.iterrows():
        n, neg = holdout_counts('W1-signal', int(r.seed), str(r.label))
        se = hm_se(float(r.ps_reported_holdout_auc), n - neg, neg)
        signs = learned_signs('W1-signal', int(r.seed), str(r.label), str(dbase / 'worlds/W1-signal/seed-9042'))
        c = {
            'C1': bool(r.fresh_auc >= r.fresh_oracle_auc - 0.03),
            'C2': bool(abs(r.model_optimism) <= 1.96 * se),
            'C3': bool(0.8 <= r.fresh_calib_slope <= 1.2),
            'C4': bool(r.best_true_driver_rank < r.best_noise_rank),
            'C5': all(signs[k] > 0 for k in TRUE_DRIVERS),
        }
        rec: dict[str, object] = {
            'seed': int(r.seed), 'label': r.label, 'regime': r.regime, 'algorithm': r.algorithm, 'selected': str(r.selected) == 'True',
            'status': r.status, 'trust': r.trust, 'train_rows': int(r.train_rows), 'holdout_n': n, 'holdout_neg': neg,
            'reported': round(float(r.ps_reported_holdout_auc), 4), 'hm_halfwidth': round(1.96 * se, 4),
            'oracle_on_holdout': r.oracle_auc_on_ps_holdout, 'fresh_auc': r.fresh_auc, 'fresh_oracle': r.fresh_oracle_auc,
            'model_optimism': r.model_optimism, 'slope': r.fresh_calib_slope, 'mae_trueP': r.fresh_mean_abs_err_vs_trueP,
            'true_rank': int(r.best_true_driver_rank), 'noise_rank': int(r.best_noise_rank),
            'signs': {k: round(v, 3) for k, v in signs.items() if k in TRUE_DRIVERS}, 'checks': c,
        }
        w1.append(rec)
    OUT['W1'] = w1

    w2 = R[(R.world == 'W2-noise') & (R.label == 'agent')].copy()
    w2c = R[(R.world == 'W2-noise') & (R.label.str.startswith('agent/'))].copy()
    k_pub = int((w2.status == 'Published').sum()); n2 = len(w2)
    k_act = int((w2.canAct.astype(str) == 'True').sum())
    lo, hi = wilson(k_pub, n2)
    allc = pd.concat([w2, w2c])
    OUT['W2'] = {
        'n': n2, 'published': k_pub, 'wilson': [lo, hi], 'canAct': k_act,
        'winners': w2[['seed', 'algorithm', 'ps_reported_holdout_auc', 'fresh_auc', 'trust', 'status', 'canAct']].to_dict('records'),
        'candidates': allc[['seed', 'label', 'algorithm', 'ps_reported_holdout_auc', 'fresh_auc', 'trust', 'status']].to_dict('records'),
    }

    w3 = R[R.world == 'W3-leak-row']
    w3rec: list[dict[str, object]] = []
    for _, r in w3.iterrows():
        dl = delong('W3-leak-row', 42, str(r.label))
        lf = str(r.leakageFlag) == 'True'
        w3rec.append({
            'label': r.label, 'regime': r.regime, 'algorithm': r.algorithm, 'status': r.status, 'trust': r.trust, 'leakageFlag': lf,
            'reported': round(float(r.ps_reported_holdout_auc), 4), 'oracle_on_holdout': r.oracle_auc_on_ps_holdout,
            'delong_z': dl['z'], 'delong_p': dl['p_two_sided'], 'delong_se_diff': dl['se_diff'], 'holdout_n': dl['n'],
            'fresh_auc': r.fresh_auc, 'train_rows': int(r.train_rows),
        })
    OUT['W3'] = w3rec

    w4 = R[R.world == 'W4-pit']
    w4rec: list[dict[str, object]] = []
    for _, r in w4.iterrows():
        dl = delong('W4-pit', 42, str(r.label))
        lf = str(r.leakageFlag) == 'True'
        m = model_of('W4-pit', 42, str(r.label))
        fi_raw = m.get('featureImportance')
        fi = fi_raw if isinstance(fi_raw, dict) else {}
        tot = sum(abs(float(v)) for v in fi.values() if isinstance(v, (int, float))) or 1.0
        pit_share = sum(abs(float(v)) for k, v in fi.items() if str(k).startswith('PersonStatusNow') and isinstance(v, (int, float))) / tot
        lin_raw = m.get('lineage')
        lin = lin_raw if isinstance(lin_raw, dict) else {}
        w4rec.append({
            'label': r.label, 'algorithm': r.algorithm, 'leakageFlag': lf, 'trust': r.trust, 'canAct': str(r.canAct) == 'True',
            'reported': round(float(r.ps_reported_holdout_auc), 4), 'oracle_on_holdout': r.oracle_auc_on_ps_holdout,
            'delong_z': dl['z'], 'delong_p': dl['p_two_sided'], 'delong_se_diff': dl['se_diff'],
            'fresh_auc': r.fresh_auc, 'mae_trueP': r.fresh_mean_abs_err_vs_trueP, 'pit_importance_share': round(pit_share, 3),
            'asOf': lin.get('asOfStrategy'),
        })
    OUT['W4'] = w4rec

    _ = (sqlserver_guid_key, brier_score_loss, roc_auc_score, calib_slope)
    (rbase / 'L4-verdicts.json').write_text(json.dumps(OUT, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o)))
    return OUT


if __name__ == '__main__':
    rdir: str | None = None
    ddir: str | None = None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == '--results-dir':
            rdir = args[i + 1]; i += 2
        elif args[i] == '--data-dir':
            ddir = args[i + 1]; i += 2
        else:
            i += 1
    print(json.dumps(main(rdir, ddir), indent=1))
