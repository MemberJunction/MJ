---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

Add diagnostic report generation to `mj doctor` command. `--report` generates a basic diagnostic report (`mj-diagnostic-report.md`) with environment info, install state, and check results. `--report_extended` adds sanitized configuration file snapshots and service startup log capture (`mj-diagnostic-report-extended.md`). Passwords and secrets are automatically redacted. Also fixes process cleanup after service log capture and corrects key file detection for distribution installs.
