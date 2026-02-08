# oh-my-zsh configuration
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"
plugins=(git fzf node npm)
source $ZSH/oh-my-zsh.sh

# ─── Claude Code shortcuts ───────────────────────────────────────────────────
alias cc='claude --dangerously-skip-permissions'
alias ccp='claude --dangerously-skip-permissions -p'    # cc with prompt arg
alias ccr='claude --dangerously-skip-permissions --resume' # resume last conversation
alias ccc='claude --continue'                           # continue last conversation (with permissions)

# ─── SQL Server shortcuts ────────────────────────────────────────────────────
alias sql='sqlcmd -S $DB_HOST -U $DB_USER -P $DB_PASSWORD -C'
alias sqld='sqlcmd -S $DB_HOST -U $DB_USER -P $DB_PASSWORD -C -d'  # sqld <dbname>
alias sqlq='sqlcmd -S $DB_HOST -U $DB_USER -P $DB_PASSWORD -C -Q'  # sqlq "SELECT 1"
alias sqldbs='sqlcmd -S $DB_HOST -U $DB_USER -P $DB_PASSWORD -C -Q "SELECT name FROM sys.databases ORDER BY name"'
alias sqlmj='sqlcmd -S $DB_HOST -U $DB_USER -P $DB_PASSWORD -C -d ${DB_DATABASE:-MJ_Workbench}'

# ─── MemberJunction shortcuts ────────────────────────────────────────────────
alias mjb='npm run build'
alias mjba='npm run build'                # build all from root
alias mjapi='cd /workspace/MJ && npm run start:api'
alias mjui='cd /workspace/MJ && npm run start:explorer'
alias mjcg='cd /workspace/MJ && mj codegen'
alias mjmig='cd /workspace/MJ && mj migrate'
alias mjcd='cd /workspace/MJ'

# ─── Build shortcuts ─────────────────────────────────────────────────────────
alias tb='turbo build'
alias tbf='turbo build --filter'          # tbf @memberjunction/core

# ─── Git shortcuts ───────────────────────────────────────────────────────────
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline -20'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gpl='git pull'
alias gps='git push'

# ─── General shortcuts ───────────────────────────────────────────────────────
alias ll='ls -alh'
alias ..='cd ..'
alias ...='cd ../..'

# ─── Environment info on shell start ─────────────────────────────────────────
echo ""
echo "  Claude Dev Workbench"
echo "  ─────────────────────────────────────────"
echo "  cc          → claude --dangerously-skip-permissions"
echo "  ccp         → cc -p <prompt>"
echo "  ccr         → cc --resume"
echo "  sql / sqlmj → sqlcmd connected to $DB_HOST"
echo "  sqldbs      → list all databases"
echo "  sqlq        → run inline query"
echo "  db-bootstrap→ create MJ database + run migrations"
echo "  mjapi       → start MJAPI (host :4100)"
echo "  mjui        → start Explorer (host :4300)"
echo "  mjcd        → cd to /workspace/MJ"
echo "  tb / tbf    → turbo build / turbo build --filter"
echo "  ─────────────────────────────────────────"
echo ""
