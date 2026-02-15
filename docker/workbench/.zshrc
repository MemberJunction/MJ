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
alias mjmig='cd /workspace/MJ && flyway migrate -url="jdbc:sqlserver://${DB_HOST:-sql-claude}:1433;databaseName=${DB_DATABASE:-MJ_Workbench};trustServerCertificate=true" -user="${CODEGEN_DB_USERNAME:-sa}" -password="${CODEGEN_DB_PASSWORD:-Claude2Sql99}" -schemas=__mj -createSchemas=true -baselineVersion=202602061600 -baselineOnMigrate=true -locations="filesystem:/workspace/MJ/migrations"'
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

# ─── Browser automation shortcuts ────────────────────────────────────────────
alias pwc='playwright-cli'                                         # short alias
alias pwopen='playwright-cli open --browser chromium http://localhost:4200'  # open Explorer headless
alias pwsnap='playwright-cli snapshot'                             # take accessibility snapshot
alias pwclose='playwright-cli close'                               # close browser session
alias pwlist='playwright-cli list'                                 # list active sessions
alias pwscreen='playwright-cli screenshot'                         # take screenshot
alias pwconsole='playwright-cli console'                           # check console output

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
echo "  auth-setup  → configure Auth0 credentials"
echo "  mjapi       → start MJAPI (default host :4000)"
echo "  mjui        → start Explorer (default host :4200)"
echo "  mjcd        → cd to /workspace/MJ"
echo "  tb / tbf    → turbo build / turbo build --filter"
echo "  ─────────── Browser Automation ─────────"
echo "  pwopen      → open headless browser → Explorer"
echo "  pwsnap      → accessibility snapshot"
echo "  pwclose     → close browser session"
echo "  pwscreen    → take screenshot"
echo "  pwconsole   → check JS console output"
echo "  pwlist      → list active browser sessions"
echo "  ─────────────────────────────────────────"
echo ""
