"""The numeric array aliases the trainer's scoring, interval and calibration modules share (one owner each)."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

FArr = npt.NDArray[np.float64]
IntArr = npt.NDArray[np.int64]
