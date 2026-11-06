#!/usr/bin/env bash
# Q3. Starts the sandbox the way the tool will, then attacks it from inside.
# Every probe must FAIL for the sandbox to hold. Exit 0 = held, 1 = leaked.
set -uo pipefail
export ANTHROPIC_API_KEY="sk-ant-SPIKE-$(date +%s)"       # fake; the value we must not see inside
export ACTIONS_RUNTIME_TOKEN="${ACTIONS_RUNTIME_TOKEN:-fake-runtime-token}"
IMG=jit-sandbox:spike
WORK=$(mktemp -d); echo 'console.log("hi")' > "$WORK/a.js"
LEAK=0
run() { docker run --rm --network none --pids-limit 256 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
          -e HOME=/tmp -v "$WORK:/work:ro" $IMG sh -c "$1" 2>&1; }

echo "== 1 environment"; out=$(run 'env'); echo "$out" | grep -q "$ANTHROPIC_API_KEY" && { echo LEAK env; LEAK=1; }
echo "== 2 /proc of every visible pid"; out=$(run 'for p in /proc/[0-9]*; do tr "\0" "\n" < $p/environ 2>/dev/null; done; ls /proc | grep -c "^[0-9]"'); echo "$out" | grep -q "$ANTHROPIC_API_KEY" && { echo LEAK proc; LEAK=1; }; echo "visible pids: $(echo "$out" | tail -1)"
echo "== 3 network"; out=$(run 'node -e "fetch(\"https://api.anthropic.com\").then(()=>console.log(\"REACHED\")).catch(e=>console.log(\"blocked:\",e.cause?.code||e.message))"'); echo "$out"; echo "$out" | grep -q REACHED && { echo LEAK net; LEAK=1; }
echo "== 4 DNS"; out=$(run 'getent hosts api.anthropic.com || echo "no dns"'); echo "$out"; echo "$out" | grep -qv "no dns" && { echo LEAK dns; LEAK=1; }
echo "== 5 docker socket"; out=$(run 'ls -la /var/run/docker.sock 2>&1; [ -S /var/run/docker.sock ] && echo SOCKET_PRESENT || echo "no socket"'); echo "$out"; echo "$out" | grep -q SOCKET_PRESENT && { echo LEAK docker-socket; LEAK=1; }
echo "== 6 cache token"; out=$(run 'env | grep -i "ACTIONS_\|TURBO_\|GITHUB_" || echo "no runner vars"'); echo "$out"; echo "$out" | grep -q "ACTIONS_RUNTIME_TOKEN=" && { echo LEAK cache-token; LEAK=1; }
echo "== 7 host filesystem"; out=$(run 'ls / ; ls /home 2>&1; cat /etc/hostname'); echo "$out"
echo "== 8 write to ro mount"; out=$(run 'touch /work/x 2>&1 && echo WROTE || echo "ro holds"'); echo "$out"; echo "$out" | grep -q WROTE && { echo LEAK ro-mount; LEAK=1; }
echo "== 9 sudo / root"; out=$(run 'id; echo "uid=$(id -u)"; sudo -n true 2>&1 && echo SUDO_OK || echo "no sudo"'); echo "$out"
echo "$out" | grep -qx 'uid=0' && { echo LEAK root; LEAK=1; }; echo "$out" | grep -q SUDO_OK && { echo LEAK sudo; LEAK=1; }
echo "== 10 host side: pnpmfile + packageManager in head"
HEADSIM=$(mktemp -d); MARK=$HEADSIM/PNPMFILE_RAN
cat > "$HEADSIM/package.json" <<'EOF'
{ "name": "evil-head", "private": true, "packageManager": "pnpm@10.30.0", "dependencies": { "is-odd": "3.0.1" } }
EOF
cat > "$HEADSIM/.pnpmfile.cjs" <<EOF
require('fs').writeFileSync(require('path').join(__dirname, 'PNPMFILE_RAN'), process.env.ANTHROPIC_API_KEY || 'ran');   // \$MARK on the host, /work/PNPMFILE_RAN in the sandbox
module.exports = { hooks: { readPackage: (p) => p } };
EOF
( cd "$HEADSIM" && pnpm install --lockfile-only --ignore-pnpmfile >/dev/null 2>&1 )   # a lockfile for the fetch; made here only to set the test up
rm -f "$MARK"
HOSTPNPM=$(pnpm --version)
# The designed host step: lockfile alone, in its own folder.
FETCH=$(mktemp -d); STORE=$(mktemp -d); cp "$HEADSIM/pnpm-lock.yaml" "$FETCH/"
( cd "$FETCH" && pnpm fetch --store-dir "$STORE" >/dev/null 2>&1 ) || echo "fetch failed (record; see Q8)"
[ -e "$MARK" ] && { echo "LEAK host: .pnpmfile.cjs ran during fetch"; LEAK=1; } || echo "pnpmfile did not run on host"
[ "$(pnpm --version)" = "$HOSTPNPM" ] && echo "host pnpm still $HOSTPNPM" || { echo "LEAK host: pnpm version changed"; LEAK=1; }
# Control: the rejected design. Expected to run the pnpmfile — proves the test can tell the cases apart.
( cd "$HEADSIM" && pnpm install --frozen-lockfile --ignore-scripts --store-dir "$STORE" >/dev/null 2>&1 ) || true
[ -e "$MARK" ] && echo "control: host install ran .pnpmfile.cjs (expected, this is why the host never installs head)" || echo "control: pnpmfile did not run under host install (unexpected on pnpm 10.33 — record)"
# Then the sandbox half: offline install from the store, pnpmfile allowed to run there, no network, no key.
out=$(docker run --rm --network none --pids-limit 256 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
      -e HOME=/tmp -v "$HEADSIM:/work" -v "$STORE:/pnpm-store" $IMG sh -c 'cd /work && rm -f PNPMFILE_RAN && pnpm install --offline --frozen-lockfile --ignore-scripts >/dev/null 2>&1; cat PNPMFILE_RAN 2>/dev/null || printf none; echo; pnpm --version')
echo "sandbox pnpmfile marker: $(echo "$out" | head -1)"
echo "$out" | grep -q "$ANTHROPIC_API_KEY" && { echo "LEAK sandbox: pnpmfile saw the key"; LEAK=1; }
echo "sandbox pnpm: $(echo "$out" | tail -1) (must be 10.33.0, not 10.30.0)"; echo "$out" | tail -1 | grep -q '^10.30' && { echo "LEAK sandbox: packageManager switch worked offline"; LEAK=1; }
rm -rf "$HEADSIM" "$FETCH" "$STORE"
echo "== 10b host side: lockfile content + patches/ (git dependency with prepare, symlinked patch, pnpmfileChecksum)"
P=$(mktemp -d); TS=$(date +%s); MK=$P/markers; mkdir -p "$MK" "$P/outside" "$P/head/patches"
# A git-hosted dependency whose lifecycle scripts write markers if anything runs them.
mkdir -p "$P/gitdep"; cat > "$P/gitdep/package.json" <<EOF
{ "name": "evil-git-dep", "version": "1.0.0", "main": "index.js",
  "scripts": { "prepare": "node -e \"require('fs').writeFileSync('$MK/PREPARE_RAN','x')\"",
               "preinstall": "node -e \"require('fs').writeFileSync('$MK/PREINSTALL_RAN','x')\"",
               "install": "node -e \"require('fs').writeFileSync('$MK/INSTALL_RAN','x')\"",
               "postinstall": "node -e \"require('fs').writeFileSync('$MK/POSTINSTALL_RAN','x')\"" } }
EOF
echo 'module.exports = 1;' > "$P/gitdep/index.js"
( cd "$P/gitdep" && git init -q && git add -A && git -c user.name=spike -c user.email=spike@example.invalid commit -qm dep && git clone -q --bare . "$P/gitdep.git" )
# The patch target lives outside patches/; patches/ holds only a symlink to it. It adds a file with a unique string.
cat > "$P/outside/target.patch" <<EOF
diff --git a/spike-marker.js b/spike-marker.js
new file mode 100644
--- /dev/null
+++ b/spike-marker.js
@@ -0,0 +1 @@
+module.exports = "PATCH_TARGET_SPIKE_$TS";
EOF
ln -s "$P/outside/target.patch" "$P/head/patches/is-odd@3.0.1.patch"
cat > "$P/head/package.json" <<EOF
{ "name": "evil-head-2", "private": true, "dependencies": { "is-odd": "3.0.1", "evil-git-dep": "git+file://$P/gitdep.git" } }
EOF
# The head allowlists its own git dependency; the fetch folder has no workspace file, so no allowlist there.
printf 'packages: []\npatchedDependencies:\n  is-odd@3.0.1: patches/is-odd@3.0.1.patch\nonlyBuiltDependencies:\n  - evil-git-dep\n' > "$P/head/pnpm-workspace.yaml"
cat > "$P/head/.pnpmfile.cjs" <<EOF
require('fs').writeFileSync('$MK/PNPMFILE_RAN', 'ran');
module.exports = { hooks: { readPackage: (p) => p } };
EOF
# Set-up only (not the designed path): make the head's lockfile, with the pnpmfile on so pnpm can write pnpmfileChecksum.
( cd "$P/head" && pnpm install --lockfile-only >/dev/null 2>&1 ) || echo "set-up: lockfile-only install failed"
if [ -f "$P/head/pnpm-lock.yaml" ]; then
  echo "lockfile has: $(grep -c 'evil-git-dep@git+file' "$P/head/pnpm-lock.yaml") git-dep lines, $(grep -c '^patchedDependencies' "$P/head/pnpm-lock.yaml") patchedDependencies, $(grep -c '^pnpmfileChecksum' "$P/head/pnpm-lock.yaml") pnpmfileChecksum (host pnpm $(cd "$P" && pnpm --version))"
else
  echo "PROBE 10b INVALID: no lockfile, nothing was tested"; LEAK=1
fi
rm -f "${MK:?}"/*
# The designed host step: lockfile + patches/ copied into an empty folder, then fetch.
probe_fetch() {   # $1 = label
  local F S; F=$(mktemp -d); S=$(mktemp -d); cp "$P/head/pnpm-lock.yaml" "$F/"; cp -R "$P/head/patches" "$F/"
  echo "-- $1: fetch folder patches/: $(ls -l "$F/patches" | tail -1 | awk '{print $1, $(NF-2), $(NF-1), $NF}')"
  local o; o=$( cd "$F" && pnpm fetch --store-dir "$S" 2>&1 ); echo "   fetch exit: $?"
  echo "$o" | grep -v '^Progress' | tail -8 | sed 's/^/   fetch: /'
  echo "$o" | grep -q "outside/target.patch" && { echo "LEAK host: fetch read the symlinked patch target outside patches/"; LEAK=1; }
  local m; m=$(ls "$MK" 2>/dev/null | tr '\n' ' '); [ -n "$m" ] && { echo "LEAK host: head code ran during fetch: $m"; LEAK=1; } || echo "no head code ran (no markers)"
  local hit; hit=$(grep -rl "PATCH_TARGET_SPIKE_$TS" "$F" "$S" 2>/dev/null | head -3)
  [ -n "$hit" ] && { echo "LEAK host: symlinked patch target applied on the host: $hit"; LEAK=1; } || echo "symlinked patch content not found in fetch folder or store"
  rm -rf "${F:?}" "${S:?}"; rm -f "${MK:?}"/*
}
probe_fetch "A: git dependency + symlinked patch"
# B: the same head without the git dependency, so the fetch cannot stop on it before it reaches the patch.
cat > "$P/head/package.json" <<EOF
{ "name": "evil-head-2", "private": true, "dependencies": { "is-odd": "3.0.1" } }
EOF
rm -f "$P/head/pnpm-lock.yaml"; ( cd "$P/head" && pnpm install --lockfile-only >/dev/null 2>&1 ) || echo "set-up B: lockfile-only install failed"
if [ -f "$P/head/pnpm-lock.yaml" ] && grep -q '^patchedDependencies' "$P/head/pnpm-lock.yaml"; then
  echo "lockfile B has: $(grep -c 'evil-git-dep' "$P/head/pnpm-lock.yaml") git-dep lines, $(grep -c '^patchedDependencies' "$P/head/pnpm-lock.yaml") patchedDependencies, $(grep -c '^pnpmfileChecksum' "$P/head/pnpm-lock.yaml") pnpmfileChecksum"
  rm -f "${MK:?}"/*
  probe_fetch "B: symlinked patch only, readable target"
  chmod 000 "$P/outside/target.patch"
  probe_fetch "B: symlinked patch only, unreadable target (an error naming the target means fetch reads it)"
  chmod 600 "$P/outside/target.patch"
else
  echo "PROBE 10b-B INVALID: no lockfile with patchedDependencies, nothing was tested"; LEAK=1
fi
rm -rf "${P:?}"
rm -rf "$WORK"
[ $LEAK = 0 ] && echo "SANDBOX HELD" || echo "SANDBOX LEAKED"; exit $LEAK
