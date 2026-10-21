from __future__ import annotations

import uuid

from truthsuite.judges.delong import delong_paired_z
from truthsuite.judges.holdout_rebuild import sqlserver_guid_key, trailing_holdout


def test_sqlserver_guid_order_sorts_by_the_last_six_bytes_first() -> None:
    a = uuid.UUID("00000000-0000-0000-0000-000000000001")
    b = uuid.UUID("01000000-0000-0000-0000-000000000000")
    # SQL Server compares bytes 10-15 first, so a (…0001 in the node) sorts after b.
    assert sorted([str(a), str(b)], key=sqlserver_guid_key) == [str(b), str(a)]


def test_trailing_holdout_takes_the_last_n_rows_in_sql_server_order() -> None:
    ids = [str(uuid.UUID(int=i << 0)) for i in range(1, 11)]
    labels = {i: (1 if k % 2 else 0) for k, i in enumerate(ids)}
    held = trailing_holdout(ids, labels, n_hold=3)
    assert len(held) == 3 and set(held) <= set(ids)
    assert held == sorted(ids, key=sqlserver_guid_key)[-3:]


def test_delong_detects_a_strictly_better_scorer() -> None:
    y = [0, 0, 0, 0, 1, 1, 1, 1] * 50
    perfect = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9] * 50
    noisy = [0.5, 0.2, 0.6, 0.4, 0.4, 0.7, 0.3, 0.9] * 50
    z = delong_paired_z(y, perfect, noisy)
    assert z > 3.09   # one-sided p < 0.001, the leak rule's threshold (18-rec:1808)
