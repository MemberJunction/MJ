#!/bin/bash
set -e

MJ_REPO="https://github.com/MemberJunction/MJ.git"
MJ_DIR="/workspace/MJ"

# ─── Auto-update global packages on container start ─────────────────────────
echo "Checking for updates to Claude Code and MJ CLI..."
npm update -g @anthropic-ai/claude-code @memberjunction/cli 2>/dev/null || true

CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
MJ_VERSION=$(mj --version 2>/dev/null || echo "unknown")
echo "  Claude Code: ${CLAUDE_VERSION}"
echo "  MJ CLI:      ${MJ_VERSION}"
echo ""

# ─── Clone or update MJ repository ──────────────────────────────────────────
if [ ! -d "$MJ_DIR/.git" ]; then
    echo "Cloning MemberJunction repo (next branch)..."
    if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
        gh repo clone MemberJunction/MJ "$MJ_DIR" -- --branch next
    else
        git clone --branch next "$MJ_REPO" "$MJ_DIR"
    fi
    echo "  MJ repo cloned to $MJ_DIR"
else
    echo "MJ repo found at $MJ_DIR"
    cd "$MJ_DIR"
    # Fetch latest from origin without disrupting current work
    git fetch origin next 2>/dev/null || true
    CURRENT=$(git branch --show-current 2>/dev/null || echo "unknown")
    echo "  Current branch: $CURRENT"
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/next 2>/dev/null)
    if [ "$CURRENT" = "next" ] && [ "$LOCAL" != "$REMOTE" ]; then
        echo "  Pulling latest next..."
        git pull origin next 2>/dev/null || true
    elif [ "$LOCAL" != "$REMOTE" ]; then
        echo "  origin/next has new commits (use 'git pull origin next' to update)"
    fi
    cd /workspace
fi
echo ""

# ─── Drop into zsh ──────────────────────────────────────────────────────────
exec /bin/zsh "$@"
