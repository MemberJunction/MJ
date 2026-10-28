"""The Training Snapshot format literals the trainer reads.

They mirror the TypeScript owners in Core: `SNAPSHOT_MATRIX_FORMAT`, `INCUMBENT_SCORE_COLUMN`,
`REFERENCE_SCORE_COLUMN` and `SLICE_COLUMN_PREFIX` in `snapshot-format.ts`, and `LABEL_COLUMN` in
`assembly-contract.ts`. Change them there first; this module is the sidecar's only copy.
"""

from __future__ import annotations

from typing import Final

# The matrix file's format tag, the header's first check.
MATRIX_FORMAT: Final = "ps-snapshot-matrix/v1"
# The label column of every matrix row.
LABEL_COLUMN: Final = "__ps_label"
# The unit's incumbent heuristic evaluated per row, read by the trainer's incumbent-heuristic baseline.
INCUMBENT_SCORE_COLUMN: Final = "__ps_incumbent_score"
# Reserved for test fixtures that plant a reference score; the product never writes it.
REFERENCE_SCORE_COLUMN: Final = "__ps_reference_score"
# `__ps_slice:<field>` holds the protocol's slice subgroup values as strings.
SLICE_COLUMN_PREFIX: Final = "__ps_slice:"
