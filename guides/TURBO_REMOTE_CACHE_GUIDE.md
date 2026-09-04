# Turbo Remote Cache

> **Purpose** — How MJ's CI build cache is wired, how to work with it locally, and how to operate
> it (rotate the key, revoke access, turn it off). Read before changing anything under
> `.github/workflows/` that runs `turbo`, before adding a workflow that builds packages, or when
> CI has become mysteriously slower.

MJ builds ~300 packages. Turborepo caches each package's build/test output keyed by a hash of its
inputs, so unchanged packages replay instead of recompiling. The **remote** cache (hosted by
Vercel) shares those artifacts **across runs, branches, and machines** — which is the one thing
the GitHub Actions cache cannot do, since its entries are scoped per-ref and can only be read
downward from the default branch.

Concretely: a package built on `next` this morning replays in your PR this afternoon without
recompiling.

---

## The one thing to know

**Every way of breaking this is silent.** Nothing here fails a build:

| Broken how | What turbo does | What you see |
|---|---|---|
| No `TURBO_TOKEN` | Falls back to local cache | `Remote caching disabled` in the log |
| No `TURBO_TEAM` | Cannot resolve a scope | Requests fail; job rebuilds |
| No signature key (signing on) | Reads cache, **uploads nothing** | `signing artifact failed` once per run |
| Reusable workflow without `secrets: inherit` | Empty token | Looks configured — `vars` propagate, secrets don't |
| Everything working | Signs and uploads | **Nothing. No success message at all.** |

Every row is a green build. The only symptom is CI gradually getting slower for reasons nobody
can attribute to a change.

Two mechanisms exist because of this, and both must stay green:

- **[`check-turbo-cache-env.mjs`](../.github/scripts/check-turbo-cache-env.mjs)** — a preflight
  step in `test.yml`'s `build` job and `release-test.yml`'s `unit-tests` job. Fails the run on an
  incoherent env, and writes the state to the step summary so a healthy cache is *visible* rather
  than merely un-complained-about.
- **[`turbo-remote-cache-coverage.test.mjs`](../.github/scripts/__tests__/turbo-remote-cache-coverage.test.mjs)**
  — asserts every job that invokes turbo carries all four vars, that the token and signature key
  travel together, that reusable-workflow callers pass secrets, and that `test.yml`'s trigger
  paths cover every workflow it checks.

---

## CI configuration

Four environment variables, declared at **job level** on every job that runs `turbo`:

```yaml
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ vars.TURBO_TEAM }}
      TURBO_API: ${{ vars.TURBO_API }}
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: ${{ secrets.TURBO_REMOTE_CACHE_SIGNATURE_KEY }}
```

| Name | Kind | Value |
|---|---|---|
| `TURBO_TOKEN` | Organization **secret** | A Vercel access token scoped to the team |
| `TURBO_TEAM` | Organization **variable** | The Vercel team slug (not a secret — it appears in dashboard URLs) |
| `TURBO_API` | Organization **variable** | Deliberately **unset**. Only for a self-hosted cache server |
| `TURBO_REMOTE_CACHE_SIGNATURE_KEY` | Organization **secret** | HMAC key for artifact signing |

Scope the secrets to **selected repositories**, not "all repositories" — `TURBO_TOKEN` is a
cache-*write* credential, and any repo that can read it can push artifacts other repos restore
into builds.

### Adding a workflow that runs turbo

1. Add all four vars to the job's `env:`.
2. Add the workflow to `test.yml`'s `pull_request` `paths:` list.

The coverage test fails if you skip either. Step 2 is not optional bookkeeping — `test.yml` is
path-filtered, so a workflow missing from that list is one whose cache wiring can be broken by a
PR that never runs the guard.

### Reusable workflows

**Secrets are not inherited across `uses:`.** A called workflow receives none unless the caller
passes them:

```yaml
  release-validation:
    uses: ./.github/workflows/release-test.yml
    secrets: inherit          # ← without this, TURBO_TOKEN is empty in the called workflow
```

This is genuinely treacherous because **`vars` *do* propagate**. Omit `secrets: inherit` and the
job has `TURBO_TEAM` set and `TURBO_TOKEN` empty — it reads as configured while the cache is off.
This shipped: the publish path ran without a remote cache from the day the cache was added until
it was found in review.

### Fork PRs

GitHub withholds secrets from `pull_request` runs originating in forks, so external contributions
get a local cache only. This is correct and expected — the preflight passes with no token
precisely so it never reds an external contribution.

No MJ workflow uses `pull_request_target` or `issue_comment`, so fork-authored code never executes
with these credentials in scope. **Keep it that way.** Adding either trigger to a workflow holding
`TURBO_TOKEN` would hand a cache-write credential to unreviewed code.

---

## Artifact signing

`turbo.json` sets:

```json
"remoteCache": { "signature": true }
```

Turbo then HMAC-SHA256-signs every artifact it uploads and verifies every artifact it downloads.
Anything failing verification is treated as a **cache miss** — it is discarded, not replayed.

**What this protects against:** tampering or corruption of artifacts at rest in Vercel's storage
or in transit.

**What it does not protect against:** every job shares one key, so a signature proves an artifact
came from *a* key-holder, not *which* one. Any job that can write can produce a validly signed
artifact. This is tamper-evidence for the storage layer, not a defense against a compromised job
inside the trust boundary. Narrow the blast radius with secret scoping (above), not with signing.

---

## Local development

**You do not need any of this.** With no credentials, turbo uses the local `.turbo/cache` and
everything works — `signature: true` never engages. This is the default and it is fine.

If you *want* to share the CI cache:

```bash
npx vercel login
npx turbo login
npx turbo link
```

Then **also export the signature key**, or your uploads silently fail:

```bash
export TURBO_REMOTE_CACHE_SIGNATURE_KEY='<same value as the org secret>'
```

Without it every local build logs `signing artifact failed: signature secret key not found` and
uploads nothing. Your builds still work and still read from the cache — you just stop
contributing, and nothing tells you beyond one warning line. Get the value from whoever
administers the Vercel team; it is the same string CI uses.

---

## Operations

### Rotating the signature key

Rotation invalidates **every previously signed artifact** — they become unverifiable and are
treated as misses. Expect one full cold rebuild across all jobs. Sequence:

1. Generate: `openssl rand -base64 32`
2. Update the `TURBO_REMOTE_CACHE_SIGNATURE_KEY` organization secret.
3. Tell anyone using the cache locally to update their exported value.
4. Expect the next run of each workflow to be cold. Hit rates recover on the run after.

There is no dual-key or overlap window — turbo verifies against one key. Rotate at a quiet time,
not before a release.

### Rotating the access token

Cheaper: `TURBO_TOKEN` does not participate in artifact hashing, so a new token reads the existing
cache normally.

1. Mint a replacement (Vercel → Account Settings → Tokens, scoped to the **team**).
2. Update the organization secret.
3. Revoke the old token.

Tokens carry the *creating user's* access. Mint it under a service/bot account, not a personal
one, or the cache dies when that person's access changes.

### Turning the cache off

Unset the `TURBO_TOKEN` secret. Everything degrades to local caching, the preflight reports
`INACTIVE` and stays green, and no workflow edits are required. Do **not** half-disable it by
removing the signature key — that leaves jobs reading the cache and never writing to it.

### Expiry

If the access token was created with an expiration, put the renewal date somewhere visible. On
expiry turbo reports `Remote caching disabled` and CI silently gets slower — the preflight cannot
catch this, because the variable is still *set*; only a live round-trip would reveal it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Remote caching disabled` on a same-repo branch | Token unset, revoked, or expired; or a reusable workflow missing `secrets: inherit` |
| `signing artifact failed: signature secret key not found` | The signature key is missing in that job — it is reading the cache and uploading nothing |
| Everything rebuilds after a config change | Editing `turbo.json` changes the global hash. Expected once |
| Everything rebuilds and nobody changed anything | The signature key was rotated, or artifacts were signed with a different key |
| A new workflow gets no cache hits | Missing the four vars, or missing from `test.yml`'s `paths:`. The coverage test catches both |
| Preflight fails with `TURBO_TEAM is empty` | The variable is not set, or is scoped to repositories that exclude this one |

---

## Related

- **[Release Engineering Runbook](RELEASE_ENGINEERING_RUNBOOK.md)** — the publish path this cache accelerates.
- **[Caching & Pub/Sub](CACHING_AND_PUBSUB_GUIDE.md)** — MJ's *runtime data* caching. Unrelated to the build cache; named similarly enough to be worth disambiguating.
