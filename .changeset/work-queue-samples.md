---
"@memberjunction/work-queue-samples": patch
"@memberjunction/cli": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add `@memberjunction/work-queue-samples` (`HelloWorldHandler`, HandlerKey `samples.hello`, registered in both bootstrap manifests) with an opt-in sample topology under `metadata-optional/work-queue-samples` (topic `samples.hello` and one subscription per partition mode), and `mj queue publish` for publishing test messages to a topic from the CLI. Together they walk a new installation through publish, retry, dead-letter, replay, cancel and the three partition modes without writing code.
