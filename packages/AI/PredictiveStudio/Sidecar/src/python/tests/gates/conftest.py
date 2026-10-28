"""Planted-truth gate tests of the trainer. A test that is a gate's measurement carries
`@pytest.mark.gate("<dataset> -> <criterion>")` (the gate's `MJ: Tests` row Name; the gate's check in
integration-test-suite/src/checks/ runs its node id through PsGatePytest.Run); a test that only adds coverage to a gate
measured elsewhere carries `@pytest.mark.covers("<row Name>")`. 400-seed gates also carry `seeds400`; they belong to
the statistical suite."""

from __future__ import annotations

import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "gate(name): planted-truth gate, named as its MJ: Tests row Name")
    config.addinivalue_line("markers", "seeds400: 400-seed statistical gate (suite Training (statistical))")
    config.addinivalue_line("markers", "covers(name): additional coverage for a gate registered with another test")
