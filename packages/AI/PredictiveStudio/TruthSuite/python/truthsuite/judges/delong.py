# delong.py — PAIRED DeLong test of PS's model vs the oracle (true probabilities) on the
# exact rows PS held out. The oracle's AUC on those rows is itself an estimate from the same labels, so the
# comparison must be paired (DeLong, DeLong & Clarke-Pearson 1988; fast form of Sun & Xu 2014).
from __future__ import annotations

import glob
import json
import math
import os
import sys
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd
from scipy.stats import norm

from truthsuite.judges.judge import ModelJson, reconstruct_holdout


def midrank(x: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    return pd.Series(x).rank(method='average').to_numpy(dtype=np.float64)


def delong_paired_z(
    y: Sequence[int] | npt.NDArray[np.int64],
    a: Sequence[float] | npt.NDArray[np.float64],
    b: Sequence[float] | npt.NDArray[np.float64],
) -> float:
    """Paired DeLong z-statistic for AUC(a) - AUC(b) on the same labelled rows (y in {0,1})."""
    y_arr = np.asarray(y, dtype=np.int64)
    a_arr = np.asarray(a, dtype=np.float64)
    b_arr = np.asarray(b, dtype=np.float64)
    pos, neg = y_arr == 1, y_arr == 0
    m, n = int(pos.sum()), int(neg.sum())
    v10: list[npt.NDArray[np.float64]] = []
    v01: list[npt.NDArray[np.float64]] = []
    aucs: list[float] = []
    for s in (a_arr, b_arr):
        tx, ty, tz = midrank(s[pos]), midrank(s[neg]), midrank(s)
        auc = float((tz[pos].sum() - m * (m + 1) / 2) / (m * n))
        v10.append((tz[pos] - tx) / n)
        v01.append(1.0 - (tz[neg] - ty) / m)
        aucs.append(auc)
    s10 = np.cov(np.vstack(v10))
    s01 = np.cov(np.vstack(v01))
    S = s10 / m + s01 / n
    var = float(S[0, 0] + S[1, 1] - 2 * S[0, 1])
    d = aucs[0] - aucs[1]
    return d / math.sqrt(var) if var > 0 else float('inf') if d > 0 else float('nan')


def delong_paired(
    y: npt.NDArray[np.int64],
    a: npt.NDArray[np.float64],
    b: npt.NDArray[np.float64],
) -> dict[str, object]:
    """Paired DeLong for AUC(a) - AUC(b) on the same labelled rows (y in {0,1})."""
    pos, neg = y == 1, y == 0
    m, n = int(pos.sum()), int(neg.sum())
    out: dict[str, object] = {}
    v10: list[npt.NDArray[np.float64]] = []
    v01: list[npt.NDArray[np.float64]] = []
    aucs: list[float] = []
    for s in (a, b):
        tx, ty, tz = midrank(s[pos]), midrank(s[neg]), midrank(s)
        auc = float((tz[pos].sum() - m * (m + 1) / 2) / (m * n))
        v10.append((tz[pos] - tx) / n)          # structural components for positives
        v01.append(1.0 - (tz[neg] - ty) / m)    # ... and negatives
        aucs.append(auc)
    s10 = np.cov(np.vstack(v10)); s01 = np.cov(np.vstack(v01))
    S = s10 / m + s01 / n
    var = float(S[0, 0] + S[1, 1] - 2 * S[0, 1])
    d = aucs[0] - aucs[1]
    z = d / math.sqrt(var) if var > 0 else float('inf') if d > 0 else float('nan')
    out.update({'n': len(y), 'pos': m, 'neg': n, 'auc_model': round(aucs[0], 6), 'auc_oracle': round(aucs[1], 6),
                'diff': round(d, 6), 'se_diff': round(math.sqrt(max(var, 0.0)), 6),
                'z': round(z, 2) if math.isfinite(z) else str(z),
                'p_two_sided': float(2 * norm.sf(abs(z))) if math.isfinite(z) else None,
                'se_model': round(math.sqrt(max(float(S[0, 0]), 0.0)), 6), 'se_oracle': round(math.sqrt(max(float(S[1, 1]), 0.0)), 6)})
    return out


def run(run_dir: str) -> dict[str, object] | None:
    m: ModelJson = json.load(open(f'{run_dir}/model.json'))
    parent = os.path.dirname(run_dir) if os.path.basename(run_dir).startswith('cand-') else run_dir
    pm: dict[str, object] = json.load(open(f'{parent}/model.json'))
    if pm.get('target', 'Renewed') != 'Renewed':
        return None
    w_raw = pm.get('world')
    w: dict[str, object] = w_raw if isinstance(w_raw, dict) else {}
    wdir_raw = w.get('worldDir')
    wdir = str(wdir_raw) if isinstance(wdir_raw, str) else f"data/worlds/{w.get('id')}/seed-{w.get('seed')}"
    ids, _ = reconstruct_holdout(wdir, m)
    if ids is None:
        return None
    t = pd.read_csv(f'{wdir}/truth.csv'); t['key'] = t.MembershipYearID.str.lower()
    p = pd.read_csv(f'{run_dir}/predictions.csv', dtype={'Class': str}); p['key'] = p.RecordID.str.lower()
    rows = pd.read_csv(f'{wdir}/rows.csv', usecols=['ID', 'Renewed']); rows['key'] = rows.ID.str.lower()
    j = t.merge(p, on='key').merge(rows[['key', 'Renewed']], on='key')
    j = j[j.key.isin(ids)]
    y = j.Renewed.to_numpy().astype(np.int64)   # the labels PS was graded on (== Drawn except W5's censored rows)
    r = delong_paired(y, j.Score.to_numpy(dtype=np.float64), j.TrueP.to_numpy(dtype=np.float64))
    ps_rep = (m.get('holdoutMetrics') or {}).get('auc')
    r['ps_reported'] = ps_rep
    auc_m = r.get('auc_model')
    r['verified'] = bool(ps_rep is not None and isinstance(auc_m, float) and abs(auc_m - ps_rep) < 1e-6)
    r['algorithm'] = m.get('algorithm')
    return r


def main(results_dir: str | None = None) -> dict[str, dict[str, object]]:
    base = Path(results_dir or os.environ.get('TRUTH_RESULTS_DIR') or 'results') / 'judges'
    base.mkdir(parents=True, exist_ok=True)
    runs_root = base / 'truth-runs'
    res: dict[str, dict[str, object]] = {}
    patterns = [str(runs_root / '*/*/*/model.json'), str(runs_root / '*/*/*/cand-*/model.json')]
    for mj in sorted(glob.glob(patterns[0]) + glob.glob(patterns[1])):
        d = os.path.dirname(mj)
        if 'aborted' in d or not any(w in d for w in ('W3-leak-row', 'W4-pit', 'W7-small', 'W1-signal/42', 'W5-censor')):
            continue
        r = run(d)
        if r is None:
            continue
        key = d.replace(f'{runs_root}/', '')
        res[key] = r
    (base / 'L4-delong.json').write_text(json.dumps(res, indent=1))
    return res


if __name__ == '__main__':
    rdir: str | None = None
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == '--results-dir':
        rdir = args[1]
    print(json.dumps(main(rdir), indent=1))
