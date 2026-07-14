/* ============================================================================
   Project Hub — Quiet Execution · Interactive Prototype (detail pass)
   The growth contract is LOGIC: the hub renders from what a project contains.
   Detail flows: plan mode (per-request), memory lifecycle (remembered →
   provisional → keep/forget), artifact versions/publish/remix, companion rail
   (one-rail mode-swap), temporary chat, project management, live growth.
   ============================================================================ */

/* ---------- Data (two seed profiles — switch via the state map) ---------- */
const ESTABLISHED = {
  projects: [
    {
      id: 'renewal', name: 'Membership Renewal', icon: 'fa-arrows-rotate', color: '#0076B6',
      desc: 'FY26 renewal push — targets, win-back messaging, and the renewal dashboard.',
      members: [
        { init: 'AM', color: '#0076B6', name: 'Alex Morgan', role: 'Owner' },
        { init: 'DK', color: '#7C3AED', name: 'Dana Kim', role: 'Editor' },
        { init: 'RB', color: '#16A34A', name: 'Ray Barnes', role: 'Viewer' },
      ],
      memory: [
        { id: 'm1', text: 'Target members lapsed under 90 days before longer-lapsed cohorts.', scope: 'All agents', status: 'active' },
        { id: 'm2', text: 'Renewal emails come from the chapter, not national.', scope: 'Sage', status: 'active' },
        { id: 'm3', text: 'Fiscal year runs July–June.', scope: 'All agents · global', status: 'active' },
        { id: 'm4', text: 'Exec summaries stay under 200 words.', scope: 'All agents · global', status: 'active' },
      ],
      conversations: [
        { id: 'c1', title: 'Q3 renewal targets', summary: 'Sage flagged 3 at-risk renewals, $890K exposure', when: '1d',
          messages: [
            { who: 'user', text: 'Which renewals are at risk this quarter?' },
            { who: 'Sage', text: 'Three accounts look at-risk: Meridian ($420K, sponsor left in May), Coastal ($310K, usage down 40%), and Brightline ($160K, invoice disputes). Combined exposure is $890K. Want a save plan for each?' },
            { who: 'user', text: 'Yes — start with Meridian.' },
            { who: 'Sage', text: 'Drafting the Meridian save plan now. First step is re-establishing an exec sponsor; I\'ve pulled the stakeholder map from this project\'s earlier conversation and flagged two candidates.' },
          ] },
        { id: 'c2', title: 'Lapsed member win-back copy', summary: 'Sage · draft 2 of the win-back sequence', when: '2d',
          messages: [
            { who: 'user', text: 'Draft a win-back email for members lapsed under 90 days.' },
            { who: 'Sage', text: 'Here\'s draft 2, from the chapter voice (per this project\'s memory). Subject: "We held your spot." Three-touch sequence, first email leads with the member-only renewal rate.' },
          ] },
        { id: 'c3', title: 'Renewal email sequence review', summary: 'Skip · "sequence timing looks right, CTA needs work"', when: '4d',
          messages: [
            { who: 'user', text: 'Review the renewal email sequence timing.' },
            { who: 'Skip', text: 'Sequence timing looks right — 30/14/3 days out matches renewal-curve best practice. The CTA needs work: "Renew today" underperforms "Keep my benefits" in association A/B data.' },
          ] },
        { id: 'c4', title: 'Renewal dashboard spec', summary: 'Skip · component spec for the lapse-risk dashboard', when: '5d',
          messages: [
            { who: 'user', text: 'Spec out the renewal dashboard.' },
            { who: 'Skip', text: 'Spec drafted: lapse-risk score by cohort, renewal-rate trend, and an at-risk accounts table. Saved to this project\'s artifacts as v1.' },
          ] },
      ],
      artifacts: [
        { id: 'a1', title: 'Renewal Email Sequence', icon: 'fa-regular fa-file-lines', kind: 'Document',
          versions: [
            { v: 1, when: '6d ago', by: 'Sage', note: 'First draft, national voice' },
            { v: 2, when: '4d ago', by: 'Sage', note: 'Rewritten in chapter voice per project memory' },
            { v: 3, when: '2d ago', by: 'You', note: 'Tightened subject lines, added PS line' },
          ] },
        { id: 'a2', title: 'Lapse Risk Dashboard', icon: 'fa-solid fa-chart-column', kind: 'Component',
          versions: [ { v: 1, when: '4d ago', by: 'Skip', note: 'Initial dashboard build' } ] },
        { id: 'a3', title: 'Q3 Target Segments', icon: 'fa-solid fa-table', kind: 'Query',
          versions: [
            { v: 1, when: '6d ago', by: 'Sage', note: 'All lapsed members' },
            { v: 2, when: '5d ago', by: 'Sage', note: 'Split by lapse cohort' },
          ] },
      ],
      workflows: [
        { id: 'wf1', title: 'Draft win-back emails', meta: 'Sage · step 2 of 4 · started 20m ago', pct: 60, running: true },
      ],
    },
    {
      id: 'website', name: 'Website Refresh', icon: 'fa-globe', color: '#F6AD55',
      desc: 'New public site — IA, copy, and the launch checklist.',
      members: [ { init: 'AM', color: '#0076B6', name: 'Alex Morgan', role: 'Owner' } ],
      memory: [
        { id: 'w1', text: 'Voice: plain language, no association jargon on public pages.', scope: 'All agents', status: 'active' },
        { id: 'w2', text: 'Launch target is the September board meeting.', scope: 'All agents', status: 'active' },
      ],
      conversations: [
        { id: 'wc1', title: 'Homepage IA options', summary: 'Sage · three IA structures, leaning audience-first', when: '3d',
          messages: [
            { who: 'user', text: 'Give me IA options for the homepage.' },
            { who: 'Sage', text: 'Three structures: audience-first (members / prospects / partners), task-first (join / renew / learn), and content-first. For your traffic mix I\'d lean audience-first.' },
          ] },
        { id: 'wc2', title: 'About page rewrite', summary: 'Sage · draft applying the plain-language voice', when: '1w',
          messages: [
            { who: 'user', text: 'Rewrite the About page in our new voice.' },
            { who: 'Sage', text: 'Rewritten — plain language per this project\'s memory, reading level grade 8, mission statement moved above the fold.' },
          ] },
      ],
      artifacts: [], workflows: [],
    },
  ],
  ungrouped: [
    { id: 'u1', title: 'Quick question re: dues', summary: '', when: '3d', messages: [
        { who: 'user', text: 'What are the 2026 dues tiers?' },
        { who: 'Sage', text: 'Individual $195, Small org $850, Enterprise $2,400. Note: no project context here — I\'m answering from org-wide data only.' },
      ] },
  ],
  temporary: { id: 'tmp', title: 'Temporary chat', messages: [] },
  pinned: [
    { id: 'pin1', title: 'Weekly KPI check-in', when: '2h', summary: '', messages: [
      { who: 'user', text: 'Run the weekly KPI check-in.' },
      { who: 'Sage', text: 'Membership up 1.2% WoW, renewals pacing at 94% of target, event registrations flat. Full digest attached. (Pinned conversations live outside projects — they keep no project memory.)' },
    ] },
  ],
};

const FIRSTRUN = {
  projects: [], ungrouped: [], pinned: [],
  temporary: { id: 'tmp', title: 'Temporary chat', messages: [] },
};

let persona = 'established';
let DATA = structuredClone(ESTABLISHED);

function setPersona(name) {
  persona = name;
  DATA = structuredClone(name === 'firstrun' ? FIRSTRUN : ESTABLISHED);
  Object.assign(state, {
    view: 'hub', projectId: DATA.projects[0] ? DATA.projects[0].id : null, tab: 'overview',
    convId: null, artifactId: null, companion: false, planArmed: false, moveConvPending: null, editingArtifact: false,
  });
  state.openProjects = new Set(DATA.projects[0] ? [DATA.projects[0].id] : []);
  closeModals();
  render();
  toast(name === 'firstrun' ? 'Brand-new user — nothing exists yet' : 'Established user — full seed data');
}

/* ---------- State ---------- */
const state = {
  view: 'hub',            // 'hub' | 'chat' | 'newchat' | 'artifact'
  projectId: 'renewal',
  tab: 'overview',
  convId: null,
  artifactId: null,       // artifact page
  artifactVersion: null,  // selected version on artifact page
  companion: false,       // companion rail open (project chats only)
  railMode: 'context',    // companion: 'context' | 'artifact'
  railArtifactId: null,
  planArmed: false,       // per-request plan chip (B5 semantics — disarms on approve)
  moveConvPending: null,  // conversation waiting for "Move → New project…"
  canPublish: true,       // demo: "Can Publish Artifacts Publicly" privilege (D11)
  editingArtifact: false,
  openProjects: new Set(['renewal']),
};

/* ---------- Composer data + state ---------- */
const AGENTS = [
  { name: 'Sage', icon: 'fa-robot', color: '#0076B6', desc: 'General copilot — plan mode + skills' },
  { name: 'Skip', icon: 'fa-satellite-dish', color: '#7C3AED', desc: 'Analytics (remote — plan/skills delegated)' },
];
const PEOPLE = [
  { label: 'Dana Kim', icon: 'fa-user', kind: 'person' },
  { label: 'Ray Barnes', icon: 'fa-user', kind: 'person' },
];
const RECORDS = [
  { label: 'Meridian Holdings', sub: 'Account', icon: 'fa-building', kind: 'record' },
  { label: 'Coastal Partners', sub: 'Account', icon: 'fa-building', kind: 'record' },
  { label: 'FY26 Dues Schedule', sub: 'Query', icon: 'fa-table', kind: 'record' },
];
const SKILLS = [
  { label: 'Deep Research', icon: 'fa-magnifying-glass-chart', color: '#7C3AED', kind: 'skill' },
  { label: 'Data Analysis', icon: 'fa-chart-simple', color: '#16A34A', kind: 'skill' },
  { label: 'Email Composer', icon: 'fa-envelope-open-text', color: '#D97706', kind: 'skill' },
];
const FAKE_FILES = ['board-deck.pdf', 'q3-pipeline.xlsx', 'renewal-notes.docx'];

const composer = { agent: AGENTS[0], mode: 'Standard', voice: false, drafts: {}, fileIdx: 0 };
let popCtx = null; // open mention popover: { items }

function draftKey() { return `${state.view}:${state.convId || state.projectId || 'fr'}`; }
function draft() { const k = draftKey(); return composer.drafts[k] || (composer.drafts[k] = { text: '', chips: [] }); }

/* ---------- Helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const project = (id) => DATA.projects.find((p) => p.id === id);
const artifact = (p, id) => p && p.artifacts.find((a) => a.id === id);
const isGrown = (p) => p.artifacts.length > 0 || p.workflows.length > 0 || p.members.length > 1;

function findConv(id) {
  if (id === 'tmp') return { conv: DATA.temporary, proj: null, temporary: true };
  for (const p of DATA.projects) { const c = p.conversations.find((c) => c.id === id); if (c) return { conv: c, proj: p }; }
  const u = DATA.ungrouped.find((c) => c.id === id); if (u) return { conv: u, proj: null };
  const pin = DATA.pinned.find((c) => c.id === id); return pin ? { conv: pin, proj: null } : null;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const t = [];
  if (DATA.pinned.length) {
    t.push(`<div class="s-sect"><i class="fa-solid fa-chevron-down chev"></i><i class="fa-solid fa-thumbtack pin"></i> Pinned <span class="grow"></span></div>`);
    for (const c of DATA.pinned) t.push(`<div class="s-conv top ${state.view === 'chat' && state.convId === c.id ? 'active' : ''}" data-act="open-conv" data-id="${c.id}"><span class="cname">${esc(c.title)}</span><span class="cwhen">${c.when}</span></div>`);
  }

  t.push(`<div class="s-sect"><i class="fa-solid fa-chevron-down chev"></i> Projects <span class="add" data-act="new-project" title="New project"><i class="fa-solid fa-plus"></i></span></div>`);
  if (!DATA.projects.length)
    t.push(`<div class="s-empty">Group related work when you're ready — shared memory, outputs, and people.</div>`);
  for (const p of DATA.projects) {
    const open = state.openProjects.has(p.id);
    const sel = (state.view === 'hub' || state.view === 'artifact') && state.projectId === p.id;
    t.push(`<div class="s-proj ${sel ? 'sel' : ''} ${open ? 'open' : ''}" data-act="open-hub" data-id="${p.id}">
      <i class="fa-solid fa-chevron-right chev"></i><i class="fa-solid ${p.icon} picon" style="color:${p.color}"></i>
      <span class="pname">${esc(p.name)}</span></div>`);
    if (open) for (const c of p.conversations.slice(0, 3))
      t.push(`<div class="s-conv ${state.view === 'chat' && state.convId === c.id ? 'active' : ''}" data-act="open-conv" data-id="${c.id}"><span class="cname">${esc(c.title)}</span><span class="cwhen">${c.when}</span></div>`);
  }

  if (DATA.ungrouped.length) {
    t.push(`<div class="s-sect"><i class="fa-solid fa-chevron-down chev"></i> Ungrouped <span class="grow"></span></div>`);
    for (const c of DATA.ungrouped)
      t.push(`<div class="s-conv top ${state.view === 'chat' && state.convId === c.id ? 'active' : ''}" data-act="open-conv" data-id="${c.id}"><span class="cname">${esc(c.title)}</span><span class="cwhen">${c.when}</span></div>`);
  }
  if (DATA.temporary.messages.length || (state.view === 'chat' && state.convId === 'tmp'))
    t.push(`<div class="s-conv top ${state.convId === 'tmp' ? 'active' : ''}" data-act="open-conv" data-id="tmp"><i class="fa-solid fa-user-secret ghost-ic"></i><span class="cname" style="font-style:italic">Temporary chat</span><span class="cwhen">now</span></div>`);

  $('#sideTree').innerHTML = t.join('');
}

/* ---------- Hub ---------- */
function hubHeader(p) {
  const grown = isGrown(p);
  const avatars = grown && p.members.length > 1
    ? `<span class="avstack">${p.members.map((m) => `<span class="avatar" style="background:${m.color}">${m.init}</span>`).join('')}</span>` : '';
  return `<div class="qh-head">
    <span class="qh-picon" style="background:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
    <div style="min-width:0">
      <h3 class="qh-title" id="hubTitle">${esc(p.name)}</h3>
      <p class="qh-desc" id="hubDesc">${esc(p.desc)}</p>
    </div>
    <div class="qh-actions">
      ${avatars}
      <button class="iconbtn" data-act="share" title="Share project"><i class="fa-solid fa-user-plus"></i></button>
      <button class="btn sm" data-act="new-chat"><i class="fa-solid fa-plus"></i> New chat</button>
      <button class="iconbtn" data-act="proj-menu" title="Project settings"><i class="fa-solid fa-ellipsis"></i></button>
    </div>
  </div>`;
}

function hubTabs(p) {
  if (!isGrown(p)) return '';
  const tabs = ['overview', 'conversations', 'memory', 'artifacts', 'members'];
  return `<div class="qh-tabs">${tabs.map((t) =>
    `<span class="t ${state.tab === t ? 'active' : ''}" data-act="tab" data-id="${t}">${t[0].toUpperCase() + t.slice(1)}</span>`).join('')}</div>`;
}

function convRow(c, i) {
  const right = i === 0
    ? `<span class="continue" data-act="open-conv" data-id="${c.id}">Continue <i class="fa-solid fa-arrow-right"></i></span>`
    : `<span class="w">${c.when}</span>`;
  return `<div class="qh-conv" data-act="open-conv" data-id="${c.id}">
    <div class="tt"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.summary)}</div></div>${right}</div>`;
}

function memRow(m) {
  if (m.status === 'provisional') {
    return `<div class="qh-mem provisional" data-mem="${m.id}">
      <span class="m">${esc(m.text)}</span>
      <span class="scope">${esc(m.scope)} · provisional</span>
      <span class="keep-ops"><span data-act="mem-keep" data-id="${m.id}">Keep</span><span class="dim" data-act="mem-forget" data-id="${m.id}">Forget</span></span></div>`;
  }
  return `<div class="qh-mem" data-mem="${m.id}">
    <span class="m">${esc(m.text)}</span>
    <span class="scope">${esc(m.scope)}</span>
    <span class="ops">
      <button data-act="mem-edit" data-id="${m.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button data-act="mem-forget" data-id="${m.id}" title="Forget"><i class="fa-solid fa-trash"></i></button>
    </span></div>`;
}

function artRow(a) {
  const latest = a.versions[a.versions.length - 1];
  return `<div class="qh-art" data-act="open-artifact" data-id="${a.id}"><i class="${a.icon}"></i>
    <span class="t">${esc(a.title)}</span><span class="meta">v${latest.v} · ${latest.when}</span></div>`;
}

function sect(label, action, rows) {
  const a = action ? `<span class="a" data-act="${action.act}" data-id="${action.id || ''}">${action.label}</span>` : '';
  return `<div class="qh-sect"><div class="qh-label"><span class="l">${label}</span>${a}</div>${rows}</div>`;
}

function hubOverview(p) {
  const parts = [];
  if (p.conversations.length === 0) {
    parts.push(`<div class="qh-empty">
      <p class="big">Start the first conversation</p>
      <p class="sub">Agents will know they're working inside ${esc(p.name)} — memory and outputs collect here.</p>
      <div class="qh-empty-input"><input id="emptySend" placeholder="Ask anything in ${esc(p.name)}…">
        <button class="send" data-act="empty-send"><i class="fa-solid fa-paper-plane"></i></button></div>
    </div>`);
    return parts.join('');
  }

  parts.push(sect('Conversations',
    p.conversations.length > 3 ? { act: 'tab', id: 'conversations', label: `All ${p.conversations.length} →` } : null,
    p.conversations.slice(0, 3).map(convRow).join('')));

  const running = p.workflows.filter((w) => w.running);
  if (running.length) {
    const rows = running.map((w) => `<div class="qh-run"><span class="dot"></span><span class="t">${esc(w.title)}</span>
      <span class="meta">${esc(w.meta)}</span><span class="bar"><span style="width:${w.pct}%"></span></span></div>`).join('');
    parts.push(sect('Running now', { act: 'noop', label: 'Gantt →' }, rows));
  }

  if (p.artifacts.length)
    parts.push(sect('Artifacts', { act: 'tab', id: 'artifacts', label: `All ${p.artifacts.length} →` }, p.artifacts.slice(0, 3).map(artRow).join('')));

  if (p.memory.length) {
    const cap = isGrown(p) ? 2 : 3;
    const provisional = p.memory.filter((m) => m.status === 'provisional');
    const shown = [...provisional, ...p.memory.filter((m) => m.status !== 'provisional')].slice(0, Math.max(cap, provisional.length));
    parts.push(sect('What agents remember here', { act: 'tab', id: 'memory', label: 'Manage →' }, shown.map(memRow).join('')));
  }

  if (!isGrown(p))
    parts.push(`<p class="qh-foot"><i class="fa-solid fa-seedling"></i>Workflows, artifacts, and members appear here when those ship — nothing renders empty. Sparse projects stay this calm forever.</p>`);
  return parts.join('');
}

function hubTabBody(p) {
  // Sparse projects have no tab bar — sub-views need their own way home.
  const back = !isGrown(p) && state.tab !== 'overview'
    ? `<div class="chat-bread" style="margin-top:22px"><span class="home" data-act="tab" data-id="overview"><i class="fa-solid fa-arrow-left"></i> Overview</span></div>` : '';
  return back + hubTabInner(p);
}

function hubTabInner(p) {
  switch (state.tab) {
    case 'conversations':
      return sect('All conversations', null, p.conversations.map((c, i) => convRow(c, i === 0 ? 0 : 1)).join(''));
    case 'memory': {
      const provisional = p.memory.filter((m) => m.status === 'provisional');
      const active = p.memory.filter((m) => m.status !== 'provisional');
      let out = '';
      if (provisional.length) out += sect('New — review', null, provisional.map(memRow).join(''));
      out += sect('What agents remember here', { act: 'mem-add', label: '+ Add note' }, active.map(memRow).join('') || '<p class="qh-foot" style="margin-top:8px">Nothing yet — notes are learned in conversation or added here.</p>');
      out += `<p class="qh-foot"><i class="fa-solid fa-circle-info"></i>Scope controls which agents read a note; project notes never leak outside ${esc(p.name)}. New notes learned in chat arrive as provisional until you keep them.</p>`;
      return out;
    }
    case 'artifacts':
      return sect('All artifacts', null, p.artifacts.map(artRow).join('') || '<p class="qh-foot" style="margin-top:8px">No artifacts yet.</p>');
    case 'members':
      return sect('Members', { act: 'share', label: 'Invite →' }, p.members.map((m) =>
        `<div class="qh-member"><span class="avatar" style="background:${m.color}">${m.init}</span><span class="nm">${esc(m.name)}</span><span class="role">${m.role}</span></div>`).join('')) +
        `<p class="qh-foot"><i class="fa-solid fa-circle-info"></i>Members see everything in this project. Nesting inheritance is deliberately unanswered here (hierarchy question 3).</p>`;
    default:
      return hubOverview(p);
  }
}

function renderHub() {
  const p = project(state.projectId);
  if (!p) {
    if (!DATA.projects.length) return renderFirstRun();
    state.projectId = DATA.projects[0].id;
    return renderHub();
  }
  $('#main').innerHTML = `<div class="qh-page">${hubHeader(p)}${hubTabs(p)}${hubTabBody(p)}</div>`;
  const empty = $('#emptySend'); if (empty) empty.focus();
}

/* ---------- First run (brand-new user — nothing exists) ---------- */
const STARTERS = [
  { text: 'Which members are at risk of lapsing this quarter?', sub: 'Sage reads your membership and engagement data' },
  { text: 'Summarize last week\'s event registrations', sub: 'Trends, totals, and anything unusual' },
  { text: 'Draft a renewal reminder email in our voice', sub: 'You can save the result and reuse it' },
];

function renderFirstRun() {
  const rows = STARTERS.map((s, i) =>
    `<div class="fr-sug" data-act="fr-suggest" data-id="${i}">
      <div class="tt"><div class="t">${esc(s.text)}</div><div class="s">${esc(s.sub)}</div></div>
      <i class="fa-solid fa-arrow-right"></i></div>`).join('');
  $('#main').innerHTML = `<div class="qh-page">
    <div class="fr-hero">
      <h3 class="fr-title">Ask anything</h3>
      <p class="fr-sub">Sage knows your organization's data — members, events, finances — and remembers what matters as you work together.</p>
      <div class="qh-empty-input" style="margin-top:22px"><input id="frInput" placeholder="Message Sage…">
        <button class="send" data-act="fr-send"><i class="fa-solid fa-paper-plane"></i></button></div>
    </div>
    <div class="qh-sect" style="margin-top:46px">
      <div class="qh-label"><span class="l">Or start from one of these</span></div>
      ${rows}
    </div>
    <p class="qh-foot" style="text-align:center"><i class="fa-solid fa-seedling"></i>As work accumulates, group conversations into projects — shared memory, outputs, and people in one place. Nothing to set up now.</p>
  </div>`;
  $('#frInput').focus();
}

/* ---------- Artifact page ---------- */
function artifactBody(p, a, selectedV) {
  const sel = selectedV || a.versions[a.versions.length - 1].v;
  const ver = a.versions.find((v) => v.v === sel);
  const chips = a.versions.map((v) =>
    `<span class="vchip ${v.v === sel ? 'active' : ''}" data-act="art-version" data-id="${v.v}">v${v.v}</span>`).join('');
  return { sel, ver, chips };
}

function renderArtifact() {
  const p = project(state.projectId);
  const a = artifact(p, state.artifactId);
  if (!a) return renderHub();
  const { sel, ver, chips } = artifactBody(p, a, state.artifactVersion);
  const editable = state.editingArtifact;
  $('#main').innerHTML = `<div class="qh-page">
    <div class="chat-bread" style="margin-bottom:18px">
      <span class="home" data-act="open-hub" data-id="${p.id}"><i class="fa-solid ${p.icon}" style="color:${p.color}"></i> ${esc(p.name)}</span>
      <i class="fa-solid fa-chevron-right sep"></i>
      <span class="home" data-act="open-tab" data-id="artifacts">Artifacts</span>
    </div>
    <div class="art-head">
      <div style="min-width:0">
        <h3 class="art-title">${esc(a.title)}</h3>
        <p class="art-meta">${a.kind} · v${ver.v} · ${ver.by} · ${ver.when} — ${esc(ver.note)}</p>
      </div>
      <div class="art-actions">
        ${editable
          ? `<button class="btn sm" data-act="art-save">Save as v${a.versions.length + 1}</button>
             <button class="btn secondary sm" data-act="art-cancel">Cancel</button>`
          : `<button class="btn secondary sm" data-act="art-edit"><i class="fa-solid fa-pen"></i> Edit</button>
             <button class="btn secondary sm" data-act="art-share"><i class="fa-solid fa-user-plus"></i> Share</button>
             <button class="btn secondary sm" data-act="art-remix"><i class="fa-solid fa-code-branch"></i> Remix</button>`}
      </div>
    </div>
    <div class="qh-sect" style="margin-top:22px">
      <div class="qh-label"><span class="l">Versions</span><span class="a" style="cursor:default">edits create a new version — the agent stays a collaborator</span></div>
      <div class="vchips" style="margin-top:8px">${chips}</div>
    </div>
    <div class="doc-preview" id="docPreview" ${editable ? 'contenteditable="true"' : ''}>
      <h4>${esc(a.title)} <span style="font-weight:400;color:var(--mj-text-disabled)">· v${ver.v}</span></h4>
      <p>${esc(ver.note)}. ${editable ? 'You are editing — this becomes a new version on save.' : 'Preview of this version\'s content.'}</p>
      <div class="skeleton" style="width:92%"></div>
      <div class="skeleton" style="width:84%"></div>
      <div class="skeleton" style="width:88%"></div>
      <div class="skeleton" style="width:56%"></div>
    </div>
  </div>`;
  if (editable) $('#docPreview').focus();
}

/* ---------- Chat ---------- */
function planCardHtml(m, mi) {
  const plan = m.plan;
  if (plan.status === 'approved') {
    const lines = plan.exec.map((x) =>
      `<div class="exec-line ${x.state === 'run' ? 'run' : ''}"><i class="fa-solid ${x.state === 'done' ? 'fa-check' : 'fa-circle-notch'}"></i>${esc(x.text)}</div>`).join('');
    return `<div class="plan-done"><i class="fa-solid fa-check"></i>Plan approved · ${plan.steps.length} steps</div>${lines}`;
  }
  const steps = plan.steps.map((s, i) =>
    `<div class="plan-step"><span class="n">${i + 1}</span><span class="txt" data-act="plan-edit-step" data-id="${mi}:${i}" title="Click to edit">${esc(s)}</span></div>`).join('');
  return `<div class="plan-card">
    <div class="p-label">Plan — review before I run</div>
    ${steps}
    <div class="p-actions">
      <button class="btn sm" data-act="plan-approve" data-id="${mi}">Approve &amp; run</button>
      <button class="btn secondary sm" data-act="plan-revise" data-id="${mi}">Revise</button>
      <span class="p-hint">steps are editable — click one</span>
    </div>
  </div>`;
}

function msgTags(tags) {
  if (!tags || !tags.length) return '';
  return `<div class="msg-tags">${tags.map((t) =>
    `<span class="mtag" ${t.color ? `style="color:${t.color}"` : ''}><i class="fa-solid ${t.icon}"></i>${esc(t.label)}</span>`).join('')}</div>`;
}

function msgHtml(m, mi) {
  if (m.who === 'user') return `<div class="msg-user">${esc(m.text)}${msgTags(m.tags)}</div>`;
  const remembered = m.remembered
    ? `<div class="remembered"><i class="fa-solid fa-check"></i>Remembered — "${esc(m.remembered)}" · Project<span class="undo" data-act="mem-undo" data-id="${mi}">Undo</span></div>` : '';
  const skill = m.skill
    ? `<div class="remembered"><i class="fa-solid fa-wand-magic-sparkles" style="color:${m.skillColor || 'var(--mj-brand-primary)'}"></i>Skill activated — ${esc(m.skill)}</div>` : '';
  const plan = m.plan ? planCardHtml(m, mi) : '';
  return `<div class="msg-agent ${m.thinking ? 'thinking' : ''}"><div class="who">${esc(m.who)}</div>${skill}${m.text ? esc(m.text) : ''}${plan}${remembered}</div>`;
}

function companionHtml(p) {
  if (state.railMode === 'artifact') {
    const a = artifact(p, state.railArtifactId);
    if (!a) { state.railMode = 'context'; return companionHtml(p); }
    const latest = a.versions[a.versions.length - 1];
    const chips = a.versions.map((v) =>
      `<span class="vchip ${v.v === latest.v ? 'active' : ''}">v${v.v}</span>`).join('');
    return `<aside class="companion">
      <span class="c-back" data-act="rail-context"><i class="fa-solid fa-arrow-left"></i> Project context</span>
      <h4 class="c-arttitle">${esc(a.title)}</h4>
      <p class="c-artmeta">${a.kind} · v${latest.v} · ${latest.by} · ${latest.when}</p>
      <div class="vchips">${chips}</div>
      <div class="doc-preview small">
        <div class="skeleton" style="width:90%"></div>
        <div class="skeleton" style="width:78%"></div>
        <div class="skeleton" style="width:84%"></div>
      </div>
      <div class="c-actions">
        <button class="btn secondary sm" data-act="open-artifact" data-id="${a.id}">Open full</button>
        <button class="btn secondary sm" data-act="art-share-rail" data-id="${a.id}">Share</button>
      </div>
    </aside>`;
  }

  const mem = p.memory.slice(0, 3).map((m) =>
    `<div class="c-mem">${esc(m.text)}<span class="scope">· ${esc(m.scope)}${m.status === 'provisional' ? ' · provisional' : ''}</span></div>`).join('');
  const running = p.workflows.filter((w) => w.running).map((w) =>
    `<div class="c-run"><div class="t">${esc(w.title)}</div><div class="meta">${esc(w.meta)}</div><div class="bar"><span style="width:${w.pct}%"></span></div></div>`).join('');
  const arts = p.artifacts.map((a) => {
    const latest = a.versions[a.versions.length - 1];
    return `<div class="c-art" data-act="rail-artifact" data-id="${a.id}"><i class="${a.icon}"></i><span class="t">${esc(a.title)}</span><span class="meta">v${latest.v}</span></div>`;
  }).join('');

  return `<aside class="companion">
    <div class="c-sect"><div class="c-label"><span class="l">Memory</span><span class="a" data-act="open-tab-from-chat" data-id="memory">Manage</span></div>${mem || '<div class="c-mem" style="color:var(--mj-text-disabled)">Nothing yet.</div>'}</div>
    ${running ? `<div class="c-sect"><div class="c-label"><span class="l">Running now</span></div>${running}</div>` : ''}
    ${arts ? `<div class="c-sect"><div class="c-label"><span class="l">Artifacts</span><span class="a" data-act="open-tab-from-chat" data-id="artifacts">All</span></div>${arts}</div>` : ''}
  </aside>`;
}

function chatHeader({ proj, title, temporary }) {
  const bread = proj
    ? `<span class="home" data-act="open-hub" data-id="${proj.id}"><i class="fa-solid ${proj.icon}" style="color:${proj.color}"></i> ${esc(proj.name)}</span><i class="fa-solid fa-chevron-right sep"></i>`
    : '';
  const gauge = `<span class="chat-gauge">38%<span class="pop">
      <div class="kv"><span class="k">Context used</span><span class="v">382K / 1M</span></div>
      <div class="kv"><span class="k">This turn</span><span class="v">+6.1K tok</span></div>
      <hr><div class="kv"><span class="k">Run cost</span><span class="v">$0.74</span></div>
    </span></span>`;
  const companionBtn = proj
    ? `<button class="iconbtn ${state.companion ? 'on' : ''}" data-act="toggle-companion" title="Project context panel"><i class="fa-solid fa-table-columns"></i></button>` : '';
  const menuBtn = state.convId && !temporary
    ? `<button class="iconbtn" data-act="conv-menu" title="Conversation options"><i class="fa-solid fa-ellipsis"></i></button>` : '';
  return `<div class="chat-head">
    <span class="chat-bread">${bread}</span>
    <span class="chat-title" ${temporary ? 'style="font-style:italic;color:var(--mj-text-muted)"' : ''}>${esc(title)}</span>
    <span class="grow"></span>${gauge}${companionBtn}${menuBtn}</div>`;
}

function chipHtml(c, i) {
  const style = c.color ? `style="color:${c.color};border-color:color-mix(in srgb, ${c.color} 35%, transparent)"` : '';
  return `<span class="c-chip" ${style}><i class="fa-solid ${c.icon}"></i>${esc(c.label)}
    <i class="fa-solid fa-xmark x" data-act="chip-remove" data-id="${i}"></i></span>`;
}

function composerHtml(proj, inputId, placeholder, sendAct) {
  const d = draft();
  const isRemote = composer.agent.name === 'Skip';
  const planChip = proj && !isRemote
    ? `<span class="chip-toggle ${state.planArmed ? 'on' : ''}" data-act="toggle-plan" title="Ask for an editable plan before this request runs — one request only">
        <i class="fa-solid fa-list-check"></i> Plan first</span>` : '';
  const chips = d.chips.length ? `<div class="chip-row">${d.chips.map(chipHtml).join('')}</div>` : '';
  return `<div class="chat-composer"><div class="box2">
    ${chips}
    <textarea id="${inputId}" rows="1" placeholder="${esc(placeholder)}">${esc(d.text)}</textarea>
    <div class="c-bar">
      <button class="iconbtn" data-act="attach-menu" title="Attach — file or artifact"><i class="fa-solid fa-paperclip"></i></button>
      <span class="agent-pill" data-act="agent-menu" title="Which agent handles this">
        <i class="fa-solid ${composer.agent.icon}" style="color:${composer.agent.color}"></i> ${composer.agent.name}
        ${isRemote ? '<span class="remote-tag">remote</span>' : ''}</span>
      ${planChip}
      <span class="chip-toggle subtle" data-act="mode-menu" title="Response mode — model preset"><i class="fa-solid fa-sliders"></i> ${composer.mode}</span>
      <span class="grow"></span>
      <button class="iconbtn ${composer.voice ? 'listening' : ''}" data-act="mic" title="Voice input"><i class="fa-solid fa-microphone"></i></button>
      <button class="send" data-act="${sendAct}"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
    <div class="mention-pop" id="mentionPop" hidden></div>
  </div></div>`;
}

/* Mention triggers: @ agents+people · # records · / skills */
function triggerItems(ch, q) {
  let items = [];
  if (ch === '@') items = [...AGENTS.map((a) => ({ label: a.name, sub: a.desc, icon: a.icon, color: a.color, kind: 'agent' })), ...PEOPLE];
  if (ch === '#') items = RECORDS;
  if (ch === '/') items = SKILLS.map((s) => ({ ...s, sub: 'Skill' }));
  return items.filter((it) => it.label.toLowerCase().startsWith(q));
}

function detectTrigger(ta) {
  const upto = ta.value.slice(0, ta.selectionStart);
  const m = upto.match(/(^|\s)([@#/])([\w-]*)$/);
  const pop = $('#mentionPop');
  if (!pop) return;
  if (!m) { pop.hidden = true; popCtx = null; return; }
  const items = triggerItems(m[2], m[3].toLowerCase());
  if (!items.length) { pop.hidden = true; popCtx = null; return; }
  popCtx = { items, trigger: m[2], typed: m[3] };
  pop.innerHTML = items.map((it, i) =>
    `<div class="mp-item" data-act="mp-pick" data-id="${i}">
      <i class="fa-solid ${it.icon}" ${it.color ? `style="color:${it.color}"` : ''}></i>
      <span class="l">${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</div>`).join('');
  pop.hidden = false;
}

function pickMention(i) {
  const it = popCtx && popCtx.items[i];
  const ta = $('#chatInput');
  if (!it || !ta) return;
  const upto = ta.value.slice(0, ta.selectionStart);
  const rest = ta.value.slice(ta.selectionStart);
  const cut = upto.replace(/([@#/])[\w-]*$/, '');
  const d = draft();
  if (it.kind === 'agent') {
    composer.agent = AGENTS.find((a) => a.name === it.label) || composer.agent;
  } else {
    d.chips.push({ kind: it.kind, label: it.label, icon: it.icon, color: it.color });
  }
  d.text = (cut + rest).replace(/\s+$/, '');
  popCtx = null;
  render();
  if (it.kind === 'agent' && it.label === 'Skip') toast('Remote agent — plan mode and skills are delegated to it (D15)');
}

function composerPayload() {
  const ta = $('#chatInput');
  if (!ta) return null;
  const d = draft();
  const text = ta.value.trim();
  if (!text && !d.chips.length) return null;
  const payload = { text: text || '(context attached)', tags: d.chips.slice(), agent: composer.agent };
  delete composer.drafts[draftKey()];
  return payload;
}

function renderChat() {
  const found = findConv(state.convId);
  if (!found) return renderHub();
  const { conv, proj, temporary } = found;
  const msgs = conv.messages.map(msgHtml).join('');
  const banner = temporary
    ? `<div class="temp-banner"><i class="fa-solid fa-user-secret"></i><span><strong>Temporary</strong> — nothing here is saved, and stored memory won't be read or written.</span></div>` : '';
  const chatEl = `<div class="chat">
    ${chatHeader({ proj, title: conv.title, temporary })}
    <div class="chat-msgs"><div class="chat-col" id="msgCol">${banner}${msgs}</div></div>
    ${composerHtml(proj, 'chatInput', temporary ? 'Ask anything — off the record…' : 'Message Sage…', 'chat-send')}
  </div>`;
  $('#main').innerHTML = proj && state.companion
    ? `<div class="chat-wrap">${chatEl}${companionHtml(proj)}</div>`
    : chatEl;
  const col = $('.chat-msgs'); if (col) col.scrollTop = col.scrollHeight;
  const inp = $('#chatInput'); if (inp) inp.focus();
}

function renderNewChat() {
  const p = project(state.projectId);
  const intro = p
    ? `Working inside ${esc(p.name)} — I'll use this project's ${p.memory.length} notes and keep anything we learn here.`
    : `No project — this starts in Ungrouped. Move it into a project later if it grows into something.`;
  const chatEl = `<div class="chat">
    ${chatHeader({ proj: p, title: 'New conversation', temporary: false })}
    <div class="chat-msgs"><div class="chat-col">
      <div class="msg-agent" style="color:var(--mj-text-muted)"><div class="who">Sage</div>${intro}</div>
    </div></div>
    ${composerHtml(p, 'chatInput', p ? `Ask anything in ${p.name}…` : 'Message Sage…', 'new-send')}
  </div>`;
  $('#main').innerHTML = p && state.companion ? `<div class="chat-wrap">${chatEl}${companionHtml(p)}</div>` : chatEl;
  $('#chatInput').focus();
}

/* ---------- Agent simulation ---------- */
const REMEMBER_RX = /\b(always|never|prefer|from now on|remember)\b/i;

function normalizePayload(payload) {
  return typeof payload === 'string' ? { text: payload, tags: [], agent: AGENTS[0] } : payload;
}

function agentRespond(conv, p, payload) {
  const { text, tags = [], agent = composer.agent } = normalizePayload(payload);
  const who = agent.name;
  const skillTag = tags.find((t) => t.kind === 'skill');

  if (who === 'Skip') {
    conv.messages.push({ who, text: `Handled remotely — I run my own loop, so plan mode and skills are delegated to my side (D15). ${p ? `I received ${p.name}'s context bag: description, ${p.memory.length} notes, recent artifacts.` : 'No project context attached.'}` });
    return;
  }
  if (state.planArmed && p) {
    conv.messages.push({ who, text: '', plan: { status: 'pending', steps: [
      'Pull renewal cohorts and current pipeline state',
      'Draft the analysis with project memory applied',
      'Save the output to this project\'s artifacts',
    ], exec: [] } });
    return;
  }
  if (REMEMBER_RX.test(text) && p) {
    const note = text.replace(/^please\s+/i, '').replace(/^remember\s+(that\s+)?/i, '');
    const clean = note[0].toUpperCase() + note.slice(1).replace(/\.*$/, '.');
    const id = 'prov' + Date.now();
    p.memory.unshift({ id, text: clean, scope: 'All agents', status: 'provisional' });
    conv.messages.push({ who, text: 'Got it — noted for this project.', remembered: clean, memId: id });
    return;
  }
  const recordTags = tags.filter((t) => t.kind === 'record');
  const recordNote = recordTags.length ? ` I've loaded ${recordTags.map((t) => t.label).join(' and ')} as context.` : '';
  const msg = { who, text: `On it — and since we're in ${p ? p.name : 'no project'}, ${p ? 'I\'m using this project\'s memory and will file outputs here.' : 'I\'m answering from org-wide data only.'}${recordNote}` };
  if (skillTag) { msg.skill = skillTag.label; msg.skillColor = skillTag.color; }
  conv.messages.push(msg);
}

function createConversation(p, payload) {
  const { text, tags, agent } = normalizePayload(payload);
  const id = 'new' + Date.now();
  const conv = { id, title: text.split(' ').slice(0, 5).join(' '), summary: `${agent ? agent.name : 'Sage'} · just now`, when: 'now',
    messages: [{ who: 'user', text, tags }, { who: agent ? agent.name : 'Sage', text: '…', thinking: true }] };
  if (p) p.conversations.unshift(conv);
  else DATA.ungrouped.unshift(conv); // no project — first-run / ungrouped sends land here
  state.view = 'chat'; state.convId = id;
  render();
  setTimeout(() => {
    conv.messages.pop();
    agentRespond(conv, p, { text, tags, agent });
    const named = text.split(' ').slice(0, 4).map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
    conv.title = named;
    render();
    toast(`Named by ${agent ? agent.name : 'Sage'}: "${named}"`);
  }, 900);
}

function appendChatMessage(payload) {
  const found = findConv(state.convId);
  if (!found) return;
  const { conv, proj, temporary } = found;
  const norm = normalizePayload(payload);
  conv.messages.push({ who: 'user', text: norm.text, tags: norm.tags });
  conv.messages.push({ who: norm.agent ? norm.agent.name : 'Sage', text: '…', thinking: true });
  render();
  setTimeout(() => {
    conv.messages.pop();
    if (temporary) conv.messages.push({ who: 'Sage', text: 'Answering off the record — nothing saved, no memory read or written.' });
    else agentRespond(conv, proj, norm);
    render();
  }, 800);
}

function approvePlan(mi) {
  const found = findConv(state.convId);
  const m = found.conv.messages[mi];
  m.plan.status = 'approved';
  state.planArmed = false; // per-request: approval disarms (B5 semantics)
  m.plan.exec = m.plan.steps.map((s) => ({ text: s, state: 'wait' }));
  render();
  toast('Plan approved — "Plan first" disarmed (per-request)');
  let i = 0;
  const tick = () => {
    if (i > 0) m.plan.exec[i - 1].state = 'done';
    if (i < m.plan.exec.length) { m.plan.exec[i].state = 'run'; i++; render(); setTimeout(tick, 700); }
    else {
      found.conv.messages.push({ who: 'Sage', text: 'Done — analysis complete, output saved to this project\'s artifacts.' });
      render();
    }
  };
  setTimeout(tick, 500);
}

/* ---------- Memory ---------- */
function startMemoryEdit(id) {
  const p = project(state.projectId);
  const m = p.memory.find((m) => m.id === id);
  const row = $(`[data-mem="${id}"]`);
  if (!m || !row) return;
  row.innerHTML = `<input class="editing" value="${esc(m.text)}">`;
  const input = $('input', row);
  input.focus(); input.setSelectionRange(m.text.length, m.text.length);
  const commit = () => { m.text = input.value.trim() || m.text; render(); toast('Memory updated'); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
  input.addEventListener('blur', commit);
}

function addMemoryNote() {
  const p = project(state.projectId);
  const id = 'mm' + Date.now();
  p.memory.push({ id, text: 'New note…', scope: 'All agents', status: 'active' });
  render();
  startMemoryEdit(id);
}

/* ---------- Menus ---------- */
function showMenu(items, anchor) {
  const menu = $('#menu');
  menu.innerHTML = items.map((it) => it === '-' ? '<hr>' :
    `<div class="mi ${it.danger ? 'danger' : ''}" data-menu="${it.act}" ${it.arg ? `data-arg="${esc(it.arg)}"` : ''}><i class="fa-solid ${it.icon}"></i>${esc(it.label)}</div>`).join('');
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + 6 + menu.offsetHeight > innerHeight ? r.top - menu.offsetHeight - 6 : r.bottom + 6;
  menu.style.top = Math.max(12, top) + 'px';
  menu.style.left = Math.max(12, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12)) + 'px';
}
function hideMenu() { $('#menu').hidden = true; }

const MENU_ACTIONS = {
  'proj-rename': () => {
    const p = project(state.projectId);
    const title = $('#hubTitle');
    title.innerHTML = `<input class="f-input" style="font-size:18px;font-weight:650" value="${esc(p.name)}">`;
    const input = $('input', title); input.focus(); input.select();
    const commit = () => { p.name = input.value.trim() || p.name; render(); toast('Renamed'); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    input.addEventListener('blur', commit);
  },
  'proj-desc': () => {
    const p = project(state.projectId);
    const desc = $('#hubDesc');
    desc.innerHTML = `<input class="f-input" style="font-size:12.5px" value="${esc(p.desc)}">`;
    const input = $('input', desc); input.focus();
    const commit = () => { p.desc = input.value.trim() || p.desc; render(); toast('Description updated — agents read this'); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    input.addEventListener('blur', commit);
  },
  'proj-delete': () => {
    const p = project(state.projectId);
    openConfirm(`Delete "${p.name}"?`,
      `Its ${p.conversations.length} conversations move to Ungrouped; memory and artifacts are removed. This is the design question — what SHOULD deleting a project do?`,
      () => {
        DATA.ungrouped.push(...p.conversations);
        DATA.projects = DATA.projects.filter((x) => x.id !== p.id);
        state.projectId = DATA.projects[0] ? DATA.projects[0].id : null;
        state.view = 'hub'; state.tab = 'overview';
        render(); toast('Project deleted — conversations moved to Ungrouped');
      });
  },
  'conv-move': () => openMove(),
  'conv-pin': () => toast('Pinned (prototype stub)'),
  'attach-upload': () => {
    const d = draft(); const ta = $('#chatInput'); if (ta) d.text = ta.value;
    d.chips.push({ kind: 'file', label: FAKE_FILES[composer.fileIdx++ % FAKE_FILES.length], icon: 'fa-file' });
    render();
  },
  'attach-art': (artId) => {
    const a = artifact(project(state.projectId), artId);
    if (!a) return;
    const d = draft(); const ta = $('#chatInput'); if (ta) d.text = ta.value;
    d.chips.push({ kind: 'artifact', label: a.title, icon: 'fa-cube' });
    render();
  },
  'set-agent': (name) => {
    composer.agent = AGENTS.find((a) => a.name === name) || composer.agent;
    const ta = $('#chatInput'); if (ta) draft().text = ta.value;
    render();
    if (name === 'Skip') toast('Remote agent — plan mode and skills are delegated to it (D15)');
  },
  'set-mode': (mode) => {
    composer.mode = mode;
    const ta = $('#chatInput'); if (ta) draft().text = ta.value;
    render();
    toast(`${mode} mode — ${mode === 'Draft' ? 'fast + cheap' : mode === 'High' ? 'slow + thorough' : 'the default balance'}`);
  },
};

/* ---------- Modals ---------- */
function openModal(which) { $('#scrim').classList.add('on'); $('#' + which).hidden = false; }
function closeModals() {
  $('#scrim').classList.remove('on');
  for (const id of ['shareModal', 'projectModal', 'moveModal', 'confirmModal']) $('#' + id).hidden = true;
  state.moveConvPending = null;
  hideMenu();
}

let confirmFn = null;
function openConfirm(title, text, fn) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  confirmFn = fn;
  openModal('confirmModal');
}

let shareContext = { type: 'project', artifactId: null };
function renderShare() {
  const p = project(state.projectId);
  const isArtifact = shareContext.type === 'artifact';
  const a = isArtifact ? artifact(p, shareContext.artifactId) : null;
  $('#shareTitle').textContent = isArtifact ? `Share "${a.title}"` : 'Share project';

  const rows = p.members.map((m) =>
    `<div class="share-row"><span class="avatar" style="background:${m.color}">${m.init}</span><span class="nm">${esc(m.name)}</span><span class="role">${m.role}</span></div>`).join('');
  const add = `<div class="share-add">
      <input class="f-input" id="shareInput" placeholder="Name or email…">
      <select class="f-select" id="shareRole"><option>Viewer</option><option>Editor</option></select>
      <button class="btn sm" data-act="share-invite">Invite</button></div>`;

  let pub = '';
  if (isArtifact) {
    pub = state.canPublish
      ? `<div class="pub-sect">
          <div class="pub-row"><span class="tgl ${a.publicLink ? 'on' : ''}" data-act="pub-toggle"></span>
            <span class="t">Public link</span><span class="s">anyone with the link · read-only</span></div>
          ${a.publicLink ? `<div class="pub-url"><input class="f-input" readonly value="https://app.example.org/a/${a.id}?t=mj_r3ad0nly…"><button class="btn secondary sm" data-act="pub-copy">Copy</button></div>
          <p class="share-note">Server-minted, single-artifact scope, read-only (Magic Links). Revoke by turning off.</p>` : ''}
        </div>`
      : `<div class="pub-sect"><p class="share-note"><i class="fa-solid fa-lock" style="margin-right:6px"></i>Public link is hidden — you don't hold "Can Publish Artifacts Publicly". No dead-end toggle (D11). Flip the demo privilege in the state map to see it.</p></div>`;
  } else {
    pub = `<p class="share-note">Members see everything in this project — conversations, memory, artifacts. Nesting inheritance: deliberately undrawn, pending the hierarchy review.</p>`;
  }

  $('#shareBody').innerHTML = rows + add + pub + `<div class="modal-actions"><button class="btn" data-act="share-done">Done</button></div>`;
}

function openShare(type, artifactId) {
  shareContext = { type, artifactId: artifactId || null };
  renderShare();
  openModal('shareModal');
}

function inviteMember() {
  const p = project(state.projectId);
  const name = $('#shareInput').value.trim();
  if (!name) return;
  const wasSparse = !isGrown(p);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#7C3AED', '#16A34A', '#D97706', '#DB2777'];
  p.members.push({ init: initials, color: colors[p.members.length % colors.length], name, role: $('#shareRole').value });
  renderShare(); renderSidebar();
  if (state.view === 'hub') renderHub();
  toast(wasSparse ? `${name} joined — the hub just grew tabs (growth contract)` : `${name} joined`);
}

function openMove() {
  const found = findConv(state.convId);
  if (!found || !found.conv) return;
  const rows = DATA.projects.map((p) =>
    `<div class="move-row" data-act="move-to" data-id="${p.id}">
      <i class="fa-solid ${p.icon} picon" style="color:${p.color}"></i>${esc(p.name)}
      ${found.proj && found.proj.id === p.id ? '<i class="fa-solid fa-check check"></i>' : ''}</div>`).join('') +
    `<div class="move-row" data-act="move-to" data-id="__none">
      <i class="fa-regular fa-circle picon"></i>Ungrouped ${!found.proj ? '<i class="fa-solid fa-check check"></i>' : ''}</div>` +
    `<div class="move-row" data-act="move-new-project" style="color:var(--mj-text-link)">
      <i class="fa-solid fa-plus picon"></i>New project…</div>`;
  $('#moveBody').innerHTML = rows +
    `<p class="share-note" style="margin-top:10px">Moving re-scopes memory: notes learned here stay with the project, not the conversation. (Design question — is that right?)</p>`;
  openModal('moveModal');
}

function moveConversation(targetId) {
  const conv = detachConv(state.convId);
  if (!conv) return;
  if (targetId === '__none') DATA.ungrouped.unshift(conv);
  else { const t = project(targetId); t.conversations.unshift(conv); state.projectId = targetId; state.openProjects.add(targetId); }
  closeModals(); render();
  toast(targetId === '__none' ? 'Moved to Ungrouped' : `Moved to ${project(targetId).name}`);
}

function detachConv(id) {
  const found = findConv(id);
  if (!found) return null;
  const { conv, proj } = found;
  if (proj) proj.conversations = proj.conversations.filter((c) => c.id !== id);
  else DATA.ungrouped = DATA.ungrouped.filter((c) => c.id !== id);
  return conv;
}

function createProject() {
  const pendingConvId = state.moveConvPending;
  const name = $('#pmName').value.trim() || 'Untitled project';
  const colors = ['#B794F6', '#68D391', '#F6AD55', '#FC8181', '#5CC0ED'];
  const p = {
    id: 'p' + Date.now(), name, icon: 'fa-folder', color: colors[DATA.projects.length % colors.length],
    desc: $('#pmDesc').value.trim() || 'No description yet — agents work better with one.',
    members: [{ init: 'AM', color: '#0076B6', name: 'Alex Morgan', role: 'Owner' }],
    memory: [], conversations: [], artifacts: [], workflows: [],
  };
  DATA.projects.push(p);
  state.openProjects.add(p.id);
  closeModals();

  // Create-at-point-of-need: arrived here from "Move → New project…"
  if (pendingConvId) {
    const conv = detachConv(pendingConvId);
    if (conv) p.conversations.unshift(conv);
    Object.assign(state, { view: 'chat', convId: pendingConvId, projectId: p.id });
    render();
    toast(`Created "${p.name}" and moved the conversation into it`);
    return;
  }

  Object.assign(state, { view: 'hub', projectId: p.id, tab: 'overview', convId: null });
  render();
  toast('Project created — this is the just-created hub state (S3)');
}

/* ---------- Simulations ---------- */
function finishWorkflow() {
  const p = project('renewal');
  const wf = p.workflows.find((w) => w.running);
  if (!wf) { toast('Nothing running — already finished'); return; }
  Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'overview', convId: null });
  render();
  let pct = wf.pct;
  const tick = () => {
    pct = Math.min(100, pct + 8);
    wf.pct = pct; wf.meta = `Sage · step ${pct < 80 ? 3 : 4} of 4 · finishing`;
    render();
    if (pct < 100) setTimeout(tick, 350);
    else {
      wf.running = false;
      p.artifacts.unshift({ id: 'a' + Date.now(), title: 'Win-back Email Drafts', icon: 'fa-regular fa-file-lines', kind: 'Document',
        versions: [{ v: 1, when: 'now', by: 'Sage', note: 'Workflow output — three-touch win-back sequence' }] });
      render();
      toast('Workflow finished — "Running now" left the page, output landed in Artifacts');
    }
  };
  setTimeout(tick, 400);
}

/* ---------- State-map jumps ---------- */
const SEEDED_JUMPS = new Set([
  'hub-grown', 'hub-v1', 'tab-conversations', 'tab-memory', 'tab-artifacts', 'tab-members',
  'chat-project', 'chat-new', 'chat-ungrouped', 'chat-companion', 'flow-plan', 'flow-remember',
  'artifact-page', 'flow-grow', 'flow-workflow', 'micro-memory', 'proj-menu', 'modal-share', 'modal-move',
  'comp-mention', 'comp-record', 'comp-skill', 'comp-attach', 'comp-agent', 'comp-draft',
]);

function insertTrigger(ch) {
  const ta = $('#chatInput');
  if (!ta) return;
  ta.focus();
  ta.value = ta.value ? ta.value.replace(/\s*$/, ' ') + ch : ch;
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const JUMPS = {
  'persona-est':      () => { setPersona('established'); return 'noRender'; },
  'persona-new':      () => { setPersona('firstrun'); return 'noRender'; },
  'hub-grown':        () => Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'overview', convId: null }),
  'hub-v1':           () => Object.assign(state, { view: 'hub', projectId: 'website', tab: 'overview', convId: null }),
  'hub-empty':        () => { closeModals(); openModal('projectModal'); $('#pmName').value = ''; $('#pmDesc').value = ''; setTimeout(() => $('#pmName').focus(), 50); return 'noRender'; },
  'tab-conversations':() => Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'conversations' }),
  'tab-memory':       () => Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'memory' }),
  'tab-artifacts':    () => Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'artifacts' }),
  'tab-members':      () => Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'members' }),
  'chat-project':     () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }),
  'chat-new':         () => Object.assign(state, { view: 'newchat', projectId: 'renewal' }),
  'chat-ungrouped':   () => Object.assign(state, { view: 'chat', convId: 'u1' }),
  'chat-companion':   () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', companion: true, railMode: 'context' }),
  'chat-temporary':   () => { DATA.temporary.messages = []; Object.assign(state, { view: 'chat', convId: 'tmp' }); },
  'flow-plan':        () => { Object.assign(state, { view: 'newchat', projectId: 'renewal', planArmed: true }); render(); $('#chatInput').value = 'Compare renewal rates by chapter and flag outliers'; toast('Plan armed for THIS request — send it'); return 'noRender'; },
  'flow-remember':    () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); $('#chatInput').value = 'Always loop in Dana on pipeline summaries'; toast('Send it — watch the quiet "Remembered" moment'); return 'noRender'; },
  'artifact-page':    () => Object.assign(state, { view: 'artifact', projectId: 'renewal', artifactId: 'a1', artifactVersion: null, editingArtifact: false }),
  'flow-grow':        () => { Object.assign(state, { view: 'hub', projectId: 'website', tab: 'overview', convId: null }); render(); openShare('project'); setTimeout(() => { const i = $('#shareInput'); if (i) { i.value = 'Dana Kim'; i.focus(); } }, 60); return 'noRender'; },
  'flow-workflow':    () => { finishWorkflow(); return 'noRender'; },
  'micro-memory':     () => { Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'memory' }); render(); toast('Hover a memory row — pencil edits inline, trash forgets'); return 'noRender'; },
  'proj-menu':        () => { Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'overview' }); render(); const b = $('[data-act="proj-menu"]'); if (b) b.click(); return 'noRender'; },
  'modal-share':      () => { Object.assign(state, { view: 'hub', projectId: 'renewal', tab: 'overview' }); render(); openShare('project'); return 'noRender'; },
  'modal-project':    () => { openModal('projectModal'); return 'noRender'; },
  'modal-move':       () => { Object.assign(state, { view: 'chat', convId: 'c2', projectId: 'renewal' }); render(); openMove(); return 'noRender'; },
  'comp-mention':     () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); insertTrigger('@'); toast('@ mentions — agents route the message, people get referenced'); return 'noRender'; },
  'comp-record':      () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); insertTrigger('#'); toast('# attaches a record as context'); return 'noRender'; },
  'comp-skill':       () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); insertTrigger('/'); toast('/ requests a skill — watch the activation line on the reply'); return 'noRender'; },
  'comp-attach':      () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); const b = $('[data-act="attach-menu"]'); if (b) b.click(); return 'noRender'; },
  'comp-agent':       () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); const b = $('[data-act="agent-menu"]'); if (b) b.click(); return 'noRender'; },
  'comp-draft':       () => {
    Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render();
    const ta = $('#chatInput'); ta.value = 'Draft: renewal talking points for the board'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    Object.assign(state, { convId: 'c2' }); render();
    toast('Draft saved on "Q3 renewal targets" — open it again and the text is still there');
    return 'noRender';
  },
};

/* ---------- Render + events ---------- */
function render() {
  renderSidebar();
  ({ hub: renderHub, chat: renderChat, newchat: renderNewChat, artifact: renderArtifact })[state.view]();
}

document.addEventListener('click', (e) => {
  const menuItem = e.target.closest('[data-menu]');
  if (menuItem) { hideMenu(); const fn = MENU_ACTIONS[menuItem.dataset.menu]; if (fn) fn(menuItem.dataset.arg); return; }
  if (!e.target.closest('#menu')) hideMenu();
  if (!e.target.closest('.mention-pop') && !e.target.closest('#chatInput')) { const mp = $('#mentionPop'); if (mp) { mp.hidden = true; popCtx = null; } }

  const jump = e.target.closest('[data-jump]');
  if (jump) {
    const key = jump.dataset.jump;
    if (SEEDED_JUMPS.has(key) && !project('renewal')) { toast('That state needs seed data — switch to "Established user" (P1) first'); return; }
    const fn = JUMPS[key]; if (fn && fn() !== 'noRender') render(); return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.stopPropagation();
  const id = el.dataset.id;
  const p = () => project(state.projectId);

  switch (el.dataset.act) {
    /* navigation */
    case 'open-hub': Object.assign(state, { view: 'hub', projectId: id, tab: 'overview', convId: null }); state.openProjects.add(id); render(); break;
    case 'open-tab': Object.assign(state, { view: 'hub', tab: id }); render(); break;
    case 'open-tab-from-chat': Object.assign(state, { view: 'hub', tab: id, convId: null }); render(); break;
    case 'open-conv': { const f = findConv(id); Object.assign(state, { view: 'chat', convId: id }); if (f && f.proj) state.projectId = f.proj.id; render(); break; }
    case 'tab': state.tab = id; render(); break;
    case 'new-chat': state.view = 'newchat'; render(); break;
    case 'new-project': openModal('projectModal'); $('#pmName').value = ''; $('#pmDesc').value = ''; setTimeout(() => $('#pmName').focus(), 50); break;

    /* composer */
    case 'toggle-plan': { const d = draft(); d.text = $('#chatInput') ? $('#chatInput').value : d.text;
      state.planArmed = !state.planArmed; render(); if (state.planArmed) toast('Plan first — armed for this request only'); break; }
    case 'new-send': { const pl = composerPayload(); if (pl) createConversation(project(state.projectId), pl); break; }
    case 'chat-send': { const pl = composerPayload(); if (pl) appendChatMessage(pl); break; }
    case 'fr-send': { const v = $('#frInput').value.trim(); if (v) createConversation(null, v); break; }
    case 'fr-suggest': createConversation(null, STARTERS[Number(id)].text); break;
    case 'empty-send': { const v = $('#emptySend').value.trim(); if (v) createConversation(p(), v); break; }
    case 'mp-pick': pickMention(Number(id)); break;
    case 'chip-remove': { draft().chips.splice(Number(id), 1); const ta = $('#chatInput'); if (ta) draft().text = ta.value; render(); break; }
    case 'mic': { composer.voice = !composer.voice; const ta = $('#chatInput'); if (ta) draft().text = ta.value; render();
      toast(composer.voice ? 'Listening — dictation lands in the box (prototype)' : 'Voice off'); break; }
    case 'attach-menu': { const items = [{ act: 'attach-upload', icon: 'fa-arrow-up-from-bracket', label: 'Upload file…' }];
      const proj2 = p();
      if (proj2 && proj2.artifacts.length) { items.push('-');
        for (const a of proj2.artifacts) items.push({ act: 'attach-art', arg: a.id, icon: 'fa-cube', label: a.title }); }
      showMenu(items, el); break; }
    case 'agent-menu': showMenu(AGENTS.map((a) => ({ act: 'set-agent', arg: a.name, icon: a.icon, label: `${a.name} — ${a.desc}` })), el); break;
    case 'mode-menu': showMenu(['Draft', 'Standard', 'High'].map((m) => ({ act: 'set-mode', arg: m, icon: m === composer.mode ? 'fa-check' : 'fa-sliders', label: m })), el); break;

    /* plan card */
    case 'plan-approve': approvePlan(Number(id)); break;
    case 'plan-revise': { const f = findConv(state.convId); f.conv.messages.push({ who: 'Sage', text: 'What should change? Edit steps directly, or tell me and I\'ll re-plan.' }); render(); break; }
    case 'plan-edit-step': {
      const [mi, si] = id.split(':').map(Number);
      const f = findConv(state.convId);
      const step = el; const plan = f.conv.messages[mi].plan;
      step.outerHTML = `<input value="${esc(plan.steps[si])}" data-step="${id}">`;
      const input = $(`input[data-step="${id}"]`);
      input.focus(); input.select();
      const commit = () => { plan.steps[si] = input.value.trim() || plan.steps[si]; render(); };
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') render(); });
      input.addEventListener('blur', commit);
      break;
    }

    /* memory */
    case 'mem-edit': startMemoryEdit(id); break;
    case 'mem-add': addMemoryNote(); break;
    case 'mem-forget': p().memory = p().memory.filter((m) => m.id !== id); render(); toast('Forgotten'); break;
    case 'mem-keep': { const m = p().memory.find((m) => m.id === id); if (m) m.status = 'active'; render(); toast('Kept — now active project memory'); break; }
    case 'mem-undo': { const f = findConv(state.convId); const msg = f.conv.messages[Number(id)];
      if (msg && msg.memId && f.proj) { f.proj.memory = f.proj.memory.filter((m) => m.id !== msg.memId); delete msg.remembered; }
      render(); toast('Forgotten'); break; }

    /* companion rail */
    case 'toggle-companion': state.companion = !state.companion; state.railMode = 'context'; render(); break;
    case 'rail-artifact': state.railMode = 'artifact'; state.railArtifactId = id; render(); break;
    case 'rail-context': state.railMode = 'context'; render(); break;

    /* artifacts */
    case 'open-artifact': Object.assign(state, { view: 'artifact', artifactId: id, artifactVersion: null, editingArtifact: false }); render(); break;
    case 'art-version': state.artifactVersion = Number(id); state.editingArtifact = false; render(); break;
    case 'art-edit': state.editingArtifact = true; render(); break;
    case 'art-cancel': state.editingArtifact = false; render(); break;
    case 'art-save': { const a = artifact(p(), state.artifactId);
      a.versions.push({ v: a.versions.length + 1, when: 'now', by: 'You', note: 'Your edit — agent stays a collaborator' });
      Object.assign(state, { editingArtifact: false, artifactVersion: null });
      render(); toast(`Saved as v${a.versions.length} — versions are append-only`); break; }
    case 'art-share': openShare('artifact', state.artifactId); break;
    case 'art-share-rail': openShare('artifact', id); break;
    case 'art-remix': { const a = artifact(p(), state.artifactId);
      createConversation(p(), `Remix ${a.title} — new direction`); toast('Remixed into a new conversation — original untouched'); break; }
    case 'pub-toggle': { const a = artifact(p(), shareContext.artifactId); a.publicLink = !a.publicLink; renderShare(); break; }
    case 'pub-copy': toast('Link copied'); break;

    /* share */
    case 'share': openShare('project'); break;
    case 'share-invite': inviteMember(); break;
    case 'share-done': closeModals(); break;

    /* menus */
    case 'proj-menu': showMenu([
        { act: 'proj-rename', icon: 'fa-pen', label: 'Rename project' },
        { act: 'proj-desc', icon: 'fa-align-left', label: 'Edit description' },
        '-',
        { act: 'proj-delete', icon: 'fa-trash', label: 'Delete project', danger: true },
      ], el); break;
    case 'conv-menu': showMenu([
        { act: 'conv-move', icon: 'fa-folder-open', label: 'Move to project…' },
        { act: 'conv-pin', icon: 'fa-thumbtack', label: 'Pin conversation' },
      ], el); break;
    case 'move-to': moveConversation(id); break;
    case 'move-new-project': {
      const convId = state.convId;
      closeModals();
      state.moveConvPending = convId;
      openModal('projectModal');
      $('#pmName').value = ''; $('#pmDesc').value = '';
      setTimeout(() => $('#pmName').focus(), 50);
      break;
    }

    case 'noop': toast('Out of prototype scope'); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'chatInput') return;
  const ta = e.target;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  draft().text = ta.value;
  detectTrigger(ta);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    if (e.target.id === 'chatInput') {
      if (popCtx) { e.preventDefault(); pickMention(0); return; }
      if (!e.shiftKey) {
        e.preventDefault();
        const act = state.view === 'newchat' ? 'new-send' : 'chat-send';
        const b = $(`[data-act="${act}"]`); if (b) b.click();
      }
      return;
    }
    if (e.target.id === 'emptySend') { const b = $('[data-act="empty-send"]'); if (b) b.click(); }
    if (e.target.id === 'frInput') { const b = $('[data-act="fr-send"]'); if (b) b.click(); }
    if (e.target.id === 'pmName' || e.target.id === 'pmDesc') $('#pmCreate').click();
    if (e.target.id === 'shareInput') { const b = $('[data-act="share-invite"]'); if (b) b.click(); }
  }
  if (e.key === 'Escape') {
    if (popCtx) { const mp = $('#mentionPop'); if (mp) mp.hidden = true; popCtx = null; return; }
    closeModals();
  }
});

$('#scrim').addEventListener('click', closeModals);
$('#pmCancel').addEventListener('click', closeModals);
$('#pmCreate').addEventListener('click', createProject);
$('#confirmNo').addEventListener('click', closeModals);
$('#confirmYes').addEventListener('click', () => { closeModals(); if (confirmFn) { confirmFn(); confirmFn = null; } });
$('#newConvBtn').addEventListener('click', () => { state.view = 'newchat'; render(); });
$('#newTempBtn').addEventListener('click', () => { DATA.temporary.messages = []; Object.assign(state, { view: 'chat', convId: 'tmp' }); render(); });
$('#smHead').addEventListener('click', () => $('#stateMap').classList.toggle('closed'));
$('#privToggle').addEventListener('click', () => {
  state.canPublish = !state.canPublish;
  $('#privTgl').classList.toggle('on', state.canPublish);
  if (!$('#shareModal').hidden) renderShare();
  toast(state.canPublish ? 'Privilege granted — publish appears' : 'Privilege revoked — publish is hidden, not disabled');
});
$('#themeBtn').addEventListener('click', () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === 'dark' ? '' : 'dark';
});

render();
