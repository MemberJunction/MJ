from __future__ import annotations

import pytest

from truthsuite.stats.coverage import accepted_range, p_pass_new
from truthsuite.stats.monitor_m import Q3, Q12
from truthsuite.stats.noise_publish import max_accepted_publications, p_pass


def test_noise_publish_400_accepts_up_to_28_and_matches_pass_probabilities() -> None:
    assert max_accepted_publications(400) == 28
    assert p_pass(0.05, 400) == pytest.approx(0.969, abs=5e-4)
    assert p_pass(0.10, 400) == pytest.approx(0.023, abs=5e-4)


def test_coverage_400_accepts_372_to_388_and_matches_pass_probabilities() -> None:
    assert accepted_range(400) == (372, 388)
    assert p_pass_new(0.95, 400) == pytest.approx(0.950, abs=5e-4)
    assert p_pass_new(0.93, 400) == pytest.approx(0.550, abs=5e-4)
    assert p_pass_new(0.90, 400) == pytest.approx(0.023, abs=5e-4)


def test_monitor_m_current_calibrated_levels() -> None:
    assert Q12 == 0.0095
    assert Q3 == 0.0171
