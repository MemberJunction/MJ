# Security Policy

MemberJunction is a platform that organizations use to hold and reason over their own
data. We take reports about its security seriously and we would rather hear about a
problem from you than from an incident.

This document is the published channel for reporting a suspected vulnerability, and it
describes what we do with a report once we have it.

## Reporting a vulnerability

**Please do not open a public issue, discussion, or pull request for a suspected
vulnerability.** A public report tells everyone about the problem before a fix exists,
including the people you would least like to tell.

Use one of these instead:

1. **GitHub private vulnerability reporting** — preferred. Go to the
   [Security tab](https://github.com/MemberJunction/MJ/security) of this repository and
   choose **Report a vulnerability**. The report is visible only to you and to the
   MemberJunction maintainers, and the discussion, the fix and the advisory all stay in
   one place.
2. **Email** — MJ Security, <mj.security@bluecypress.io>, if you cannot use GitHub or
   prefer not to.

If you have a PGP key preference or need another channel, say so in your first message
and we will arrange one.

### What to include

You do not need all of this, and a partial report is much better than no report. The
more of it you have, the faster we can confirm the finding:

- What the problem is, and what an attacker gets out of it.
- The affected version or branch, and the package if you know it.
- Steps to reproduce — a proof of concept, a request, a snippet, or a short script.
- Anything about your environment that matters: database platform, authentication
  provider, deployment shape.
- Whether you have disclosed this anywhere else, and whether you intend to.

### What we ask of you

- Give us a reasonable opportunity to fix the problem before you disclose it publicly.
- Do not access, modify, or exfiltrate data belonging to anyone else, and stop as soon
  as you have established that a vulnerability exists.
- Do not run denial-of-service tests, spam, or social engineering against MemberJunction
  users, customers, or staff.

If you report in good faith and follow the above, we will not pursue or support legal
action against you for your research, and we will work with you on disclosure timing.

## What happens after you report

1. **Acknowledgment.** Every report is acknowledged. We do not publish a target for how
   quickly, for the same reason we publish no remediation timeframes — see below. If
   you have not heard back and are
   wondering whether to chase us: please do, and use the other channel above when you
   do. A report filed through GitHub shows you its own status; email can go astray
   silently, and we would rather answer you twice than have you conclude you were
   ignored.
2. **Triage.** We reproduce the issue, establish whether it is a vulnerability in
   MemberJunction, and assess its severity and its exposure — in particular whether the
   affected code reaches a running environment or exists only in the build toolchain.
   We will tell you what we concluded and why, including when we conclude that something
   is not a vulnerability.
3. **Disposition.** Every report is dispositioned: fixed, fixed with a documented
   limitation, accepted as a known issue with the reasoning recorded, or declined as not
   a vulnerability. Confirmed defects are tracked to closure in our issue tracker with
   an auditable history.
4. **Release and credit.** Security fixes are released out of band rather than held for
   the next scheduled release. We publish a GitHub Security Advisory for issues that
   affect a published package. We will credit you by the name or handle you choose, or
   keep you anonymous — your call, and we will ask before publishing.

**We do not publish remediation target timeframes by severity, and we do not claim a
service level for them.** We prioritize by severity and by exposure. We would rather
state that plainly than publish a target we might miss — and customers who need defined
remediation timeframes contractually agree them in their Order Form rather than relying
on this file.

We do not operate a paid bug bounty program.

## Supported versions

Security fixes are issued for release lines that are **certified** and within their
published support window, and for the line currently in development.

[`release-lines.json`](release-lines.json) at the root of this repository is the source
of truth for line status and support dates; the table below is a summary and the file
wins if the two ever disagree.

| Line | Status | Supported |
|---|---|---|
| 6.1 | Candidate — undergoing certification, not recommended for production | Yes |
| 5.51 | Certified — support ends 2027-02-14 | Yes |
| Earlier 5.x lines | Superseded | No — upgrade to 5.51 |
| 4.x and earlier | End of life | No |

MemberJunction is delivered to hosted customers as a managed service, so those
environments are updated by Blue Cypress and do not run an unpatched version. If you run
MemberJunction yourself, you are responsible for taking the fix.

## Scope

**In scope** — anything in this repository that is built, imported, or shipped:

- The `@memberjunction/*` packages published to npm.
- Server, authentication, AI, Actions, and runtime code under `packages/`.
- Database migrations under `migrations/` and the metadata under `metadata/`.
- The CI and release workflows under `.github/`, where a weakness there would let
  unreviewed code reach a published package.

**Out of scope** — these are not part of the shipped product, and findings against them
are welcome but will usually be dispositioned as non-issues:

- Design documents and HTML mockups under `plans/`, which are never built, imported, or
  shipped.
- Demos, samples, and developer-only harnesses that run against a local database.
- Test fixtures and generated test data.
- Vulnerabilities in third-party dependencies where the advisory is already public —
  those reach us through dependency scanning; report one only if you have found an
  exploitation path specific to MemberJunction that the advisory does not describe.
- Findings that require an attacker to already hold administrative access to the
  environment, or that depend on a configuration the documentation advises against.
- Reports consisting solely of automated scanner output with no demonstrated impact.

If you are not sure which side of that line your finding falls on, report it. We would
rather triage something out of scope than miss something in it.

## Our own security practices

Blue Cypress maintains a Secure Software Development Lifecycle Policy governing how
MemberJunction is designed, reviewed, tested, and released. Enterprise customers and
prospects can request it, along with our current security questionnaire responses,
through their commercial contact. We state our actual position in those responses,
including where a control is not in place.
