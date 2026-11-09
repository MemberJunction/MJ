"""The one definition of a missing value, shared by the trainer's encoder (``encoding``) and the ``/predict`` path's
frozen preprocessing (``preprocessing``), so the two cannot disagree on what is missing."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd


def is_missing(value: object) -> bool:
    """True for null-equivalents: None, pandas NA, NaN floats (numpy ones too) and blank or whitespace text."""
    if value is None or value is pd.NA:
        return True
    if isinstance(value, (float, np.floating)) and math.isnan(float(value)):
        return True
    return isinstance(value, str) and value.strip() == ""
