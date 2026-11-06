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
echo "== 5 docker socket"; out=$(run 'ls -la /var/run/docker.sock 2>&1 || echo "no socket"'); echo "$out"
echo "== 6 cache token"; out=$(run 'env | grep -i "ACTIONS_\|TURBO_\|GITHUB_" || echo "no runner vars"'); echo "$out"; echo "$out" | grep -q "ACTIONS_RUNTIME_TOKEN=" && { echo LEAK cache-token; LEAK=1; }
echo "== 7 host filesystem"; out=$(run 'ls / ; ls /home 2>&1; cat /etc/hostname'); echo "$out" | head -5
echo "== 8 write to ro mount"; out=$(run 'touch /work/x 2>&1 || echo "ro holds"'); echo "$out"
echo "== 9 sudo / root"; out=$(run 'id; sudo -n true 2>&1 || echo "no sudo"'); echo "$out"
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
rm -rf "$WORK"
[ $LEAK = 0 ] && echo "SANDBOX HELD" || echo "SANDBOX LEAKED"; exit $LEAK
