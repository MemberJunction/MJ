#!/usr/bin/env bash
# PreToolUse (Bash) hook: before `git push` or `gh pr create`, run the repo-wide gates that CI runs
# but that no required check enforces — check:guards (UUID / multi-provider / primary-key scanners)
# and the MJ standards check. Several PRs merged with these red and left `next` failing for every
# later PR; running them here catches the violation in the PR that introduces it.
#
# Exit 2 blocks the tool call and feeds stderr back to Claude. Any other outcome lets it run.
# Skip once with MJ_SKIP_PUSH_GUARDS=1 in the command (e.g. `MJ_SKIP_PUSH_GUARDS=1 git push`).
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

# Only pushes and PR creation. Anything else returns immediately.
printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|[[:space:]])(git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)' || exit 0
printf '%s' "$cmd" | grep -q 'MJ_SKIP_PUSH_GUARDS=1' && exit 0

# The tree being pushed: `git -C <dir>`, else the first `cd <dir>`, else the session cwd.
dir=$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+"?([^"[:space:];&]+)"?.*/\1/p' | head -1)
[ -z "$dir" ] && dir=$(printf '%s' "$cmd" | sed -nE 's/^(.*[;&|][[:space:]]*)?cd[[:space:]]+"?([^"[:space:];&]+)"?.*/\2/p' | head -1)
dir="${dir:-$cwd}"
dir="${dir/#\~/$HOME}"
case "$dir" in /*) ;; *) dir="${cwd:-.}/$dir" ;; esac

root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
# A branch cut before check:guards existed, or another repo: nothing to run.
[ -x "$root/.github/scripts/check-guards.sh" ] || exit 0

if [ ! -d "$root/node_modules" ]; then
  jq -n --arg r "$root" '{systemMessage: ("Push guards skipped: no node_modules in " + $r + ". Run pnpm install there, then npm run check:guards.")}'
  exit 0
fi

failed=0
report=""

if ! out=$(NO_COLOR=1 FORCE_COLOR=0 "$root/.github/scripts/check-guards.sh" 2>&1); then
  failed=1
  report+=$'check:guards FAILED:\n'"$(printf '%s\n' "$out" | grep -Ev '^[[:space:]]*$' | tail -60)"$'\n\n'
fi

if [ -d "$root/packages/Standards/dist" ]; then
  if ! out=$(cd "$root" && NO_COLOR=1 FORCE_COLOR=0 node packages/Standards/bin/run.js check 2>&1); then
    failed=1
    report+=$'MJ standards check FAILED (node packages/Standards/bin/run.js check):\n'"$(printf '%s\n' "$out" | tail -40)"$'\n\n'
  fi
else
  standards_note="MJ standards check skipped: packages/Standards is not built (npx turbo run build --filter=@memberjunction/standards)."
fi

if [ "$failed" -ne 0 ]; then
  {
    printf 'Blocked: repo-wide gates fail in %s. CI runs these on the PR, and merging with them red breaks next for everyone.\n\n' "$root"
    printf '%s' "$report"
    printf 'Fix the violations (the rule for each scanner is named above), or, if they come from next and not from this branch, fix them in a separate small PR to next.\n'
    printf 'To push anyway once, prefix the command with MJ_SKIP_PUSH_GUARDS=1.\n'
  } >&2
  exit 2
fi

if [ -n "${standards_note:-}" ]; then
  jq -n --arg m "check:guards passed. $standards_note" '{systemMessage: $m}'
fi
exit 0
