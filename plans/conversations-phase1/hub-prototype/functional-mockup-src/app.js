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
      id: 'renewal', name: 'Membership Renewal', icon: 'fa-arrows-rotate', color: 'var(--mj-brand-primary)',
      desc: 'FY26 renewal push — targets, win-back messaging, and the renewal dashboard.',
      members: [
        { init: 'AM', color: 'var(--mj-brand-primary)', name: 'Alex Morgan', role: 'Owner' },
        { init: 'DK', color: '#7C3AED', name: 'Dana Kim', role: 'Editor' },
        { init: 'RB', color: '#16A34A', name: 'Ray Barnes', role: 'Viewer' },
      ],
      memory: [
        { id: 'm1', text: 'Target members lapsed under 90 days before longer-lapsed cohorts.', scope: 'All agents', status: 'active', src: 'Sage · Q3 renewal targets', when: '2h ago' },
        { id: 'm2', text: 'Renewal emails come from the chapter, not national.', scope: 'Sage', status: 'active', src: 'Sage · Win-back copy', when: '4d ago' },
        { id: 'm3', text: 'Fiscal year runs July–June.', scope: 'All agents · global', status: 'active', src: 'Memory consolidation', when: '2w ago' },
        { id: 'm4', text: 'Exec summaries stay under 200 words.', scope: 'All agents · global', status: 'active', src: 'Alex · added manually', when: '1w ago' },
      ],
      conversations: [
        { id: 'c1', title: 'Q3 renewal targets', summary: 'Sage flagged 3 at-risk renewals, $890K exposure', when: '1d',
          messages: [
            { who: 'user', text: 'Which renewals are at risk this quarter?', when: '1d' },
            { who: 'Sage', when: '1d', dur: '0:05', text: 'Three accounts look at-risk: Meridian ($420K, sponsor left in May), Coastal ($310K, usage down 40%), and Brightline ($160K, invoice disputes). Combined exposure is $890K. Want a save plan for each?' },
            { who: 'user', text: 'Yes — start with Meridian.', when: '1d' },
            { who: 'Sage', when: '1d', dur: '0:08', memoryUsed: 2, run: { id: 'AR-8841', status: 'Completed', tokens: '12.4K', cost: '$0.14', steps: ['Pull stakeholder map from project context', 'Score sponsor candidates', 'Draft the save-plan outline'] },
              cmds: ['Draft the Coastal save plan', 'Open Meridian Holdings'],
              text: 'Drafting the Meridian save plan now. First step is re-establishing an exec sponsor; I\'ve pulled the stakeholder map from this project\'s earlier conversation and flagged two candidates.' },
          ] },
        { id: 'c2', title: 'Lapsed member win-back copy', summary: 'Sage · draft 2 of the win-back sequence', when: '2d',
          messages: [
            { who: 'user', text: 'Draft a win-back email for members lapsed under 90 days.' },
            { who: 'user', formPill: ['Segment: lapsed < 90 days', 'Tone: chapter voice', 'Touches: 3'] },
            { who: 'Sage', text: 'Here\'s draft 2, from the chapter voice (per this project\'s memory). Subject: "We held your spot." Three-touch sequence, first email leads with the member-only renewal rate.' },
          ] },
        { id: 'c3', title: 'Renewal email sequence review', summary: 'Skip · "sequence timing looks right, CTA needs work"', when: '4d', testRun: true,
          messages: [
            { who: 'user', text: 'Review the renewal email sequence timing.', files: ['renewal-sequence.docx'] },
            { who: 'Skip', text: 'Sequence timing looks right — 30/14/3 days out matches renewal-curve best practice. The CTA needs work: "Renew today" underperforms "Keep my benefits" in association A/B data.' },
          ] },
        { id: 'c4', title: 'Renewal dashboard spec', summary: 'Skip · component spec for the lapse-risk dashboard', when: '5d',
          messages: [
            { who: 'user', text: 'Spec out the renewal dashboard.' },
            { who: 'Skip', text: 'Spec drafted: lapse-risk score by cohort, renewal-rate trend, and an at-risk accounts table. Saved to this project\'s artifacts as v1.', artifactId: 'a2' },
          ] },
      ],
      artifacts: [
        { id: 'a1', title: 'Renewal Email Sequence', icon: 'fa-regular fa-file-lines', kind: 'Document', collections: ['Templates'],
          versions: [
            { v: 1, when: '6d ago', by: 'Sage', note: 'First draft, national voice' },
            { v: 2, when: '4d ago', by: 'Sage', note: 'Rewritten in chapter voice per project memory' },
            { v: 3, when: '2d ago', by: 'You', note: 'Tightened subject lines, added PS line' },
          ] },
        { id: 'a2', title: 'Lapse Risk Dashboard', icon: 'fa-solid fa-chart-column', kind: 'Component', collections: ['Board pack'],
          versions: [ { v: 1, when: '4d ago', by: 'Skip', note: 'Initial dashboard build' } ] },
        { id: 'a3', title: 'Q3 Target Segments', icon: 'fa-solid fa-table', kind: 'Query',
          versions: [
            { v: 1, when: '6d ago', by: 'Sage', note: 'All lapsed members' },
            { v: 2, when: '5d ago', by: 'Sage', note: 'Split by lapse cohort' },
          ] },
      ],
      workflows: [
        { id: 'wf1', title: 'Draft win-back emails', meta: 'Sage · step 2 of 4 · started 20m ago', pct: 60, state: 'running' },
        { id: 'wf2', title: 'Build renewal dashboard', meta: 'Skip · failed at step 3 — data source timed out · 1d ago', state: 'failed' },
        { id: 'wf0', title: 'Segment lapsed members', meta: 'Research Agent · finished 2d ago · output: Q3 Target Segments', state: 'done' },
      ],
    },
    {
      id: 'website', name: 'Website Refresh', icon: 'fa-globe', color: '#F6AD55',
      desc: 'New public site — IA, copy, and the launch checklist.',
      members: [ { init: 'AM', color: 'var(--mj-brand-primary)', name: 'Alex Morgan', role: 'Owner' } ],
      memory: [
        { id: 'w1', text: 'Voice: plain language, no association jargon on public pages.', scope: 'All agents', status: 'active', src: 'Sage · About page rewrite', when: '1w ago' },
        { id: 'w2', text: 'Launch target is the September board meeting.', scope: 'All agents', status: 'active', src: 'Alex · added manually', when: '2w ago' },
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
    { id: 'pin1', title: 'Weekly KPI check-in', when: '2h', summary: '', sharedBy: 'Dana Kim', messages: [
      { who: 'user', text: 'Run the weekly KPI check-in.' },
      { who: 'Sage', text: 'Membership up 1.2% WoW, renewals pacing at 94% of target, event registrations flat. Full digest attached. (Pinning is display-only — a pinned conversation keeps whatever project it lives in.)' },
    ] },
  ],
};

const FIRSTRUN = {
  projects: [], ungrouped: [], pinned: [],
  temporary: { id: 'tmp', title: 'Temporary chat', messages: [] },
};
ESTABLISHED.archived = [];
FIRSTRUN.archived = [];
/* W2 seed slice — the second tree (curated, cross-project); new 2026-07-22 */
ESTABLISHED.collections = [
  { id: 'boardpack', name: 'Board pack', parent: null, shared: 'Board role', items: [
    { id: 'ci1', title: 'Lapse Risk Dashboard', kind: 'Component', ph: '[ dashboard ]', pin: 'v3', fromProj: 'renewal', artId: 'a2', srcConv: 'c4', when: '2h' },
    { id: 'ci2', title: 'Membership trend, 5-yr', kind: 'Chart', ph: '[ chart ]', pin: 'v7', follows: true, from: 'Board', when: '1d' },
    { id: 'ci3', title: 'CE credit report', kind: 'Document', ph: '[ report ]', pin: 'v2', from: 'Board', when: '2d' },
    { id: 'ci4', title: 'Gala sponsorship one-pager', kind: 'Document', ph: '[ one-pager ]', pin: 'v5', from: 'Gala', when: '4d' },
  ] },
  { id: 'q3board', name: 'Q3 board meeting', parent: 'boardpack', items: [
    { id: 'ci5', title: 'Q3 metrics deck', kind: 'Document', ph: '[ deck ]', pin: 'v1', from: 'Board', when: '1d' },
    { id: 'ci6', title: 'Renewal exposure summary', kind: 'Document', ph: '[ summary ]', pin: 'v2', fromProj: 'renewal', srcConv: 'c1', when: '3d' },
  ] },
  { id: 'q2archive', name: 'Q2 archive', parent: 'boardpack', items: [
    { id: 'ci7', title: 'Q2 minutes', kind: 'Document', ph: '[ minutes ]', pin: 'v1', from: 'Board', when: '3mo' },
  ] },
  { id: 'templates', name: 'Templates', parent: null, shared: 'org-wide', items: [
    { id: 'ci8', title: 'Renewal Email Sequence', kind: 'Document', ph: '[ email sequence ]', pin: 'v3', fromProj: 'renewal', artId: 'a1', srcConv: 'c2', when: '2d' },
    { id: 'ci9', title: 'Board memo template', kind: 'Document', ph: '[ memo ]', pin: 'v4', from: 'Board', when: '2w' },
  ] },
];
/* W3 seed — personal standing orders (harvest of the 07-02 prototype's model) */
ESTABLISHED.routines = [
  { id: 'r1', name: 'Weekly membership digest', kind: 'Scheduled', schedule: 'Mondays 6:00 AM', agent: 'Sage', notify: 'In-app + email', last: 'today · healthy', next: 'Mon', paused: false,
    history: [{ when: 'today 6:00 AM', note: '247 lapsed · +18 joins · opened a conversation with the full digest', link: 'Open conversation' }, { when: 'last Mon', note: 'All healthy · no changes flagged', link: 'Open run' }] },
  { id: 'r2', name: 'Lapsed-member watch', kind: 'Monitoring', schedule: 'Daily 7:00 AM', agent: 'Sage', notify: 'Only when numbers change', last: 'today · quiet', next: '7:00 AM', paused: false,
    history: [{ when: 'today 7:00 AM', note: 'No change · no notification sent', link: 'Open run' }] },
  { id: 'r3', name: 'Event registration pulse', kind: 'Scheduled', schedule: 'Fridays 8:00 AM', agent: 'Skip', notify: 'In-app', last: 'Fri · healthy', next: 'Fri', paused: false,
    history: [{ when: 'Fri 8:00 AM', note: 'Gala + summit numbers steady', link: 'Open run' }] },
  { id: 'r4', name: 'Board minutes summarizer', kind: 'Scheduled', schedule: 'Monthly · after board meetings', agent: 'Sage', notify: 'In-app', last: 'June 12', next: 'paused', paused: true, history: [] },
];
FIRSTRUN.collections = [];
FIRSTRUN.routines = [];

function buildStressData() {
  const d = structuredClone(ESTABLISHED);
  const renewal = d.projects[0];
  const extraMembers = [
    ['JW', '#D97706', 'Jordan Wells', 'Editor'], ['PT', '#DB2777', 'Priya Tan', 'Editor'],
    ['MB', '#0891B2', 'Marcus Bell', 'Viewer'], ['SO', '#65A30D', 'Sam Okafor', 'Viewer'], ['LC', '#9333EA', 'Lena Cruz', 'Viewer'],
  ];
  for (const [init, color, name, role] of extraMembers) renewal.members.push({ init, color, name, role });
  for (let i = 0; i < 24; i++) renewal.memory.push({
    id: 'sm' + i, status: 'active', src: 'Sage · stress sweep', when: `${(i % 9) + 1}d ago`,
    text: `Stress note ${i + 1} — a realistic-length memory sentence about renewal mechanics, cohort rules, or tone that the list must absorb gracefully.`,
    scope: ['All agents', 'Sage', 'All agents · global'][i % 3],
  });
  for (let i = 0; i < 7; i++) renewal.conversations.push({
    id: 'sc' + i, title: `A deliberately long conversation title about renewal segment ${i + 1} that will need to truncate`,
    summary: 'Sage · a summary line that is also long enough to exercise the ellipsis behavior in narrow layouts', when: `${i + 2}d`,
    messages: [{ who: 'user', text: 'Stress conversation.' }, { who: 'Sage', text: 'Stress reply.' }],
  });
  const icons = ['fa-folder', 'fa-bullhorn', 'fa-calendar-days', 'fa-chart-line', 'fa-globe'];
  // WP4 heavy-state truthfulness: long thread + deep version history
  const long = renewal.conversations[0];
  for (let i = 0; i < 8; i++) long.messages.push(
    { who: 'user', text: `Follow-up ${i + 1}: how does the ${['Meridian', 'Coastal', 'Brightline'][i % 3]} plan change if the sponsor meeting slips two weeks and the board asks for a revised exposure number before the next cycle?`, when: `${8 - i}h` },
    { who: 'Sage', when: `${8 - i}h`, dur: `0:0${(i % 7) + 2}`, memoryUsed: (i % 3) + 1, text: `Revised plan ${i + 1}: exposure re-baselined, sponsor path adjusted, and the win-back sequencing shifts one cycle. The dashboard reflects the new lapse-risk weighting; two accounts move between cohorts as a result.` });
  for (let i = 0; i < 9; i++) renewal.artifacts[0].versions.push({ v: renewal.artifacts[0].versions.length + 1, when: `${9 - i}d ago`, by: i % 2 ? 'Sage' : 'You', note: `Stress revision ${i + 1} — subject-line and sequencing tweaks` });
  const colors = ['#B794F6', '#68D391', '#F6AD55', '#FC8181', '#5CC0ED'];
  for (let i = 0; i < 10; i++) d.projects.push({
    id: 'sp' + i, name: `${i + 1} — Committee Initiative With An Unreasonably Long Name ${'X'.repeat(i)}`,
    icon: icons[i % icons.length], color: colors[i % colors.length],
    desc: '', members: [{ init: 'AM', color: 'var(--mj-brand-primary)', name: 'Alex Morgan', role: 'Owner' }],
    memory: [], conversations: [], artifacts: [], workflows: [],
  });
  for (let i = 0; i < 8; i++) d.collections.push({ id: 'scol' + i, name: `${i + 1} — Committee library with an unreasonably long name`, parent: null, items: [] });
  for (let i = 0; i < 5; i++) d.routines.push({ id: 'sr' + i, name: `Stress routine ${i + 1} — a long-winded standing order name`, kind: i % 2 ? 'Monitoring' : 'Scheduled', schedule: 'Daily 7:00 AM', agent: 'Sage', notify: 'In-app', last: 'today', next: '7:00 AM', paused: i % 3 === 0, history: [] });
  return d;
}

let persona = 'established';
let DATA = structuredClone(ESTABLISHED);

function setPersona(name) {
  persona = name;
  DATA = name === 'stress' ? buildStressData() : structuredClone(name === 'firstrun' ? FIRSTRUN : ESTABLISHED);
  Object.assign(state, {
    view: 'frontdoor', projectId: DATA.projects[0] ? DATA.projects[0].id : null, tab: 'overview',
    convId: null, artifactId: null, companion: false, planArmed: false, moveConvPending: null, editingArtifact: false,
    viewAs: { name: 'You', role: 'Owner' }, settingsOpen: false, showProjects: true, fdState: null,
    chatsFilter: '', chatsSelect: false, projFilter: '', projSeg: 'active', moveSrcId: null, renameId: null,
    roomFilter: '', roomSort: 'recent', memFilter: '', memSeg: 'all', artFilter: '', artView: 'grid',
    studioId: null, viewerTab: 'Display', railKeep: false,
    inspectId: null, editMsg: null, rateMsg: null, ratingConsented: false, jumpTo: null,
    collId: null, collFilter: '', collSelect: false, shelf: [], renameCollId: null, routSeg: 'all', routineId: null,
  });
  state.collSel = new Set();
  state.chatsSel = new Set();
  state.openProjects = new Set(DATA.projects[0] ? [DATA.projects[0].id] : []);
  composer.drafts = {};
  closeModals();
  render();
  toast(name === 'firstrun' ? 'Brand-new user — nothing exists yet' : name === 'stress' ? 'Stress data — long names, 8 members, 28 notes, 12 projects' : 'Established user — full seed data');
}

/* ---------- State ---------- */
const state = {
  view: 'frontdoor',      // WP1: 'frontdoor' | 'room' | 'chat' | 'newchat' | 'artifact' | 'chats' | 'projects' | 'collections' | 'routines' (+ settingsOpen overlay, S1)
  projectId: 'renewal',
  tab: 'overview',
  convId: null,
  artifactId: null,       // artifact page
  artifactVersion: null,  // selected version on artifact page
  companion: false,       // companion rail open (project chats only)
  railMode: 'context',    // companion: 'context' | 'artifact'
  railArtifactId: null,
  planArmed: false,       // legacy — plan state now lives on the per-conversation draft
  viewAs: { name: 'You', role: 'Owner' },   // recipient-side preview (D batch)
  moveConvPending: null,  // conversation waiting for "Move → New project…"
  sideFilter: '',         // sidebar live filter (baseline parity)
  canPublish: true,       // demo: "Can Publish Artifacts Publicly" privilege (D11)
  editingArtifact: false,
  openProjects: new Set(['renewal']),
  showProjects: true,     // D-S7 — Settings opt-OUT, default ON
  settingsOpen: false,    // S1 slide-in — over the current surface, never a route (D-S8)
  density: 'comfortable',
  appearance: 'system',
  defaultAgent: 'Sage',
  fdState: null,          // Front Door simulated 'loading' | 'error' (state-map states)
  chatsFilter: '',        // W0a live filter
  chatsGroup: 'project',  // W0a: 'project' | 'flat'
  chatsSelect: false,     // W0a select mode
  chatsSel: new Set(),
  projFilter: '',         // W0b search
  projSeg: 'active',      // W0b: 'active' | 'archived' (archived filter = FUTURE-tagged, built)
  moveSrcId: null,        // move-modal source when opened from a row menu
  renameId: null,         // rename-modal source when opened from a row menu
  roomFilter: '',         // P2 filter
  roomSort: 'recent',     // P2: 'recent' | 'az'
  memFilter: '',          // P3 search
  memSeg: 'all',          // P3: 'all' | 'project' | 'org'
  artFilter: '',          // P4 search
  artView: 'grid',        // P4: 'grid' | 'list'
  studioId: null,         // T3 Studio Split — artifact open beside the thread (D-S3)
  viewerTab: 'Display',   // ⚖3 resolved: shipped 7-tab viewer facsimile
  railKeep: false,        // T2 — "Keep open" override on the run-driven rail
  inspectId: null,        // WP4 — open run-inspector message index
  editMsg: null,          // WP4 — user message being inline-edited
  rateMsg: null,          // WP4 — message being rated
  ratingConsented: false, // WP4 — one-time reviewer-access consent
  jumpTo: null,           // WP4 — pinned-panel jump target
  collId: null,           // W2 — open collection (null = root)
  collView: 'grid',
  collSort: 'recent',
  collFilter: '',
  collSelect: false,
  collSel: new Set(),
  shelf: [],              // W2 staging shelf
  renameCollId: null,
  routSeg: 'all',         // W3: 'all' | 'scheduled' | 'monitoring'
  routineId: null,        // W3 detail view
  paperOpen: null,        // in-artifact deliverables panel: 'changelog' | 'manifest' | 'placement'
};

/* ---------- Composer data + state ---------- */
const AGENTS = [
  { name: 'Sage', icon: 'fa-robot', color: 'var(--mj-brand-primary)', desc: 'General copilot — plan mode + skills' },
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

const composer = { mode: 'Standard', voice: false, drafts: {}, fileIdx: 0 };
const pmSel = { icon: 'fa-folder', color: '', editing: null };
const draftAgent = () => AGENTS.find((a) => a.name === draft().agent) || AGENTS[0];
let popCtx = null; // open mention popover: { items }

function draftKey() { return state.view === 'frontdoor' ? 'frontdoor' : `${state.view}:${state.convId || state.projectId || 'fr'}`; }
function draft() { const k = draftKey(); return composer.drafts[k] || (composer.drafts[k] = { text: '', chips: [], agent: state.defaultAgent || AGENTS[0].name, planArmed: false }); }

/* ---------- Helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const project = (id) => DATA.projects.find((p) => p.id === id);
const artifact = (p, id) => p && p.artifacts.find((a) => a.id === id);
const isGrown = (p) => p.artifacts.length > 0 || p.workflows.length > 0 || p.members.length > 1;

/* View-as: preview the project as another member (recipient side of sharing) */
const canEdit = () => state.viewAs.role !== 'Viewer';
const canManage = () => state.viewAs.role === 'Owner';
function viewAsStrip() {
  if (state.viewAs.role === 'Owner') return '';
  return `<div class="viewas-strip"><i class="fa-solid fa-eye"></i>
    Previewing as <strong>&nbsp;${esc(state.viewAs.name)}&nbsp;</strong> · ${state.viewAs.role}
    <span class="back" data-act="view-owner">Back to you</span></div>`;
}

function findConv(id) {
  if (id === 'tmp') return { conv: DATA.temporary, proj: null, temporary: true };
  for (const p of DATA.projects) { const c = p.conversations.find((c) => c.id === id); if (c) return { conv: c, proj: p }; }
  const u = DATA.ungrouped.find((c) => c.id === id); if (u) return { conv: u, proj: null };
  const pin = DATA.pinned.find((c) => c.id === id); return pin ? { conv: pin, proj: null } : null;
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  if (action) {
    const a = document.createElement('span');
    a.className = 'toast-action'; a.textContent = action.label;
    a.addEventListener('click', () => { el.remove(); action.fn(); });
    el.appendChild(a);
  }
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), action ? 8000 : 3000);
}

/* ---------- Sidebar — v4 two-path shape (WP1): top-level nav + Pinned/Recents.
   The full project tree moved OUT (its homes are W0a Chats + W0b Projects);
   filter and fresh-dot mechanics carry over here. Sidebar DnD re-homes on the
   Chats surface in session 2 — conscious interim, on record in the changelog. */
function sideMatch(c) {
  const q = state.sideFilter.trim().toLowerCase();
  if (!q) return true;
  return c.title.toLowerCase().includes(q) || (c.summary || '').toLowerCase().includes(q);
}

function parseWhen(w) {
  if (!w) return 0;
  const m = String(w).match(/(\d+)\s*([hdwm])/i);
  if (!m) return 0;
  return +m[1] * ({ h: 1, d: 24, w: 168, m: 720 })[m[2].toLowerCase()];
}

function allConvs() {
  const out = [];
  for (const p of DATA.projects) for (const c of p.conversations) out.push({ c, p });
  for (const c of DATA.ungrouped) out.push({ c, p: null });
  return out.sort((a, b) => parseWhen(a.c.when) - parseWhen(b.c.when));
}

function sideRow2(c, proj) {
  const active = state.view === 'chat' && state.convId === c.id;
  const dot = !state.showProjects ? '' : proj
    ? `<span class="pdot" style="background:${proj.color}" title="${esc(proj.name)}"></span>`
    : '<span class="pdot hollow" title="Ungrouped"></span>';
  return `<div class="s-row2 ${active ? 'on' : ''}" data-act="open-conv" data-id="${c.id}">
    <span class="tt">${dot}<span class="t">${esc(c.title)}</span>${c.fresh ? '<span class="udot" title="New since you last looked"></span>' : ''}</span></div>`;
}

function renderSidebar() {
  const navIt = (id, icon, label) => `<div class="side-nav-it ${state.view === id ? 'on' : ''}" data-act="nav" data-id="${id}" role="button" tabindex="0"><i class="fa-solid ${icon}"></i>${label}</div>`;
  const teach = state.showProjects && !DATA.projects.length
    ? '<div class="side-teach">Group related chats, memory, and deliverables · <span data-act="new-project">Create your first project</span></div>' : '';
  $('#sideNav').innerHTML =
    navIt('chats', 'fa-comments', 'Chats') +
    (state.showProjects ? navIt('projects', 'fa-folder', 'Projects') + teach : '') +
    navIt('collections', 'fa-layer-group', 'Collections') +
    navIt('routines', 'fa-clock-rotate-left', 'Routines');

  const t = [];
  const pinned = DATA.pinned.filter(sideMatch);
  if (pinned.length) {
    t.push('<div class="s-lbl">Pinned</div>');
    for (const c of pinned) t.push(sideRow2(c, null));
  }
  const recents = allConvs().filter(({ c }) => sideMatch(c)).slice(0, 10);
  if (recents.length) {
    t.push('<div class="s-lbl">Recents</div>');
    for (const { c, p } of recents) t.push(sideRow2(c, p));
  }
  if (DATA.temporary.messages.length || (state.view === 'chat' && state.convId === 'tmp'))
    t.push(`<div class="s-row2 ${state.convId === 'tmp' ? 'on' : ''}" data-act="open-conv" data-id="tmp"><span class="tt"><i class="fa-solid fa-ghost ghost-ic"></i><span class="t" style="font-style:italic">Temporary chat</span></span></div>`);
  if (state.sideFilter.trim() && !pinned.length && !recents.length)
    t.push(`<div class="s-empty">Nothing matches "${esc(state.sideFilter.trim())}".</div>`);
  $('#sideTree').innerHTML = t.join('');
}

/* ---------- Project Room (D-S4) — v4 alignment: header strip + FOUR tabs
   (Overview · Conversations · Memory · Artifacts). P5 ratified 2026-07-22:
   Runs is an Overview section, never a tab; members live in the header
   avatars → share modal. "Artifacts", never "Outputs". ---------- */
function roomAvatars(p) {
  if (!isGrown(p) || p.members.length <= 1) return '';
  const shown = p.members.slice(0, 3);
  const extra = p.members.length - shown.length;
  const act = canManage() ? 'data-act="share" title="Members — roles &amp; sharing" style="cursor:pointer"' : '';
  return `<span class="avstack" ${act}>${shown.map((m) => `<span class="avatar" style="background:${m.color}" title="${esc(m.name)} · ${m.role}">${m.init}</span>`).join('')}${extra > 0 ? `<span class="avatar more">+${extra}</span>` : ''}</span>`;
}

function roomHeader(p) {
  return `<header class="room-head">
    <div class="room-title">
      <span class="room-mark" style="background:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
      <div style="flex:1;min-width:0">
        <h2 id="hubTitle">${esc(p.name)}</h2>
        ${p.desc
          ? `<div class="d" id="hubDesc">${esc(p.desc)}</div>`
          : `<div class="d add-desc" id="hubDesc" data-act="proj-desc-add" title="Agents read the description">+ Add description</div>`}
      </div>
      ${roomAvatars(p)}
      ${canManage() ? '<button class="btn secondary sm" data-act="share"><i class="fa-solid fa-user-plus"></i> Share</button>' : ''}
      ${canEdit() ? '<button class="btn sm" data-act="new-chat"><i class="fa-solid fa-plus"></i> New chat</button>' : ''}
      ${canManage() ? '<button class="iconbtn" data-act="proj-menu" title="Project settings"><i class="fa-solid fa-ellipsis"></i></button>' : ''}
    </div>
    ${isGrown(p) ? `<nav class="k-tabs">${['overview', 'conversations', 'memory', 'artifacts'].map((t) =>
      `<span class="k-tab ${state.tab === t ? 'on' : ''}" data-act="tab" data-id="${t}">${t[0].toUpperCase() + t.slice(1)}</span>`).join('')}</nav>` : ''}
  </header>`;
}

const MEM_SCOPES = ['All agents', 'Sage', 'All agents · global'];

function panel(head, body, { link = null, brand = false } = {}) {
  const a = link ? `<span class="a" data-act="${link.act}" data-id="${link.id || ''}">${link.label}</span>` : '';
  return `<div class="k-panel ${brand ? 'brand' : ''}"><div class="k-panel__head"><span>${head}</span>${a}</div><div class="k-panel__body">${body}</div></div>`;
}
const feedItem = (icon, cls, text, meta = '') =>
  `<div class="k-feeditem"><i class="${icon} ${cls}"></i><span class="t">${text}</span>${meta ? `<span class="m">${meta}</span>` : ''}</div>`;

function memChips(m) {
  const agent = m.scope.startsWith('Sage') ? 'Sage' : 'All agents';
  const org = m.scope.includes('global');
  return `<span class="scope ag">${agent}</span><span class="scope ${org ? 'org' : ''}">${org ? 'org-wide' : 'project'}</span>`;
}

function roomOverview(p) {
  if (p.conversations.length === 0) {
    return `<div class="qh-empty" style="margin-top:56px">
      <p class="big">Start the first conversation</p>
      <p class="sub">Agents will know they're working inside ${esc(p.name)} — memory and artifacts collect here.</p>
      <div class="qh-empty-input"><input id="emptySend" placeholder="Ask anything in ${esc(p.name)}…">
        <button class="send" data-act="empty-send"><i class="fa-solid fa-arrow-up"></i></button></div>
    </div>`;
  }
  const left = [], right = [];
  const prov = p.memory.filter((m) => m.status === 'provisional');

  const syl = [];
  for (const a of p.artifacts.filter((a) => a.fresh)) { const l = a.versions[a.versions.length - 1];
    syl.push(feedItem('fa-regular fa-file-lines', 'brand', `<b>${esc(a.title)}</b> advanced to v${l.v}`, l.when)); }
  for (const c of p.conversations.filter((c) => c.fresh))
    syl.push(feedItem('fa-regular fa-comment', '', `<b>${esc(c.title)}</b>${c.summary ? ` — ${esc(c.summary)}` : ''}`, c.when || ''));
  if (prov.length) syl.push(feedItem('fa-solid fa-brain', 'warn', `${prov.length} new ${prov.length === 1 ? 'note' : 'notes'} captured since you left`));
  if (syl.length) left.push(panel('Since you left <span class="small-muted" style="font-weight:400">· last here 4 days ago</span>', syl.join('')));

  /* P5 Runs fold — ratified 2026-07-22 (D-S6 close-out): a section, not a tab */
  const runs = p.workflows.map((w) => w.state === 'running'
    ? feedItem('fa-solid fa-circle-notch spin', 'brand', `<b>${esc(w.title)}</b> — ${esc(w.meta)}`, 'now')
    : w.state === 'failed'
      ? feedItem('fa-solid fa-circle-xmark', 'err', `<b>${esc(w.title)}</b> — ${esc(w.meta)} · <span class="lnk" data-act="wf-retry" data-id="${w.id}" data-proj="${p.id}">Retry</span>`)
      : feedItem('fa-solid fa-circle-check', 'ok', `<b>${esc(w.title)}</b> · ${esc(w.meta)}`));
  if (runs.length) left.push(panel('Runs', runs.join(''), { link: { act: 'tab', id: 'runs', label: 'All runs →' } }));

  const convs = p.conversations.slice(0, 3).map((c, i) => {
    const running = i === 0 && p.workflows.some((w) => w.state === 'running');
    return `<div class="k-feeditem clickable" data-act="open-conv" data-id="${c.id}"><i class="${running ? 'fa-solid fa-circle-notch spin brand' : 'fa-regular fa-comment'}"></i><span class="t"><b>${esc(c.title)}</b>${c.summary ? ` — ${esc(c.summary)}` : ''}</span><span class="m">${c.when || ''}</span></div>`;
  });
  left.push(panel('Active conversations', convs.join(''), p.conversations.length > 3 ? { link: { act: 'tab', id: 'conversations', label: `All ${p.conversations.length}` } } : {}));

  const needs = [];
  for (const c of p.conversations)
    if (c.messages.some((m) => m.plan && m.plan.status === 'pending'))
      needs.push(feedItem('fa-solid fa-list-check', 'brand', `Plan awaiting approval — <b>${esc(c.title)}</b>`) +
        `<button class="btn sm pnl-btn" data-act="open-conv" data-id="${c.id}">Review plan</button>`);
  if (prov.length) needs.push(feedItem('fa-solid fa-brain', 'warn', `${prov.length} new ${prov.length === 1 ? 'note' : 'notes'} captured`) +
    `<button class="btn secondary sm pnl-btn" data-act="tab" data-id="memory">Review</button>`);
  for (const w of p.workflows.filter((w) => w.state === 'failed'))
    needs.push(feedItem('fa-solid fa-circle-xmark', 'err', `<b>${esc(w.title)}</b> — ${esc(w.meta)}`) +
      `<button class="btn secondary sm pnl-btn" data-act="wf-retry" data-id="${w.id}" data-proj="${p.id}">Retry</button>`);
  if (needs.length) right.push(panel('Needs you', needs.join(''), { brand: true }));

  if (p.memory.length) {
    const mems = [...prov, ...p.memory.filter((m) => m.status !== 'provisional')].slice(0, 3).map((m) =>
      `<div class="k-memrow"><i class="fa-solid ${m.scope.includes('global') ? 'fa-globe' : 'fa-note-sticky'}"></i><span class="t">${m.status === 'provisional' ? '<span class="prov-dot" title="Provisional — review in Memory"></span>' : ''}${esc(m.text)}</span>${memChips(m)}</div>`);
    right.push(panel('Project memory', mems.join(''), { link: { act: 'tab', id: 'memory', label: 'Manage' } }));
  }

  if (p.artifacts.length) {
    const arts = p.artifacts.slice(0, 3).map((a) => { const l = a.versions[a.versions.length - 1];
      return `<div class="k-rmini" data-act="open-artifact" data-id="${a.id}"><span class="ic"><i class="${a.icon}"></i></span><span class="t"><span class="n">${esc(a.title)}</span><span class="d">v${l.v}${a.collections && a.collections.length ? ` · also in “${esc(a.collections[0])}”` : ''}</span></span></div>`; });
    right.push(panel('Artifacts', arts.join(''), { link: { act: 'tab', id: 'artifacts', label: `All ${p.artifacts.length}` } }));
  }

  if (!isGrown(p))
    right.push(`<p class="qh-foot" style="margin-top:0"><i class="fa-solid fa-seedling"></i>As this project grows — files, teammates, running work — panels appear here. Nothing renders empty.</p>`);
  return `<div class="k-room-grid"><div class="col">${left.join('')}</div><div class="col">${right.join('')}</div></div>`;
}

function roomConversations(p) {
  const q = (state.roomFilter || '').trim().toLowerCase();
  let rows = p.conversations.filter((c) => !q || c.title.toLowerCase().includes(q) || (c.summary || '').toLowerCase().includes(q));
  rows = state.roomSort === 'az' ? [...rows].sort((a, b) => a.title.localeCompare(b.title)) : [...rows].sort((a, b) => parseWhen(a.when) - parseWhen(b.when));
  const toolbar = `<div class="room-toolbar">
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="roomFilter" placeholder="Filter titles &amp; descriptions…" value="${esc(state.roomFilter || '')}" autocomplete="off"></span>
    <span class="seg"><span class="${state.roomSort !== 'az' ? 'on' : ''}" data-act="room-sort" data-id="recent">Recent</span><span class="${state.roomSort === 'az' ? 'on' : ''}" data-act="room-sort" data-id="az">A–Z</span></span>
    <span class="grow"></span>
    ${canEdit() ? '<button class="btn sm" data-act="new-chat"><i class="fa-solid fa-plus"></i> New chat</button>' : ''}</div>`;
  const body = rows.length ? `<div class="surf-list">${rows.map((c) => chatRow(c, p)).join('')}</div>`
    : `<p class="surf-note" style="text-align:center;margin-top:40px">${q ? `Nothing matches "${esc(state.roomFilter.trim())}".` : 'No conversations yet.'}</p>`;
  return toolbar + body;
}

function roomMemory(p) {
  const q = (state.memFilter || '').trim().toLowerCase();
  const segF = (m) => state.memSeg === 'project' ? !m.scope.includes('global') : state.memSeg === 'org' ? m.scope.includes('global') : true;
  const rows = p.memory.filter((m) => segF(m) && (!q || m.text.toLowerCase().includes(q)));
  const toolbar = `<div class="room-toolbar">
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="memFilter" placeholder="Search notes…" value="${esc(state.memFilter || '')}" autocomplete="off"></span>
    <span class="seg">${[['all', 'All'], ['project', 'This project'], ['org', 'Org-wide']].map(([id, l]) => `<span class="${state.memSeg === id ? 'on' : ''}" data-act="mem-seg" data-id="${id}">${l}</span>`).join('')}</span>
    <span class="grow"></span>
    ${canEdit() ? '<button class="btn secondary sm" data-act="mem-add"><i class="fa-solid fa-plus"></i> Add note</button>' : ''}</div>`;
  const tr = (m) => {
    const ops = m.status === 'provisional'
      ? `<span class="keep-ops"><span data-act="mem-keep" data-id="${m.id}">Keep</span><span class="dim" data-act="mem-forget" data-id="${m.id}">Forget</span></span>`
      : canEdit()
        ? `<span class="row-ops"><button class="iconbtn" data-act="mem-edit" data-id="${m.id}" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="iconbtn" data-act="mem-forget" data-id="${m.id}" title="${m.scope.includes('global') ? 'Forgetting an org-wide note warns about blast radius' : 'Forget'}"><i class="fa-regular fa-trash-can"></i></button></span>` : '';
    const scope = canEdit() && m.status !== 'provisional'
      ? `<select class="f-select" data-mem-scope="${m.id}" title="Who reads this note">${MEM_SCOPES.map((s) => `<option ${s === m.scope ? 'selected' : ''}>${s}</option>`).join('')}</select>`
      : memChips(m);
    return `<tr class="${m.status === 'provisional' ? 'prov' : ''}"><td data-mem="${m.id}">${m.status === 'provisional' ? '<span class="prov-dot"></span>' : ''}${esc(m.text)}</td><td>${scope}</td><td>${esc(m.src || '—')}</td><td>${esc(m.when || '—')}</td><td class="ops-cell">${ops}</td></tr>`;
  };
  const table = rows.length
    ? `<div class="mem-table"><table><tr><th>Note</th><th>Scope</th><th>Source</th><th>Captured</th><th></th></tr>${rows.map(tr).join('')}</table></div>`
    : `<p class="surf-note" style="text-align:center;margin-top:40px">${q ? `Nothing matches "${esc(state.memFilter.trim())}".` : 'Nothing yet — notes are learned in conversation or added here.'}</p>`;
  return toolbar + table + `<p class="surf-note" style="max-width:900px">Scope controls which agents read a note; project notes never leak outside ${esc(p.name)}. Org-wide notes are read everywhere — forgetting one warns about its blast radius.</p>`;
}

const KIND_PH = { Document: '[ document preview ]', Component: '[ dashboard preview ]', Query: '[ table preview ]', Chart: '[ chart preview ]' };
function roomArtifacts(p) {
  const q = (state.artFilter || '').trim().toLowerCase();
  const arts = p.artifacts.filter((a) => !q || a.title.toLowerCase().includes(q));
  const toolbar = `<div class="room-toolbar" style="max-width:980px">
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="artFilter" placeholder="Search artifacts…" value="${esc(state.artFilter || '')}" autocomplete="off"></span>
    <span class="seg"><span class="${state.artView !== 'list' ? 'on' : ''}" data-act="art-view" data-id="grid">Grid</span><span class="${state.artView === 'list' ? 'on' : ''}" data-act="art-view" data-id="list">List</span></span>
    <span class="grow"></span></div>`;
  if (!arts.length) return toolbar + `<p class="surf-note" style="text-align:center;margin-top:40px">${q ? `Nothing matches "${esc(state.artFilter.trim())}".` : 'No artifacts yet — deliverables land here as agents produce them.'}</p>`;
  const card = (a) => { const l = a.versions[a.versions.length - 1];
    const colls = (a.collections || []).map((c) => `<span class="mchip"><i class="fa-solid fa-layer-group"></i> ${esc(c)}</span>`).join('');
    return `<div class="out-card" data-act="open-artifact" data-id="${a.id}">
      <div class="oc-prev">${KIND_PH[a.kind] || '[ preview ]'}</div>
      <div class="oc-body"><div class="n">${esc(a.title)}${a.fresh ? '<span class="udot"></span>' : ''}</div><div class="d">${a.kind} · v${l.v} · ${esc(l.by)}, ${l.when}</div>
      <div class="oc-foot" style="margin-top:9px"><span class="mchip">v${l.v}</span>${colls}</div></div></div>`; };
  const rowa = (a) => { const l = a.versions[a.versions.length - 1];
    return `<div class="surf-item" data-act="open-artifact" data-id="${a.id}"><span class="si-ic"><i class="${a.icon}"></i></span>
      <span class="si-t"><span class="n"><span class="txt">${esc(a.title)}</span>${a.fresh ? '<span class="udot"></span>' : ''}</span><span class="d">${a.kind} · v${l.v} · ${esc(l.by)} · ${esc(l.note)}</span></span>
      <span class="si-m">${l.when}</span></div>`; };
  return toolbar + (state.artView === 'list'
    ? `<div class="surf-list">${arts.map(rowa).join('')}</div>`
    : `<div class="out-grid art-grid" style="max-width:980px">${arts.map(card).join('')}</div>`);
}

function roomRuns(p) {
  const groups = [
    { label: 'Running', items: p.workflows.filter((w) => w.state === 'running') },
    { label: 'Needs attention', items: p.workflows.filter((w) => w.state === 'failed') },
    { label: 'Completed', items: p.workflows.filter((w) => w.state === 'done') },
  ].filter((g) => g.items.length);
  const body = groups.map((g) => `<div class="grp-lbl">${g.label}</div><div class="surf-list">${g.items.map((w) =>
    `<div class="surf-item" style="cursor:default"><span class="si-ic"><i class="${w.state === 'running' ? 'fa-solid fa-circle-notch spin brand' : w.state === 'failed' ? 'fa-solid fa-circle-xmark err' : 'fa-solid fa-circle-check ok'}"></i></span>
     <span class="si-t"><span class="n"><span class="txt">${esc(w.title)}</span></span><span class="d">${esc(w.meta)}</span></span>
     ${w.state === 'running' ? `<span class="bar-mini"><span style="width:${w.pct}%"></span></span>` : ''}
     ${w.state === 'failed' ? `<span class="sb-link" data-act="wf-retry" data-id="${w.id}" data-proj="${p.id}">Retry</span>` : ''}</div>`).join('')}</div>`).join('');
  return `<div class="room-toolbar"><span class="sb-link" data-act="tab" data-id="overview"><i class="fa-solid fa-arrow-left"></i> Overview</span></div>` +
    (body || '<p class="surf-note" style="text-align:center;margin-top:40px">No runs in this project yet.</p>') +
    '<p class="surf-note" style="max-width:900px">Completed runs file their results to Artifacts. Failed ones wait here — nothing retries silently.</p>';
}

function roomTabBody(p) {
  const back = !isGrown(p) && state.tab !== 'overview' && state.tab !== 'runs'
    ? `<div class="room-toolbar"><span class="sb-link" data-act="tab" data-id="overview"><i class="fa-solid fa-arrow-left"></i> Overview</span></div>` : '';
  switch (state.tab) {
    case 'conversations': return back + roomConversations(p);
    case 'memory': return back + roomMemory(p);
    case 'artifacts': return back + roomArtifacts(p);
    case 'runs': return roomRuns(p);
    default: return roomOverview(p);
  }
}

function renderHub() {
  const p = project(state.projectId);
  if (!p) {
    if (!DATA.projects.length) { state.view = 'frontdoor'; return renderFrontDoor(); }
    state.projectId = DATA.projects[0].id;
    return renderHub();
  }
  if (!['overview', 'conversations', 'memory', 'artifacts', 'runs'].includes(state.tab)) state.tab = 'overview';
  $('#main').innerHTML = `${viewAsStrip()}<div class="room">${roomHeader(p)}<div class="room-body">${roomTabBody(p)}</div></div>`;
  const empty = $('#emptySend'); if (empty) empty.focus();
}

/* ============================================================================
   WP1/WP2 — Front Door (F1 canonical · F0 first run · F0x opt-out; D-S2/D-S7),
   thin cuts of the workspace surfaces (W0a/W0b full passes in sessions 2 & 4),
   and the S1 Settings slide-in (D-S8).
   ============================================================================ */
const STARTERS = [
  { text: 'Which members are at risk of lapsing this quarter?', sub: 'Sage reads your membership and engagement data' },
  { text: 'Summarize last week\'s event registrations', sub: 'Trends, totals, and anything unusual' },
  { text: 'Draft a renewal reminder email in our voice', sub: 'You can save the result and reuse it' },
];

const fdGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function fdNeedsYou() {
  const items = [];
  for (const { c } of allConvs())
    if (c.messages.some((m) => m.plan && m.plan.status === 'pending'))
      items.push(`<div class="fd-need"><i class="lead fa-solid fa-list-check"></i>
        <span class="t">Plan awaiting approval — <b>${esc(c.title)}</b></span>
        <button class="btn sm" data-act="open-conv" data-id="${c.id}">Review plan</button></div>`);
  for (const p of DATA.projects) {
    for (const w of p.workflows.filter((w) => w.state === 'failed'))
      items.push(`<div class="fd-need"><i class="lead err fa-solid fa-circle-exclamation"></i>
        <span class="t">Run failed — <b>${esc(w.title)}</b> · ${esc(p.name)}</span>
        <button class="btn secondary sm" data-act="wf-retry" data-id="${w.id}" data-proj="${p.id}">Retry</button></div>`);
    const prov = p.memory.filter((m) => m.status === 'provisional').length;
    if (prov) items.push(`<div class="fd-need"><i class="lead warn fa-solid fa-brain"></i>
      <span class="t">${prov} new ${prov === 1 ? 'note' : 'notes'} captured in <b>${esc(p.name)}</b></span>
      <button class="btn secondary sm" data-act="fd-review-notes" data-id="${p.id}">Review</button></div>`);
  }
  return items;
}

function fdCard({ c, p }) {
  const scope = !state.showProjects ? '' : p
    ? `<span class="pdot" style="background:${p.color}"></span>${esc(p.name)} ·`
    : '<span class="pdot hollow"></span>Ungrouped ·';
  return `<div class="fd-card" data-act="open-conv" data-id="${c.id}">
    <div class="top">${scope} ${c.when || 'now'}${c.fresh ? '<span class="udot" title="New since you last looked"></span>' : ''}</div>
    <div class="n">${esc(c.title)}</div>
    ${c.summary ? `<div class="d">${esc(c.summary)}</div>` : ''}</div>`;
}

function fdRan() {
  const items = [];
  for (const r of (DATA.routines || []).filter((r) => !r.paused && r.history.length)) {
    const h = r.history[0];
    items.push(`<div class="fd-need"><i class="lead ok fa-solid fa-clock-rotate-left"></i>
      <span class="t"><b>${esc(r.name)}</b> ran ${esc(h.when)} <span class="w">· ${esc(h.note)}</span></span>
      <span class="fd-open" data-act="nav" data-id="routines">Open result</span></div>`);
  }
  for (const p of DATA.projects)
    for (const w of p.workflows.filter((w) => w.state === 'done'))
      items.push(`<div class="fd-need"><i class="lead ok fa-solid fa-circle-check"></i>
        <span class="t"><b>${esc(w.title)}</b> <span class="w">· ${esc(w.meta)}</span></span>
        <span class="fd-open" data-act="open-hub" data-id="${p.id}">Open project</span></div>`);
  return items.slice(0, 3);
}

function fdSect(label, action, body) {
  const a = action ? `<span class="a" data-act="${action.act}" data-id="${action.id || ''}">${action.label}</span>` : '';
  return `<div class="qh-sect"><div class="qh-label"><span class="l">${label}</span>${a}</div>${body}</div>`;
}

function renderFrontDoor() {
  if (state.fdState === 'loading') {
    $('#main').innerHTML = `<div class="qh-page fd"><h3 class="fd-title">${fdGreeting()}, Alex</h3>
      <p class="fd-sub">Loading your workspace…</p>
      <div class="fd-skel" style="width:100%;height:78px;border-radius:10px"></div>
      <div class="fd-skel" style="width:62%"></div><div class="fd-skel" style="width:84%"></div><div class="fd-skel" style="width:70%"></div></div>`;
    return;
  }
  if (state.fdState === 'error') {
    $('#main').innerHTML = `<div class="qh-page fd"><h3 class="fd-title">${fdGreeting()}, Alex</h3>
      <div class="fd-err"><i class="fa-solid fa-triangle-exclamation"></i>Couldn't load your workspace — the server didn't answer.<span class="retry" data-act="fd-retry">Retry</span></div></div>`;
    return;
  }
  const firstRun = !DATA.projects.length && !DATA.ungrouped.length && !DATA.pinned.length;
  const hero = `<h3 class="fd-title">${fdGreeting()}, Alex</h3>
    <p class="fd-sub">Sage is ready · knows your members, events, and finances</p>
    ${composerHtml(null, 'chatInput', 'Ask anything, or describe a deliverable — @ agents · # records · / skills', 'fd-send')}`;
  const parts = [hero];
  if (firstRun) {
    parts.push(fdSect('Or start from one of these', null, STARTERS.map((s, i) =>
      `<div class="fr-sug" data-act="fr-suggest" data-id="${i}">
        <div class="tt"><div class="t">${esc(s.text)}</div><div class="s">${esc(s.sub)}</div></div>
        <i class="fa-solid fa-arrow-right"></i></div>`).join('')));
    parts.push(`<p class="qh-foot" style="text-align:center"><i class="fa-solid fa-seedling"></i>As work accumulates, group conversations into projects — shared memory, deliverables, and people in one place. Nothing to set up now.</p>`);
  } else {
    const needs = fdNeedsYou();
    if (needs.length) parts.push(fdSect('Needs you', null, needs.join('')));
    const cont = [...allConvs(), ...DATA.pinned.map((c) => ({ c, p: null }))]
      .filter(({ c }) => c.messages.length)
      .sort((a, b) => parseWhen(a.c.when) - parseWhen(b.c.when)).slice(0, 4);
    if (cont.length) parts.push(fdSect('Continue', { act: 'nav', id: 'chats', label: 'All chats →' }, `<div class="fd-cards">${cont.map(fdCard).join('')}</div>`));
    const ran = fdRan();
    if (ran.length) parts.push(fdSect('Ran overnight', { act: 'nav', id: 'routines', label: 'Routines →' }, ran.join('')));
  }
  $('#main').innerHTML = `${viewAsStrip()}<div class="qh-page fd">${parts.join('')}</div>`;
  const inp = $('#chatInput'); if (inp && !state.settingsOpen) inp.focus();
}

/* ---------- Workspace surfaces — W0a Chats · W0b Projects · W2/W3 stubs;
   toolbars sit in the body, centered with the content container ---------- */

function renderChatsSurface() {
  const selCount = state.chatsSel.size;
  const seg = state.showProjects
    ? `<span class="seg"><span class="${state.chatsGroup === 'project' ? 'on' : ''}" data-act="chats-group" data-id="project">By project</span><span class="${state.chatsGroup === 'flat' ? 'on' : ''}" data-act="chats-group" data-id="flat">Flat</span></span>` : '';
  const selectCtl = !canEdit() ? '' : state.chatsSelect
    ? `<span class="sb-link" data-act="chats-selall">Select all</span>
       <button class="btn secondary sm" data-act="chats-delsel">Delete${selCount ? ` (${selCount})` : ''}</button>
       <button class="btn secondary sm" data-act="chats-select">Done</button>`
    : `<button class="btn secondary sm" data-act="chats-select"><i class="fa-regular fa-square-check"></i> Select</button>`;
  const bar = `<header class="surf-bar"><span class="sb-title">Chats</span><span class="grow"></span>
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="chatsFilter" placeholder="Filter titles &amp; descriptions…" value="${esc(state.chatsFilter || '')}" autocomplete="off"></span>
    ${seg}${selectCtl}
    ${canEdit() ? '<button class="btn sm" data-act="new-chat-global"><i class="fa-solid fa-plus"></i> New chat</button>' : ''}</header>`;

  const pinnedRows = DATA.pinned.filter(chatsMatch);
  const parts = [];
  if (!state.showProjects || state.chatsGroup === 'flat') {
    const rows = [...pinnedRows.map((c) => chatRow(c, null, { pinned: true, dot: true })),
      ...allConvs().filter(({ c }) => chatsMatch(c)).map(({ c, p }) => chatRow(c, p, { dot: true }))];
    if (rows.length) parts.push(`<div class="surf-list">${rows.join('')}</div>`);
  } else {
    if (pinnedRows.length) parts.push(`<div class="grp-lbl"><i class="fa-solid fa-thumbtack" style="font-size:10px"></i> Pinned</div>
      <div class="surf-list">${pinnedRows.map((c) => chatRow(c, null, { pinned: true })).join('')}</div>`);
    for (const p of DATA.projects) {
      const rows = p.conversations.filter(chatsMatch);
      if (!rows.length) continue;
      parts.push(`<div class="grp-lbl" data-drop-target="${p.id}"><span class="pdot" style="background:${p.color}"></span> ${esc(p.name)}</div>
        <div class="surf-list">${rows.map((c) => chatRow(c, p)).join('')}</div>`);
    }
    const ung = DATA.ungrouped.filter(chatsMatch);
    if (ung.length) parts.push(`<div class="grp-lbl" data-drop-target="__none">Ungrouped</div>
      <div class="surf-list">${ung.map((c) => chatRow(c, null)).join('')}</div>`);
  }
  const body = parts.length ? parts.join('')
    : state.chatsFilter.trim()
      ? `<p class="surf-note" style="text-align:center;margin-top:48px">Nothing matches "${esc(state.chatsFilter.trim())}".</p>`
      : `<div class="qh-empty" style="margin-top:64px"><p class="big">No conversations yet</p><p class="sub">Start one from the Front Door — quick questions never need a project.</p></div>`;
  const note = parts.length && state.showProjects && state.chatsGroup === 'project'
    ? '<p class="surf-note" style="max-width:900px">Drag a conversation onto a group label to move it · activity is a quiet dot — no counts, no badges.</p>' : '';
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body">${bar}${body}${note}</div></div>`;
}

const chatsMatch = (c) => {
  const q = (state.chatsFilter || '').trim().toLowerCase();
  return !q || c.title.toLowerCase().includes(q) || (c.summary || '').toLowerCase().includes(q);
};

function chatsVisibleIds() {
  return [...DATA.pinned.filter(chatsMatch), ...allConvs().filter(({ c }) => chatsMatch(c)).map(({ c }) => c)].map((c) => c.id);
}

function chatRow(c, p, { pinned = false, dot = false } = {}) {
  const sel = state.chatsSel.has(c.id);
  const check = state.chatsSelect ? `<span class="rowck ${sel ? 'on' : ''}"><i class="fa-solid fa-check"></i></span>` : '';
  const scope = dot && state.showProjects
    ? (p ? `<span class="pdot" style="background:${p.color}" title="${esc(p.name)}"></span>` : '<span class="pdot hollow" title="Ungrouped"></span>') : '';
  return `<div class="surf-item ${sel ? 'sel' : ''}" data-act="${state.chatsSelect ? 'chats-ck' : 'open-conv'}" data-id="${c.id}" draggable="true" data-drag-conv="${c.id}">
    ${check}<span class="si-ic"><i class="${pinned ? 'fa-solid fa-thumbtack' : 'fa-regular fa-comment'}"></i></span>
    <span class="si-t"><span class="n">${scope}<span class="txt">${esc(c.title)}</span>${c.fresh ? '<span class="udot" title="New since you last looked"></span>' : ''}</span>
    ${c.summary ? `<span class="d">${esc(c.summary)}</span>` : ''}</span>
    <span class="si-m">${c.when || ''}</span>
    <button class="iconbtn" data-act="chat-row-menu" data-id="${c.id}" title="Conversation options"><i class="fa-solid fa-ellipsis"></i></button></div>`;
}

function projCard(p, archived = false) {
  const running = (p.workflows || []).some((w) => w.state === 'running');
  const fresh = p.conversations.some((c) => c.fresh) || p.artifacts.some((a) => a.fresh);
  const shown = p.members.slice(0, 3);
  const avatars = p.members.length > 1
    ? `<span class="avstack">${shown.map((m) => `<span class="avatar" style="background:${m.color}" title="${esc(m.name)}">${m.init}</span>`).join('')}${p.members.length > 3 ? `<span class="avatar more">+${p.members.length - 3}</span>` : ''}</span>` : '';
  const status = archived ? '<span class="small-muted">archived</span>'
    : running ? '<span class="okdot"></span><span class="small-muted">active now</span>'
    : fresh ? '<span class="udot" style="margin-left:0"></span><span class="small-muted">new since you left</span>' : '';
  const right = archived ? `<span class="sb-link" data-act="restore-project" data-id="${p.id}">Restore</span>` : avatars;
  return `<div class="out-card ${archived ? 'archived' : ''}" ${archived ? '' : `data-act="open-hub" data-id="${p.id}"`}>
    <div class="oc-row"><span class="oc-mark" style="background:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
    <span class="oc-t"><span class="n">${esc(p.name)}</span>${p.desc ? `<span class="d">${esc(p.desc)}</span>` : ''}</span></div>
    <div class="oc-foot">${status}<span class="grow"></span>${right}</div></div>`;
}

function renderProjectsSurface() {
  const q = (state.projFilter || '').trim().toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q);
  const bar = `<header class="surf-bar wide"><span class="sb-title">Projects</span><span class="grow"></span>
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="projFilter" placeholder="Search projects…" value="${esc(state.projFilter || '')}" autocomplete="off"></span>
    <span class="seg"><span class="${state.projSeg !== 'archived' ? 'on' : ''}" data-act="proj-seg" data-id="active">Active</span><span class="${state.projSeg === 'archived' ? 'on' : ''}" data-act="proj-seg" data-id="archived">Archived</span></span>
    ${canManage() ? '<button class="btn sm" data-act="new-project"><i class="fa-solid fa-plus"></i> New project</button>' : ''}</header>`;
  let body;
  if (state.projSeg === 'archived') {
    const cards = DATA.archived.filter(match).map((p) => projCard(p, true)).join('');
    body = cards ? `<div class="out-grid">${cards}</div>`
      : '<div class="qh-empty" style="margin-top:64px"><p class="big">Nothing archived</p><p class="sub">Archiving keeps a project restorable — it comes back whole, memory included.</p></div>';
  } else if (!DATA.projects.length) {
    body = `<div class="qh-empty" style="margin-top:64px"><p class="big">Group related work when you're ready</p>
      <p class="sub">A project holds chats, shared memory, and deliverables — agents read its context while they work.</p>
      <button class="btn" data-act="new-project" style="margin-top:4px">Create your first project</button></div>`;
  } else {
    const cards = DATA.projects.filter(match).map((p) => projCard(p)).join('');
    body = `<div class="out-grid">${cards}${canManage() ? `<div class="fold-card" data-act="new-project"><i class="fa-solid fa-plus"></i><div><div class="n">New project</div><div class="d">name · color · icon · description</div></div></div>` : ''}</div>
      <p class="surf-note">Deleting a project moves its conversations to Ungrouped and permanently removes the project's memory; artifacts remain in Collections. Archive instead to keep everything.</p>`;
  }
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body">${bar}${body}</div></div>`;
}

/* ---------- W2 Collections — FULL treatment (shipped-workspace parity;
   absorbs GAPLIST 2.2): breadcrumbs as drop targets · grid/list + sort · search ·
   select mode · staging shelf · drag-move · context menus · origin chips · share ---------- */
const coll = (id) => DATA.collections.find((c) => c.id === id);
const collChildren = (id) => DATA.collections.filter((c) => c.parent === id);
function collCrumbs(c) { const t = []; let cur = c; while (cur) { t.unshift(cur); cur = coll(cur.parent); } return t; }
function findCollItem(id) { for (const c of DATA.collections) { const it = c.items.find((x) => x.id === id); if (it) return { it, c }; } return null; }

function renderCollectionsSurface() {
  const c = state.collId ? coll(state.collId) : null;
  if (state.collId && !c) state.collId = null;
  const q = (state.collFilter || '').trim().toLowerCase();
  const folders = collChildren(c ? c.id : null).filter((f) => !q || f.name.toLowerCase().includes(q));
  let items = c ? c.items.filter((it) => !q || it.title.toLowerCase().includes(q)) : [];
  if (state.collSort === 'az') items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  const crumbs = [`<span class="sb-link crumb" data-act="coll-open" data-id="" data-drop-coll="__root">Collections</span>`]
    .concat(c ? collCrumbs(c).map((x) => `<i class="fa-solid fa-chevron-right csep"></i><span class="sb-link crumb" data-act="coll-open" data-id="${x.id}" data-drop-coll="${x.id}">${esc(x.name)}</span>`) : []).join('');
  const sharedNote = c && c.shared ? `<span class="small-muted">· shared · ${esc(c.shared)}</span>` : '';
  const n = state.collSel.size;
  const bar = `<header class="surf-bar wide"><span class="cs-crumbs">${crumbs}</span>${sharedNote}<span class="grow"></span>
    <span class="sb-search"><i class="fa-solid fa-magnifying-glass"></i><input id="collFilter" placeholder="Search ${c ? 'this collection' : 'collections'}…" value="${esc(state.collFilter || '')}" autocomplete="off"></span>
    <span class="seg"><span class="${state.collSort !== 'az' ? 'on' : ''}" data-act="coll-sort" data-id="recent">Recent</span><span class="${state.collSort === 'az' ? 'on' : ''}" data-act="coll-sort" data-id="az">A–Z</span></span>
    <span class="seg"><span class="${state.collView !== 'list' ? 'on' : ''}" data-act="coll-view" data-id="grid">Grid</span><span class="${state.collView === 'list' ? 'on' : ''}" data-act="coll-view" data-id="list">List</span></span>
    ${canEdit() && c ? (state.collSelect
      ? `<button class="btn secondary sm" data-act="coll-shelf-sel">Shelf${n ? ` (${n})` : ''}</button><button class="btn secondary sm" data-act="coll-remove-sel">Remove${n ? ` (${n})` : ''}</button><button class="btn secondary sm" data-act="coll-select">Done</button>`
      : '<button class="btn secondary sm" data-act="coll-select"><i class="fa-regular fa-square-check"></i> Select</button>') : ''}
    ${canManage() && c ? '<button class="btn secondary sm" data-act="coll-share"><i class="fa-solid fa-user-plus"></i> Share</button>' : ''}
    ${canEdit() ? '<button class="btn sm" data-act="coll-new"><i class="fa-solid fa-plus"></i> New</button>' : ''}</header>`;
  let body = '';
  if (!DATA.collections.length) {
    body = `<div class="qh-empty" style="margin-top:64px"><p class="big">Nothing curated yet</p>
      <p class="sub">A collection is a curated, cross-project library — an artifact is born in a project and curated here. Save one from its viewer, or start a folder.</p>
      ${canEdit() ? '<button class="btn" data-act="coll-new" style="margin-top:4px">New collection</button>' : ''}</div>`;
  } else {
    if (folders.length) body += `<div class="grp-lbl" style="max-width:1060px">Folders</div><div class="coll-grid">${folders.map((f) => {
      const cnt = f.items.length + collChildren(f.id).length;
      return `<div class="fold-card real" data-act="coll-open" data-id="${f.id}" data-drop-coll="${f.id}" data-ctx="coll-folder"><i class="fa-solid fa-folder"></i><div style="min-width:0"><div class="n">${esc(f.name)}</div><div class="d">${cnt} item${cnt === 1 ? '' : 's'}${f.shared ? ` · shared · ${esc(f.shared)}` : ''}</div></div></div>`; }).join('')}</div>`;
    if (c) {
      const origin = (it) => { const pr = it.fromProj ? project(it.fromProj) : null;
        return pr ? `<span class="pdot" style="background:${pr.color};width:7px;height:7px"></span> from ${esc(pr.name)}` : it.from ? `from ${esc(it.from)}` : ''; };
      const card = (it) => { const sel = state.collSel.has(it.id);
        return `<div class="out-card ${sel ? 'csel' : ''}" data-act="${state.collSelect ? 'coll-ck' : 'coll-item-open'}" data-id="${it.id}" draggable="true" data-drag-coll-item="${it.id}" data-ctx="coll-item" style="padding:0;overflow:hidden">
          <div class="oc-prev" style="position:relative">${state.collSelect ? `<span class="rowck ${sel ? 'on' : ''}" style="position:absolute;top:8px;left:8px"><i class="fa-solid fa-check"></i></span>` : ''}${esc(it.ph)}</div>
          <div class="oc-body" style="padding:10px 13px 12px"><div class="n" style="font-weight:600;font-size:12.5px;color:var(--mj-text-primary)">${esc(it.title)}</div>
          <div class="d" style="font-size:11px;color:var(--mj-text-muted);margin-top:2px">${it.kind} · ${it.follows ? 'follows latest' : `pinned to ${esc(it.pin)}`} ${origin(it)}</div>
          <div class="oc-foot" style="margin-top:9px"><span class="mchip">${it.follows ? 'latest' : esc(it.pin)}</span></div></div></div>`; };
      const row = (it) => { const sel = state.collSel.has(it.id);
        return `<div class="surf-item ${sel ? 'sel' : ''}" data-act="${state.collSelect ? 'coll-ck' : 'coll-item-open'}" data-id="${it.id}" draggable="true" data-drag-coll-item="${it.id}" data-ctx="coll-item">
          ${state.collSelect ? `<span class="rowck ${sel ? 'on' : ''}"><i class="fa-solid fa-check"></i></span>` : ''}<span class="si-ic"><i class="fa-regular fa-file-lines"></i></span>
          <span class="si-t"><span class="n"><span class="txt">${esc(it.title)}</span></span><span class="d">${it.kind} · ${it.follows ? 'follows latest' : `pinned to ${esc(it.pin)}`} ${origin(it)}</span></span>
          <span class="si-m">${it.when || ''}</span></div>`; };
      if (items.length) body += `<div class="grp-lbl" style="max-width:1060px">Artifacts</div>` + (state.collView === 'list'
        ? `<div class="surf-list" style="max-width:1060px">${items.map(row).join('')}</div>`
        : `<div class="out-grid" style="max-width:1060px;grid-template-columns:repeat(4,1fr)">${items.map(card).join('')}</div>`);
      else if (!folders.length) body += `<p class="surf-note" style="text-align:center;margin-top:40px">${q ? `Nothing matches "${esc(state.collFilter.trim())}".` : 'Empty — drag artifacts onto a breadcrumb or folder, or use the shelf.'}</p>`;
    } else if (!folders.length) body += `<p class="surf-note" style="text-align:center;margin-top:40px">Nothing matches "${esc(state.collFilter.trim())}".</p>`;
  }
  const shelf = state.shelf.length
    ? `<div class="shelf"><i class="fa-solid fa-inbox"></i><span class="t">Staging shelf</span>${state.shelf.map((s) => `<span class="mchip">${esc(s.title)}</span>`).join('')}<span class="grow"></span>
       ${c ? `<button class="btn sm" data-act="shelf-drop">Move here (${state.shelf.length})</button>` : '<span class="small-muted">open a collection to drop</span>'}<button class="btn secondary sm" data-act="shelf-clear">Clear</button></div>` : '';
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body">${bar}${body}</div>${shelf}</div>`;
}

/* ---------- W3 Routines — harvest: list · Scheduled vs Monitoring · Run now ·
   pause/resume · detail w/ schedule editor + run history ---------- */
function renderRoutinesSurface() {
  if (state.routineId) return renderRoutineDetail();
  const seg = state.routSeg || 'all';
  const rows = DATA.routines.filter((r) => seg === 'all' || r.kind.toLowerCase() === seg);
  const bar = `<header class="surf-bar"><span class="sb-title">Routines</span><span class="small-muted">personal standing orders — not part of any project</span><span class="grow"></span>
    <span class="seg">${[['all', 'All'], ['scheduled', 'Scheduled'], ['monitoring', 'Monitoring']].map(([id, l]) => `<span class="${seg === id ? 'on' : ''}" data-act="rout-seg" data-id="${id}">${l}</span>`).join('')}</span>
    ${canEdit() ? '<button class="btn sm" data-act="rout-new"><i class="fa-solid fa-plus"></i> New routine</button>' : ''}</header>`;
  const row = (r) => `<div class="surf-item" data-act="rout-open" data-id="${r.id}">
    <span class="si-ic"><i class="${r.paused ? 'fa-regular fa-circle-pause' : 'fa-solid fa-clock-rotate-left ok'}"></i></span>
    <span class="si-t"><span class="n"><span class="txt">${esc(r.name)}</span></span><span class="d">${esc(r.schedule)} · ${esc(r.agent)} · ${esc(r.notify)} · last run: ${esc(r.last)}</span></span>
    <span class="si-m">${r.paused ? 'paused' : 'next: ' + esc(r.next)}</span>
    ${canEdit() ? `<button class="btn secondary sm" data-act="rout-run" data-id="${r.id}" ${r.paused ? 'disabled style="opacity:.5"' : ''}>Run now</button>
    <button class="iconbtn always" data-act="rout-pause" data-id="${r.id}" title="${r.paused ? 'Resume' : 'Pause'}"><i class="fa-solid ${r.paused ? 'fa-play' : 'fa-pause'}"></i></button>` : ''}</div>`;
  const hist = DATA.routines.flatMap((r) => r.history.map((h) => ({ r, h }))).slice(0, 5);
  const histRows = hist.map(({ r, h }) => `<div class="surf-item" style="cursor:default"><span class="si-ic"><i class="fa-solid fa-circle-check ok"></i></span>
    <span class="si-t"><span class="n"><span class="txt">${esc(r.name)} — ${esc(h.when)}</span></span><span class="d">${esc(h.note)}</span></span>
    <span class="sb-link" data-act="rout-hist" data-id="${r.id}">${esc(h.link)}</span></div>`).join('');
  const body = rows.length
    ? `<div class="surf-list">${rows.map(row).join('')}</div>` + (hist.length ? `<div class="grp-lbl">Recent runs</div><div class="surf-list">${histRows}</div>` : '')
    : `<div class="qh-empty" style="margin-top:64px"><p class="big">No routines yet</p>
      <p class="sub">A routine is a personal standing order — a scheduled run, or a monitor that only speaks up when something changes. Results land on your Front Door under "Ran overnight".</p>
      ${canEdit() ? '<button class="btn" data-act="rout-new" style="margin-top:4px">New routine</button>' : ''}</div>`;
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body">${bar}${body}</div></div>`;
}

function renderRoutineDetail() {
  const r = DATA.routines.find((x) => x.id === state.routineId);
  if (!r) { state.routineId = null; return renderRoutinesSurface(); }
  const sel2 = (key, opts, cur) => `<select class="f-select" data-rout="${key}" ${canEdit() ? '' : 'disabled'}>${opts.map((o) => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  const hist = r.history.length ? r.history.map((h) => `<div class="surf-item" style="cursor:default"><span class="si-ic"><i class="fa-solid fa-circle-check ok"></i></span>
    <span class="si-t"><span class="n"><span class="txt">${esc(h.when)}</span></span><span class="d">${esc(h.note)}</span></span>
    <span class="sb-link" data-act="rout-hist" data-id="${r.id}">${esc(h.link)}</span></div>`).join('') : '<p class="surf-note">No runs yet.</p>';
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body">
    <div class="room-toolbar"><span class="sb-link" data-act="rout-back"><i class="fa-solid fa-arrow-left"></i> Routines</span></div>
    <header class="surf-bar"><span class="sb-title" id="routName" ${canEdit() ? 'contenteditable="true" spellcheck="false"' : ''}>${esc(r.name)}</span><span class="grow"></span>
      ${canEdit() ? `<button class="btn secondary sm" data-act="rout-run" data-id="${r.id}" ${r.paused ? 'disabled style="opacity:.5"' : ''}>Run now</button>
      <button class="btn secondary sm" data-act="rout-pause" data-id="${r.id}">${r.paused ? 'Resume' : 'Pause'}</button>
      <button class="btn secondary sm" style="color:var(--mj-status-error)" data-act="rout-delete" data-id="${r.id}">Delete</button>` : ''}</header>
    <div class="set-group" style="max-width:900px;margin:0 auto;background:var(--mj-bg-surface)">
      <div class="set-row"><span class="t"><span class="n">Type</span><span class="d">Scheduled runs on a clock · Monitoring only speaks up on change</span></span>${sel2('kind', ['Scheduled', 'Monitoring'], r.kind)}</div>
      <div class="set-row"><span class="t"><span class="n">Schedule</span><span class="d">${r.kind === 'Monitoring' ? 'How often the monitor checks' : 'When it runs'}</span></span>${sel2('schedule', ['Daily 7:00 AM', 'Mondays 6:00 AM', 'Fridays 8:00 AM', 'Monthly · after board meetings'], r.schedule)}</div>
      <div class="set-row"><span class="t"><span class="n">Agent</span><span class="d">Runs with your access, in a fresh conversation</span></span>${sel2('agent', ['Sage', 'Skip'], r.agent)}</div>
      <div class="set-row"><span class="t"><span class="n">Notify</span><span class="d">Quiet by default — no counts, no badges</span></span>${sel2('notify', ['In-app', 'In-app + email', 'Only when numbers change'], r.notify)}</div>
    </div>
    <div class="grp-lbl" style="margin-top:20px">Run history</div><div class="surf-list">${hist}</div>
    <p class="surf-note" style="max-width:900px">Routines are personal and project-agnostic in v1 — results land on your Front Door under "Ran overnight". A routine's output landing in a project is a P2 question (D17).</p>
  </div></div>`;
}

/* ---------- S1 Settings — slide-in over the current surface, never a route (D-S8) ---------- */
function applyAppearance(v) {
  state.appearance = v;
  const r = document.documentElement;
  if (v === 'system') delete r.dataset.theme; else r.dataset.theme = v;
}

function renderSettingsPanel() {
  const open = state.settingsOpen;
  $('#settingsScrim').classList.toggle('on', open);
  const panel = $('#settingsPanel');
  panel.hidden = !open;
  const gear = $('#settingsBtn'); if (gear) gear.classList.toggle('on', open);
  if (!open) return;
  const sel = (key, options, current) => `<select class="f-select" data-set="${key}">${options.map((o) => `<option ${o === current ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  panel.innerHTML = `
    <header class="set-head"><span class="n">Settings</span><button class="iconbtn" data-act="settings-close" title="Close (Esc)"><i class="fa-solid fa-xmark"></i></button></header>
    <p class="set-sub">Applies to you, across this workspace.</p>
    <div class="set-lbl">Sidebar</div>
    <div class="set-group">
      <div class="set-row"><span class="t"><span class="n">Show Projects</span><span class="d">Group related chats, memory, and deliverables into projects</span></span>
        <button class="tgl ${state.showProjects ? 'on' : ''}" role="switch" aria-checked="${state.showProjects}" data-act="tgl-projects"></button></div>
      <div class="set-row"><span class="t"><span class="n">Sidebar density</span><span class="d">Row spacing</span></span>
        ${sel('density', ['Comfortable', 'Compact'], state.density === 'compact' ? 'Compact' : 'Comfortable')}</div>
    </div>
    <div class="set-lbl">Preferences</div>
    <div class="set-group">
      <div class="set-row"><span class="t"><span class="n">Default agent</span><span class="d">New conversations start here — the per-conversation choice still wins</span></span>
        ${sel('agent', AGENTS.map((a) => a.name), state.defaultAgent)}</div>
      <div class="set-row"><span class="t"><span class="n">Notifications</span><span class="d">In-app + email when a run needs you</span></span></div>
      <div class="set-row"><span class="t"><span class="n">Appearance</span><span class="d">Light and dark are both first-class</span></span>
        ${sel('appearance', ['System', 'Light', 'Dark'], state.appearance[0].toUpperCase() + state.appearance.slice(1))}</div>
      <div class="set-row"><span class="t"><span class="n">Refresh agent cache</span><span class="d">Re-sync available agents and skills from the server</span></span>
        <button class="btn secondary sm" data-act="refresh-cache">Refresh</button></div>
    </div>`;
}

/* ---------- Artifact viewer — MOUNT-POINT facsimile of mj-artifact-viewer-panel
   (+ component plugin tabs). ⚖3 resolved 2026-07-22 (Matt): shipped tab structure;
   the canvas 4-lens model stays a GAPLIST 2.1 proposal. ⚖8 resolved: the in-chat
   artifacts modal folds into this trail + the Room's Artifacts tab. ---------- */
function viewerTabs(a) {
  return a.kind === 'Component'
    ? ['Display', 'Functional', 'Technical', 'Data', 'Code', 'Spec', 'Details', 'Links']
    : ['Display', 'JSON', 'Details', 'Links'];
}

const vwSkel = (w) => `<div class="skeleton" style="width:${w}%"></div>`;
const vwDoc = (h, lines) => `<div class="doc-preview"><h4>${h}</h4>${lines.map((l) => `<p>· ${l}</p>`).join('')}${vwSkel(80)}${vwSkel(64)}</div>`;

function viewerTabBody(p, a, ver, tab, editable) {
  const latest = a.versions[a.versions.length - 1];
  switch (tab) {
    case 'Display':
      if (a.kind === 'Component') return `<div class="k-tblf">
        <div class="tb"><span class="sb-search" style="flex:1"><i class="fa-solid fa-magnifying-glass"></i>Search rows…</span><span class="mchip">sortable</span></div>
        <table><tr><th>Account</th><th>Exposure</th><th>Lapse risk</th><th>Owner</th></tr>
        <tr><td>Meridian Holdings</td><td>$420K</td><td class="err">High</td><td>Alex</td></tr>
        <tr><td>Coastal Partners</td><td>$310K</td><td class="err">High</td><td>Dana</td></tr>
        <tr><td>Brightline Assoc.</td><td>$160K</td><td class="warn">Medium</td><td>Alex</td></tr>
        <tr><td>Summit Group</td><td>$95K</td><td class="ok">Low</td><td>Ray</td></tr></table>
        <div class="vw-note">Facsimile at real scale — the live React component (interactive search, sort, drill-down) mounts here.</div></div>`;
      return `<div class="doc-preview" id="docPreview" ${editable ? 'contenteditable="true"' : ''}>
        <h4>${esc(a.title)} <span style="font-weight:400;color:var(--mj-text-muted)">· v${ver.v}</span></h4>
        <p>${esc(ver.note)}.${editable ? ' You are editing — this becomes a new version on save.' : ''}</p>
        ${vwSkel(92)}${vwSkel(84)}${vwSkel(88)}${vwSkel(56)}</div>`;
    case 'Functional': return vwDoc('Functional requirements', ['Surface at-risk renewals by cohort', 'Rank by exposure and lapse window', 'One-click save plan per account']);
    case 'Technical': return vwDoc('Technical design', ['Reads Membership + Engagement entities', 'Risk score computed client-side', 'Refreshes on data-source change events']);
    case 'Data': return `<div class="vw-kv"><div class="r"><span class="k">Entities</span><span>Members · Renewals · Engagement Events</span></div>
      <div class="r"><span class="k">Queries</span><span>Lapse risk by cohort (user-runnable)</span></div>
      <div class="r"><span class="k">Access</span><span>Read-only · permission-evaluated per user</span></div></div>`;
    case 'Code': case 'Spec': case 'JSON':
      return `<div class="vw-code"><div class="cbar"><span>${tab === 'Code' ? 'component.tsx' : 'artifact.json'}</span><span class="sb-link" data-act="vw-copy">Copy</span></div><pre>${tab === 'Code'
        ? 'export function LapseRiskDashboard({ data }) {\n  const cohorts = groupBy(data, \'cohort\');\n  return &lt;RiskTable rows={rank(cohorts)} /&gt;;\n}'
        : `{\n  "name": "${esc(a.title)}",\n  "type": "${a.kind}",\n  "version": ${ver.v},\n  "createdBy": "${esc(ver.by)}"\n}`}</pre></div>`;
    case 'Details': return `<div class="vw-kv">${[['Type', a.kind], ['Versions', a.versions.length + ' (append-only)'], ['Created by', a.versions[0].by], ['Latest', `v${latest.v} · ${latest.by} · ${latest.when}`], ['Usage', 'Viewed 14 · Opened 6 · Shared 2']].map(([k, v]) => `<div class="r"><span class="k">${k}</span><span>${esc(v)}</span></div>`).join('')}</div>`;
    case 'Links': {
      const origin = p.conversations[0];
      return `<div class="vw-kv">
        <div class="r"><span class="k">Origin</span><span class="sb-link" data-act="open-conv" data-id="${origin ? origin.id : ''}">${origin ? esc(origin.title) : '—'}</span></div>
        <div class="r"><span class="k">Collections</span><span>${(a.collections || []).map((c) => `<span class="mchip"><i class="fa-solid fa-layer-group"></i> ${esc(c)}</span>`).join(' ') || 'Not curated yet'}</span></div></div>`;
    }
  }
  return '';
}

function viewerHtml(p, a, { compact = false } = {}) {
  const sel = state.artifactVersion || a.versions[a.versions.length - 1].v;
  const ver = a.versions.find((v) => v.v === sel) || a.versions[a.versions.length - 1];
  const tabs = viewerTabs(a);
  if (!tabs.includes(state.viewerTab)) state.viewerTab = 'Display';
  const editable = state.editingArtifact && state.viewerTab === 'Display';
  const verSel = `<select class="f-select vw-ver" data-ver-select title="Version history — append-only">${[...a.versions].reverse().map((v) => `<option value="${v.v}" ${v.v === sel ? 'selected' : ''}>v${v.v} · ${esc(v.by)} · ${v.when}</option>`).join('')}</select>`;
  const tabRow = tabs.map((t) => `<span class="k-lens ${state.viewerTab === t ? 'on' : ''}" data-act="viewer-tab" data-id="${t}">${t}</span>`).join('');
  const actions = state.editingArtifact
    ? `<button class="btn sm" data-act="art-save">Save as v${a.versions.length + 1}</button><button class="btn secondary sm" data-act="art-cancel">Cancel</button>`
    : (canEdit() || canManage())
      ? `<button class="btn secondary sm" data-act="viewer-menu">Options <i class="fa-solid fa-chevron-down" style="font-size:9px"></i></button>` : '';
  return `<div class="viewer">
    <div class="vw-head"><i class="${a.icon} vic"></i><div style="flex:1;min-width:0"><div class="n">${esc(a.title)}</div><div class="m">${a.kind} · v${ver.v} · ${esc(ver.by)} · ${ver.when} — ${esc(ver.note)}</div></div>
      <div class="vchips-slot">${verSel}</div>${actions}${compact ? '<button class="iconbtn" data-act="studio-close" title="Close — back to full-width chat"><i class="fa-solid fa-xmark"></i></button>' : ''}</div>
    <div class="k-lenses">${tabRow}</div>
    <div class="vw-body">${viewerTabBody(p, a, ver, state.viewerTab, editable)}</div></div>`;
}

function renderArtifact() {
  const p = project(state.projectId);
  const a = artifact(p, state.artifactId);
  if (!a) return renderHub();
  $('#main').innerHTML = `${viewAsStrip()}<div class="surf"><div class="surf-body" style="padding-top:18px">
    <div class="room-toolbar" style="max-width:980px"><span class="sb-link" data-act="open-hub" data-id="${p.id}"><i class="fa-solid ${p.icon}" style="color:${p.color}"></i> ${esc(p.name)}</span>
      <i class="fa-solid fa-chevron-right" style="font-size:9px;color:var(--mj-text-muted)"></i>
      <span class="sb-link" data-act="open-tab" data-id="artifacts">Artifacts</span></div>
    <div class="vw-page">${viewerHtml(p, a)}</div></div></div>`;
  if (state.editingArtifact) { const d = $('#docPreview'); if (d) d.focus(); }
}

/* ---------- Chat ---------- */
function planCardHtml(m, mi) {
  const plan = m.plan;
  if (plan.status === 'canceled') {
    return `<div class="plan-done" style="color:var(--mj-text-muted)"><i class="fa-solid fa-circle-minus" style="color:var(--mj-text-muted)"></i>Run canceled — nothing was saved. <span class="undo" data-act="plan-rearm">Re-plan</span></div>`;
  }
  if (plan.status === 'stale') {
    return `<div class="plan-done" style="color:var(--mj-text-muted)"><i class="fa-solid fa-circle-minus" style="color:var(--mj-text-muted)"></i>Plan not run — the conversation moved on. <span class="undo" data-act="plan-rearm">Re-plan</span></div>`;
  }
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

const AGENT_AVATARS = {
  Sage: { icon: 'fa-robot', color: 'var(--mj-brand-primary)' },
  Skip: { icon: 'fa-satellite-dish', color: '#7C3AED' },
};

/* Position #13 as REVERSED 2026-07-15: user turns are FILLED BUBBLES; agent turns
   are flat avatar rows. A conscious divergence from the shipped both-parties
   idiom, recorded on the parity checklist — do not relapse to flat user rows. */
const MENTION_RX = /@(Sage|Skip|Dana Kim|Ray Barnes)/g;
const msgText = (t) => esc(t).replace(MENTION_RX, '<span class="mention">@$1</span>');
const msgRun = (m, mi) => m.run || (m.dur ? { id: 'AR-' + (8800 + mi), status: 'Completed', tokens: '9.2K', cost: '$0.09', steps: ['Fetch conversation + project context', 'Reason over memory and data', 'Compose the reply'] } : null);

/* WP4 — the complete message row. Placement per BASELINE §C2: pin/delete/rating
   in a LAST-message footer; earlier messages carry actions inside the gear
   (run-inspector) panel; non-owners get a read-only "Rated N/10" pill. */
function inspectorHtml(m, mi, isLast) {
  const run = msgRun(m, mi);
  if (!run) return '';
  const kv = (k, v) => `<div class="r"><span class="k">${k}</span><span>${v}</span></div>`;
  const steps = run.steps.map((s) => `<div class="k-rstep done"><i class="fa-solid fa-check"></i>${esc(s)}</div>`).join('');
  const acts = !isLast && canEdit()
    ? `<div class="insp-acts"><span class="sb-link" data-act="msg-pin" data-id="${mi}">${m.pinned ? 'Unpin message' : 'Pin message'}</span><span class="sb-link danger" data-act="msg-del-below" data-id="${mi}">Delete from here down</span></div>` : '';
  return `<div class="inspect">
    ${kv('Agent', esc(m.who))}${kv('Run', `<span class="sb-link" data-act="noop">${run.id}</span>`)}${kv('Status', run.status)}${kv('Tokens', run.tokens)}${kv('Cost', run.cost)}
    <div class="insp-steps">${steps}</div>
    <div class="r"><span class="k">Tasks</span><span class="small-muted">No associated tasks</span></div>
    ${acts}</div>`;
}

function msgHtml(m, mi) {
  const f = findConv(state.convId);
  const isLast = f && mi === f.conv.messages.length - 1;
  const isUser = m.who === 'user';
  if (isUser) {
    if (m.formPill) return `<div class="msg-u"><div class="form-pills">${m.formPill.map((x) => `<span class="fpill"><i class="fa-solid fa-check"></i>${esc(x)}</span>`).join('')}</div></div>`;
    if (state.editMsg === mi) return `<div class="msg-u"><div class="mu-edit"><textarea id="muEdit" rows="2">${esc(m.text)}</textarea>
      <div class="mu-edit-acts"><button class="btn sm" data-act="msg-edit-save" data-id="${mi}">Save</button><button class="btn secondary sm" data-act="msg-edit-cancel">Cancel</button></div></div></div>`;
    const acts = canEdit() ? `<span class="mu-acts"><span class="ma" data-act="msg-edit" data-id="${mi}" title="Edit message"><i class="fa-solid fa-pen"></i></span></span>` : '';
    return `<div class="msg-u">${m.files ? `<div class="msg-tags" style="justify-content:flex-end">${m.files.map((x) => `<span class="mtag"><i class="fa-solid fa-file"></i>${esc(x)}</span>`).join('')}</div>` : ''}
      <div class="mu-row">${acts}${m.text ? `<div class="mu-bubble">${esc(m.text)}${m.edited ? '<span class="edited">(edited)</span>' : ''}</div>` : ''}</div>${msgTags(m.tags)}</div>`;
  }
  const a = AGENT_AVATARS[m.who] || AGENT_AVATARS.Sage;
  const avatar = `<span class="msg-av" style="background:${a.color}"><i class="fa-solid ${a.icon}"></i></span>`;
  const pinFlag = m.pinned ? '<span class="msg-pinflag" title="Pinned"><i class="fa-solid fa-thumbtack"></i></span>' : '';
  const head = `<div class="msg-head"><span class="msg-name">${esc(m.who)}</span>${
    m.when ? `<span class="msg-time">${esc(m.when)}</span>` : ''}${pinFlag}${
    m.dur ? `<span class="msg-dur"><i class="fa-regular fa-clock"></i>${esc(m.dur)}</span>` : ''}</div>`;
  let body;
  if (m.error) {
    body = `<div class="msg-error"><i class="fa-solid fa-triangle-exclamation"></i>${esc(m.text)}<span class="retry" data-act="msg-retry" data-id="${mi}">Retry</span></div>`;
  } else {
    const remembered = m.remembered
      ? `<div class="remembered"><i class="fa-solid fa-check"></i>Saved to project memory — <span class="remtxt" id="rem-${mi}">"${esc(m.remembered)}"</span>
        <span class="undo" data-act="rem-edit" data-id="${mi}">Edit</span><span class="undo" data-act="mem-undo" data-id="${mi}">Undo</span>
        <span class="cap-scope">Scope: <select class="f-select" data-capture-scope="${mi}"><option ${m.remScope !== 'Org-wide' ? 'selected' : ''}>Project</option><option ${m.remScope === 'Org-wide' ? 'selected' : ''}>Org-wide</option></select></span></div>` : '';
    const skill = m.skill
      ? `<div class="remembered"><i class="fa-solid fa-wand-magic-sparkles" style="color:${m.skillColor || 'var(--mj-brand-primary)'}"></i>Skill activated — ${esc(m.skill)}</div>` : '';
    const plan = m.plan ? planCardHtml(m, mi) : '';
    const artCard = m.artifactId ? (() => { const art = artifact(project(state.projectId), m.artifactId); if (!art) return '';
      const l = art.versions[art.versions.length - 1];
      return `<div class="k-artcard" data-act="open-artifact" data-id="${art.id}"><span class="k-artcard__ic"><i class="${art.icon}"></i></span>
        <span class="k-artcard__t"><span class="n">${esc(art.title)}</span><span class="d">${art.kind} · v${l.v} · ${esc(l.by)}</span></span><i class="fa-solid fa-chevron-right"></i></div>`; })() : '';
    /* D-S1 quiet meta line: memory used · steps · cost · Inspect run */
    const run = msgRun(m, mi);
    const metaBits = [];
    if (m.memoryUsed) metaBits.push(`<span class="mb" data-act="open-tab-from-chat" data-id="memory" title="See what agents remember here"><i class="fa-solid fa-brain"></i>Used ${m.memoryUsed} ${m.memoryUsed === 1 ? 'note' : 'notes'}</span>`);
    if (run) metaBits.push(`<span>${run.steps.length} steps</span>`, `<span>${run.cost}</span>`, `<span class="mb" data-act="inspect" data-id="${mi}">Inspect run</span>`);
    const meta = metaBits.length && !m.thinking ? `<div class="k-meta">${metaBits.join('<span class="sep"></span>')}</div>` : '';
    const inspector = state.inspectId === mi ? inspectorHtml(m, mi, isLast) : '';
    const cmds = isLast && m.cmds && canEdit()
      ? `<div class="k-cmds">${m.cmds.map((c, ci) => `<span class="cmd-chip" data-act="cmd-chip" data-id="${mi}:${ci}">${esc(c)}</span>`).join('')}</div>` : '';
    /* §C2: last-message footer — pin · rating · delete-below · gear */
    const ratePill = m.rating ? `<span class="rated" title="Rated by Alex">Rated ${m.rating}/10</span>` : '';
    const foot = isLast && !m.thinking
      ? `<div class="msg-foot">${canEdit() ? `<span class="ma" data-act="msg-pin" data-id="${mi}" title="${m.pinned ? 'Unpin' : 'Pin'} message"><i class="fa-solid fa-thumbtack"></i></span>` : ''}${
          m.rating ? ratePill : canEdit() ? `<span class="ma" data-act="msg-rate" data-id="${mi}" title="Rate this reply (1–10)"><i class="fa-regular fa-star"></i></span>` : ''}${
          canEdit() ? `<span class="ma" data-act="msg-del-below" data-id="${mi}" title="Delete this and everything below"><i class="fa-regular fa-trash-can"></i></span>` : ''}</div>`
      : (m.rating ? `<div class="msg-foot on">${ratePill}</div>` : '');
    body = `${skill}${m.text ? `<div class="msg-text ${m.thinking ? 'thinking' : ''}">${msgText(m.text)}</div>` : ''}${plan}${artCard}${remembered}${msgTags(m.tags)}${meta}${inspector}${cmds}${foot}`;
  }
  return `<div class="msg ${state.inspectId === mi ? 'inspecting' : ''}" data-mi="${mi}">${avatar}<div class="msg-main">${head}${body}</div>${
    !m.error && !m.thinking && !isLast ? `<span class="msg-hoveracts"><span class="ma" data-act="inspect" data-id="${mi}" title="Run inspector · message actions"><i class="fa-solid fa-gear"></i></span></span>` : ''}</div>`;
}

/* T2 — run-driven rail: "Working now" card while a run is live (⚖7 ratified:
   the rail is the conscious replacement for the floating panels; cancel lives here) */
function railRunCard(p) {
  const keep = state.railKeep ? '<span class="small-muted">kept open</span>' : '<span class="sb-link" data-act="rail-keep">Keep open</span>';
  const f = state.convId ? findConv(state.convId) : null;
  let steps = null, mi = null;
  if (f) f.conv.messages.forEach((m, i) => { if (m.plan && m.plan.status === 'approved' && m.plan.exec.length && m.plan.exec.some((x) => x.state !== 'done')) { steps = m.plan.exec; mi = i; } });
  if (steps) {
    const rows = steps.map((x) => `<div class="k-rstep ${x.state === 'done' ? 'done' : x.state === 'run' ? 'run' : 'wait'}"><i class="fa-solid ${x.state === 'done' ? 'fa-check' : x.state === 'run' ? 'fa-circle-notch' : 'fa-circle'}"></i>${esc(x.text)}</div>`).join('');
    return `<div class="k-rcard"><div class="k-rcard__head"><i class="lead fa-solid fa-circle-notch spin" style="color:var(--mj-brand-primary)"></i>Working now<span class="grow"></span>${keep}</div>
      <div class="k-rcard__body">${rows}<div class="rc-foot"><span class="sb-link" data-act="run-cancel" data-id="${mi}">Cancel run</span></div></div></div>`;
  }
  const wf = p.workflows.find((w) => w.state === 'running');
  if (wf) return `<div class="k-rcard"><div class="k-rcard__head"><i class="lead fa-solid fa-circle-notch spin" style="color:var(--mj-brand-primary)"></i>Working now<span class="grow"></span>${keep}</div>
    <div class="k-rcard__body"><div class="c-run"><div class="t">${esc(wf.title)}</div><div class="meta">${esc(wf.meta)}</div><div class="bar"><span style="width:${wf.pct}%"></span></div></div>
    <div class="rc-foot"><span class="sb-link" data-act="wf-cancel" data-id="${wf.id}" data-proj="${p.id}">Cancel run</span></div></div></div>`;
  return '';
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
    ${railRunCard(p)}
    <div class="c-sect"><div class="c-label"><span class="l">Memory</span><span class="a" data-act="open-tab-from-chat" data-id="memory">Manage</span></div>${mem || '<div class="c-mem" style="color:var(--mj-text-muted)">Nothing yet.</div>'}</div>
    ${running ? `<div class="c-sect"><div class="c-label"><span class="l">Running now</span></div>${running}</div>` : ''}
    ${arts ? `<div class="c-sect"><div class="c-label"><span class="l">Artifacts</span><span class="a" data-act="open-tab-from-chat" data-id="artifacts">All</span></div>${arts}</div>` : ''}
  </aside>`;
}

/* WP4 — header consolidation (GAPLIST 1.6, decided against the list): members →
   Room avatars/share · artifact chip → T3/P4 (⚖8) · agent+mode pickers → composer ·
   Export/Share/Move/Rename/Delete → overflow menu · pinned messages → earned
   thumbtack → panel · shared-by = quiet provenance text · test-run = quiet flask. */
function chatHeader({ proj, conv, title, temporary }) {
  const bread = proj
    ? `<span class="home" data-act="open-hub" data-id="${proj.id}"><i class="fa-solid ${proj.icon}" style="color:${proj.color}"></i> ${esc(proj.name)}</span><i class="fa-solid fa-chevron-right sep"></i>`
    : '';
  const sharedBy = conv && conv.sharedBy ? `<span class="hdr-shared"><i class="fa-solid fa-user-group"></i> Shared by ${esc(conv.sharedBy)}</span>` : '';
  const testRun = conv && conv.testRun ? '<span class="hdr-flask" title="Test run — QA context; feedback routes to the test record"><i class="fa-solid fa-flask"></i></span>' : '';
  const pinsBtn = conv && conv.messages.some((m) => m.pinned)
    ? '<button class="iconbtn" data-act="pins-panel" title="Pinned messages"><i class="fa-solid fa-thumbtack"></i></button>' : '';
  const gauge = `<span class="chat-gauge" tabindex="0"><span class="gring" style="--pct:38"></span>38%<span class="pop">
      <div class="kv"><span class="k">Context used</span><span class="v">382K / 1M</span></div>
      <div class="kv"><span class="k">This turn</span><span class="v">+6.1K tok</span></div>
      <hr><div class="kv"><span class="k">Run cost</span><span class="v">$0.74</span></div>
    </span></span>`;
  const companionBtn = proj
    ? `<button class="iconbtn ${state.companion ? 'on' : ''}" data-act="toggle-companion" aria-pressed="${state.companion}" title="Project context panel"><i class="fa-solid fa-table-columns"></i></button>` : '';
  const menuBtn = conv && !temporary
    ? `<button class="iconbtn" data-act="conv-menu" title="Conversation options"><i class="fa-solid fa-ellipsis"></i></button>` : '';
  return `<div class="chat-head">
    <span class="chat-bread">${bread}</span>
    <span class="chat-title" ${temporary ? 'style="font-style:italic;color:var(--mj-text-muted)"' : ''}>${esc(title)}</span>${sharedBy}${testRun}
    <span class="grow"></span>${gauge}${pinsBtn}${companionBtn}${menuBtn}</div>`;
}

function chipHtml(c, i) {
  const style = c.color ? `style="color:${c.color};border-color:color-mix(in srgb, ${c.color} 35%, transparent)"` : '';
  return `<span class="c-chip" ${style}><i class="fa-solid ${c.icon}"></i>${esc(c.label)}
    <button class="x" data-act="chip-remove" data-id="${i}" title="Remove"><i class="fa-solid fa-xmark"></i></button></span>`;
}

function composerHtml(proj, inputId, placeholder, sendAct) {
  const d = draft();
  const agent = draftAgent();
  const isRemote = agent.name === 'Skip';
  const tempChip = (state.view === 'newchat' || state.view === 'frontdoor')
    ? `<span class="chip-toggle ${d.temp ? 'on temp' : ''}" data-act="toggle-temp" title="Temporary — nothing saved, no memory read or written. Locks once the conversation starts (D20).">
        <i class="fa-solid fa-ghost"></i> Temporary</span>` : '';
  const planChip = isRemote
    ? `<span class="chip-toggle disabled" data-act="plan-delegated" title="Skip runs its own planning — plan mode is delegated to the remote agent (D15)">
        <i class="fa-solid fa-list-check"></i> Plan first</span>`
    : `<span class="chip-toggle ${d.planArmed ? 'on' : ''}" data-act="toggle-plan" title="Ask for an editable plan before this request runs — one request only">
        <i class="fa-solid fa-list-check"></i> Plan first</span>`;
  const chips = d.chips.length ? `<div class="chip-row">${d.chips.map(chipHtml).join('')}</div>` : '';
  return `<div class="chat-composer"><div class="box2">
    ${chips}
    <textarea id="${inputId}" rows="1" placeholder="${esc(placeholder)}">${esc(d.text)}</textarea>
    <div class="c-bar">
      <button class="iconbtn" data-act="attach-menu" title="Attach — file or artifact"><i class="fa-solid fa-paperclip"></i></button>
      <span class="agent-pill" data-act="agent-menu" title="Which agent handles this conversation">
        <span class="aav" style="background:${agent.color}">${agent.name[0]}</span> ${agent.name}
        ${isRemote ? '<span class="remote-tag">remote</span>' : ''}</span>
      ${planChip}${tempChip}
      <span class="chip-toggle subtle" data-act="mode-menu" title="Response mode — model preset"><i class="fa-solid fa-sliders"></i> ${composer.mode}</span>
      <span class="grow"></span>
      <button class="iconbtn ${composer.voice ? 'listening' : ''}" data-act="mic" title="Voice input"><i class="fa-solid fa-microphone"></i></button>
      <button class="send" data-act="${sendAct}"><i class="fa-solid fa-arrow-up"></i></button>
    </div>
    <div class="mention-pop" id="mentionPop" hidden></div>
  </div>
  <div class="comp-hint">${state.convId === 'tmp' ? 'Enter to send · Shift+Enter for a new line · nothing is saved' : `Enter to send · Shift+Enter for a new line · ${agent.name} reads ${proj ? 'project & org' : 'org'} memory`}</div></div>`;
}

/* Mention triggers: @ agents+people · # records · / skills */
function triggerItems(ch, q) {
  let items = [];
  if (ch === '@') items = [
    ...AGENTS.map((a) => ({ label: a.name, sub: a.desc, icon: a.icon, color: a.color, kind: 'agent', group: 'Send to' })),
    ...PEOPLE.map((p) => ({ ...p, group: 'Reference' })),
  ];
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
  popCtx = { items, trigger: m[2], typed: m[3], active: 0 };
  renderMentionPop();
}

function renderMentionPop() {
  const pop = $('#mentionPop');
  if (!pop || !popCtx) return;
  let html = '', lastGroup = null;
  popCtx.items.forEach((it, i) => {
    if (it.group && it.group !== lastGroup) { html += `<div class="mp-group">${it.group}</div>`; lastGroup = it.group; }
    html += `<div class="mp-item ${i === popCtx.active ? 'active' : ''}" data-act="mp-pick" data-id="${i}">
      <i class="fa-solid ${it.icon}" ${it.color ? `style="color:${it.color}"` : ''}></i>
      <span class="l">${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</div>`;
  });
  pop.innerHTML = html;
  pop.hidden = false;
}

function pickMention(i) {
  const idx = i != null ? i : (popCtx ? popCtx.active : 0);
  const it = popCtx && popCtx.items[idx];
  const ta = $('#chatInput');
  if (!it || !ta) return;
  const upto = ta.value.slice(0, ta.selectionStart);
  const rest = ta.value.slice(ta.selectionStart);
  const cut = upto.replace(/([@#/])[\w-]*$/, '');
  const d = draft();
  if (it.kind === 'agent') {
    d.agent = it.label; // routes THIS conversation — scoped to the draft, never global
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
  const payload = { text: text || '(context attached)', tags: d.chips.slice(), agent: draftAgent(), planArmed: !!d.planArmed, temp: !!d.temp };
  delete composer.drafts[draftKey()];
  return payload;
}

function renderChat() {
  const found = findConv(state.convId);
  if (!found) return renderHub();
  const { conv, proj, temporary } = found;
  const msgs = conv.messages.map((m, i) => (conv.newFrom === i ? '<div class="newrule"><span class="n">New</span></div>' : '') + msgHtml(m, i)).join('');
  /* T1 escalation — UNGROUPED chats only, never inside a project chat */
  const escCard = !proj && !temporary && conv.messages.length >= 4 && !conv.escDismissed
    ? `<div class="esc-card"><i class="fa-solid fa-folder-plus"></i><div class="t"><b>Create a project from this chat?</b><span class="d">Context is accumulating here — a project gives its memory and artifacts a shared home your team can join.</span></div>
       <button class="btn sm" data-act="esc-create">Create project</button><button class="btn secondary sm" data-act="esc-dismiss">Not now</button></div>` : '';
  const banner = temporary
    ? `<div class="temp-banner"><i class="fa-solid fa-ghost"></i><span><strong>Temporary</strong> — nothing here is saved, and stored memory won't be read or written.</span></div>` : '';
  const composerOrNotice = proj && !canEdit()
    ? `<div class="chat-composer"><div class="viewer-notice"><i class="fa-solid fa-eye"></i>View access — you can read this conversation. Ask Alex Morgan for edit access to join in.</div></div>`
    : composerHtml(proj, 'chatInput', temporary ? 'Ask anything — off the record…' : 'Message Sage…', 'chat-send');
  const chatEl = `<div class="chat">
    ${chatHeader({ proj, conv, title: conv.title, temporary })}
    <div class="chat-msgs"><div class="chat-col" id="msgCol">${banner}${msgs}${escCard}</div></div>
    ${composerOrNotice}
  </div>`;
  /* T3 Studio Split (D-S3) — artifact open = a state of the thread.
     WP6 mobile: full-screen takeover w/ fast flip-back (decision a). */
  const studioA = state.studioId && proj ? artifact(proj, state.studioId) : null;
  /* WP6 mobile rail (decision b): quiet pinned strip at rest → sheet on tap */
  const liveRun = proj && (conv.messages.some((m) => m.plan && m.plan.status === 'approved' && m.plan.exec.length && m.plan.exec.some((x) => x.state !== 'done')) || proj.workflows.some((w) => w.state === 'running'));
  const runStrip = liveRun && !state.companion
    ? '<div class="run-strip" data-act="toggle-companion" role="button"><i class="fa-solid fa-circle-notch spin"></i> Working now — tap to follow the run</div>' : '';
  let layout = null;
  if (studioA) layout = `<div class="chat-wrap studio">${chatEl}<aside class="studio-pane"><div class="studio-back" data-act="studio-close"><i class="fa-solid fa-arrow-left"></i> Back to chat</div>${viewerHtml(proj, studioA, { compact: true })}</aside>${proj && state.companion ? companionHtml(proj) : ''}</div>`;
  else if (proj && state.companion) layout = `<div class="chat-wrap">${chatEl}${companionHtml(proj)}</div>`;
  $('#main').innerHTML = viewAsStrip() + runStrip + (layout || chatEl);
  const col = $('.chat-msgs');
  if (state.jumpTo != null && col) {
    const elm = $(`[data-mi="${state.jumpTo}"]`);
    if (elm) {
      col.scrollTop = elm.getBoundingClientRect().top - col.getBoundingClientRect().top + col.scrollTop - 90;
      elm.classList.add('flash');
      setTimeout(() => elm.classList.remove('flash'), 1200);
    }
    state.jumpTo = null;
  } else if (col) col.scrollTop = col.scrollHeight;
  const inp = $('#chatInput'); if (inp) inp.focus();
}

function renderNewChat() {
  const p = project(state.projectId);
  const intro = p
    ? `Working inside ${p.name} — I'll use this project's ${p.memory.length} notes and keep anything we learn here.`
    : `No project — this starts in Ungrouped. Move it into a project later if it grows into something.`;
  const chatEl = `<div class="chat">
    ${chatHeader({ proj: p, title: 'New conversation', temporary: false })}
    <div class="chat-msgs"><div class="chat-col">
      ${msgHtml({ who: 'Sage', text: intro }, 0)}
    </div></div>
    ${composerHtml(p, 'chatInput', p ? `Ask anything in ${p.name} — @ agents · # records · / skills` : 'Message Sage — @ agents · # records · / skills', 'new-send')}
  </div>`;
  $('#main').innerHTML = p && state.companion ? `<div class="chat-wrap">${chatEl}${companionHtml(p)}</div>` : chatEl;
  $('#chatInput').focus();
}

/* ---------- Agent simulation ---------- */
const REMEMBER_RX = /\b(always|never|prefer|from now on|remember)\b/i;

function normalizePayload(payload) {
  return typeof payload === 'string' ? { text: payload, tags: [], agent: AGENTS[0], planArmed: false } : payload;
}

function agentRespond(conv, p, payload) {
  const { text, tags = [], agent = AGENTS[0], planArmed = false } = normalizePayload(payload);
  const who = agent.name;
  const skillTag = tags.find((t) => t.kind === 'skill');

  if (who === 'Skip') {
    conv.messages.push({ who, when: 'now', dur: '0:02', text: `Handled remotely — I run my own loop, so plan mode and skills are delegated to my side (D15). ${p ? `I received ${p.name}'s context bag: description and recent artifacts (project notes join the bag in P1.9).` : 'No project context attached.'}` });
    return;
  }
  if (planArmed) {
    conv.messages.push({ who, text: '', plan: { status: 'pending', steps: [
      'Pull the relevant data and current state',
      p ? 'Draft the analysis with project memory applied' : 'Draft the analysis from org-wide data',
      p ? 'Save the output to this project\'s artifacts' : 'Return the result here',
    ], exec: [] } });
    return;
  }
  if (/\bfail\b/i.test(text)) {
    conv.messages.push({ who, when: 'now', error: true, text: 'That didn\'t work — the data source timed out before I could finish.', retryText: text.replace(/\bfail\b/ig, '').trim() || 'try again' });
    return;
  }
  if (REMEMBER_RX.test(text) && p) {
    const note = text.replace(/^please\s+/i, '').replace(/^remember\s+(that\s+)?/i, '');
    const clean = note[0].toUpperCase() + note.slice(1).replace(/\.*$/, '.');
    const id = 'prov' + Date.now();
    p.memory.unshift({ id, text: clean, scope: 'All agents', status: 'provisional', src: `${who} · ${conv.title}`, when: 'now' });
    conv.messages.push({ who, when: 'now', dur: '0:02', text: 'Got it — noted for this project.', remembered: clean, memId: id });
    return;
  }
  const recordTags = tags.filter((t) => t.kind === 'record');
  const recordNote = recordTags.length ? ` I've loaded ${recordTags.map((t) => t.label).join(' and ')} as context.` : '';
  const msg = { who, when: 'now', dur: '0:04', text: `On it — and since we're in ${p ? p.name : 'no project'}, ${p ? 'outputs will be filed here.' : 'I\'m answering from org-wide data only.'}${recordNote}` };
  if (p && p.memory.length) msg.memoryUsed = Math.min(2, p.memory.length);
  if (skillTag) { msg.skill = skillTag.label; msg.skillColor = skillTag.color; }
  conv.messages.push(msg);
}

function startTemporaryChat(payload) {
  DATA.temporary.messages = [{ who: 'user', text: payload.text, tags: payload.tags }, { who: 'Sage', text: '…', thinking: true }];
  Object.assign(state, { view: 'chat', convId: 'tmp', projectId: null });
  render();
  setTimeout(() => {
    DATA.temporary.messages.pop();
    DATA.temporary.messages.push({ who: 'Sage', text: 'Answering off the record — nothing saved, no memory read or written.' });
    render();
  }, 800);
}

function createConversation(p, payload) {
  const { text, tags, agent, planArmed } = normalizePayload(payload);
  const id = 'new' + Date.now();
  const conv = { id, title: text.split(' ').slice(0, 5).join(' '), summary: `${agent ? agent.name : 'Sage'} · just now`, when: 'now',
    messages: [{ who: 'user', text, tags, when: 'now' }, { who: agent ? agent.name : 'Sage', text: '…', thinking: true }] };
  if (p) p.conversations.unshift(conv);
  else DATA.ungrouped.unshift(conv); // no project — first-run / ungrouped sends land here
  state.view = 'chat'; state.convId = id;
  render();
  setTimeout(() => {
    conv.messages.pop();
    agentRespond(conv, p, { text, tags, agent, planArmed });
    let named = text.split(' ').slice(0, 4).map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
    const siblings = (p ? p.conversations : DATA.ungrouped).filter((c) => c.id !== conv.id);
    let n = 2;
    while (siblings.some((c) => c.title === named)) named = named.replace(/ · \d+$/, '') + ' · ' + n++;
    conv.title = named;
    render();
    toast(`Named by ${agent ? agent.name : 'Sage'}: "${named}"`);
  }, 900);
}

function appendChatMessage(payload) {
  const found = findConv(state.convId);
  if (!found) return;
  const { conv, proj, temporary } = found;
  delete conv.newFrom;
  const norm = normalizePayload(payload);
  for (const m of conv.messages) if (m.plan && m.plan.status === 'pending') m.plan.status = 'stale';
  conv.messages.push({ who: 'user', text: norm.text, tags: norm.tags, when: 'now' });
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
  m.plan.exec = m.plan.steps.map((s) => ({ text: s, state: 'wait' }));
  /* T2 — the rail is EARNED: slides in when the run goes live (D-S1) */
  state.companion = true; state.railMode = 'context'; state.railKeep = false;
  render();
  toast('Plan approved — running · the Companion Rail follows the run');
  let i = 0;
  const tick = () => {
    if (m.plan.status !== 'approved') return; // canceled mid-run
    if (i > 0) m.plan.exec[i - 1].state = 'done';
    if (i < m.plan.exec.length) { m.plan.exec[i].state = 'run'; i++; render(); setTimeout(tick, 700); }
    else {
      let artId = null;
      if (found.proj) {
        artId = 'a' + Date.now();
        found.proj.artifacts.unshift({ id: artId, title: 'Chapter renewal analysis', icon: 'fa-regular fa-file-lines', kind: 'Document', collections: [],
          versions: [{ v: 1, when: 'now', by: 'Sage', note: 'Produced by the approved plan run' }] });
      }
      const done = { who: 'Sage', when: 'now', text: 'Done — analysis complete, output saved to this project\'s artifacts.' };
      if (artId) done.artifactId = artId;
      found.conv.messages.push(done);
      render();
      if (!state.railKeep) setTimeout(() => {
        if (!state.railKeep && state.companion) { state.companion = false; render(); toast('Run finished — the rail tucked away ("Keep open" holds it)'); }
      }, 1600);
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
  p.memory.push({ id, text: 'New note…', scope: 'All agents', status: 'active', src: 'Alex · added manually', when: 'now' });
  render();
  startMemoryEdit(id);
}

/* WP4 — rating dialog facsimile (1–10 pips · comment · one-time consent that
   grants reviewer access — honest copy per GAPLIST 1.8) */
function openRating() {
  const pips = Array.from({ length: 10 }, (_, i) => `<button class="pip" data-pip="${i + 1}">${i + 1}</button>`).join('');
  $('#ratingBody').innerHTML = `
    <p class="confirm-text" style="margin:0 0 10px">How useful was this reply?</p>
    <div class="pips" id="pips">${pips}</div>
    <label class="f-label" for="rateComment">Comment <span class="opt">optional</span></label>
    <textarea class="f-input" id="rateComment" rows="3" placeholder="What worked, what didn't…"></textarea>
    ${state.ratingConsented ? '' : '<label class="consent"><input type="checkbox" id="rateConsent"> Sharing a rating gives the review team read access to this conversation. One-time consent.</label>'}
    <div class="modal-actions"><button class="btn" id="rateSubmit" disabled>Submit</button><button class="btn secondary" data-act="share-done">Cancel</button></div>`;
  openModal('ratingModal');
}

/* ---------- Paperwork — the artifact carries its own deliverables (exit criteria 3–4) ---------- */
const PAPER = {
  changelog: `<h3>2026-07-22 · all sessions</h3><ul>
<li><b>S1 · WP1 + S1</b> — two-path sidebar (nav + Pinned/Recents, no counts), 9-view routing, MJE light chrome, Settings slide-in (Show Projects → F0x, density, default agent, appearance), F0 teaching line, user bubbles (position 13 reversed).</li>
<li><b>S2 · F1 + W0a</b> — Front Door composer + three earned sections; Chats surface: filter, by-project/flat, select mode + bulk delete, drag-to-group (DnD's ratified new home), row menus.</li>
<li><b>S3 · Room + WP3</b> — four ratified tabs, Overview panels w/ Runs fold (P5), memory ledger table, artifacts grid; run-driven rail (⚖7: replaces floating panels, cancel-run in rail); Studio Split w/ shipped tab set (⚖3); artifacts modal folded (⚖8); escalation card (ungrouped only); scope-at-capture; Refresh agent cache → Settings (⚖10). FUTURE tags removed in-UI by Matt's order — this log is the ratify-or-strike record.</li>
<li><b>S4 · WP4 thread</b> — complete message row per §C2 (quiet meta line, run inspector w/ earlier-message actions, last-message footer, command chips, artifact cards, form pills, attachment chips, mentions, inline edit); rating 1–10 + one-time consent; header consolidation (GAPLIST 1.6); heavy-state sweep (20-msg thread, 12-version history).</li>
<li><b>S5–6 · W2 + W3</b> — Collections at Finder parity (breadcrumb drop targets, folders, origin chips, grid/list+sort, search, select, staging shelf, drag-move, right-click menus, open-source-conversation, cascade share); Routines harvest (Scheduled/Monitoring, Run now, pause, detail w/ schedule editor + history). Viewer: version dropdown + Options menu.</li>
<li><b>S7 · WP6 mobile</b> — decision (a) Studio Split = full-screen takeover w/ flip-back; decision (b) rail = progress strip → bottom sheet; drawer nav sweep per Explorer conventions; manifest breakpoint column filled.</li>
<li><b>S8 · review fixes</b> — Analyze restored to the viewer menu (shipped parity; Remix stays); Working-now strip + rail reachable over Studio Split (cancel-run per ⚖7); read-status demos complete (New-rule jump, quiet dots, "last here" line); follows-latest pins in W2; paperwork embedded here; state map re-keyed (PA1–3 personas, room-runs); flat logo mark; Settings stays open on toggle; zero external hosts.</li></ul>
<p class="pp-note">Full prose changelog, proposals 1–11, and ⚖ resolutions: hub-prototype/CHANGELOG.md alongside the source.</p>`,
  manifest: `<table><tr><th>Region</th><th>Declaration</th><th>Breakpoint (≤820px)</th></tr>
<tr><td>Sidebar (nav · pinned/recents · filter · teach)</td><td>MOCKUP-SPEC</td><td>drawer slide-over (parity floor)</td></tr>
<tr><td>Front Door (hero · 3 earned sections · states)</td><td>MOCKUP-SPEC</td><td>1-col reflow</td></tr>
<tr><td>S1 Settings slide-in</td><td>MOCKUP-SPEC</td><td>full-width sheet</td></tr>
<tr><td>W0a Chats · W0b Projects</td><td>MOCKUP-SPEC</td><td>1-col; toolbars wrap</td></tr>
<tr><td>Room: header · 4 tabs · Overview panels · Runs</td><td>MOCKUP-SPEC</td><td>1-col; tabs h-scroll</td></tr>
<tr><td>P3 memory ledger</td><td>MOCKUP-SPEC</td><td>h-scroll table</td></tr>
<tr><td>W2 Collections (whole surface)</td><td>MOCKUP-SPEC · share/save pickers → MOUNT <code>mj-resource-share-dialog</code>, save-to-collection picker</td><td>1-col + shelf bar</td></tr>
<tr><td>W3 Routines list + detail</td><td>MOCKUP-SPEC · run execution → MOUNT runtime</td><td>1-col</td></tr>
<tr><td>Composer</td><td>MOUNT → <code>ng-composer</code> + trigger providers (visual-parity facsimile)</td><td>full-bleed</td></tr>
<tr><td>Message internals (markdown · streaming · forms · attachments)</td><td>MOUNT → <code>message-list/-item</code>; placement + density MOCKUP-SPEC</td><td>always-visible actions</td></tr>
<tr><td>Artifact viewer pane</td><td>MOUNT → <code>mj-artifact-viewer-panel</code> + <code>component-artifact-viewer</code> plugin (tab set is metadata-driven per artifact type); scale/placement MOCKUP-SPEC</td><td>takeover w/ flip-back (decision a)</td></tr>
<tr><td>Companion Rail choreography (+ Working-now strip)</td><td>MOCKUP-SPEC</td><td>strip → bottom sheet (decision b)</td></tr>
<tr><td>Rating · export · share dialogs</td><td>MOUNT (facsimiles at truthful density)</td><td>near-full-width</td></tr>
<tr><td>Voice stack</td><td>MOUNT (out of frame · #3111)</td><td>—</td></tr></table>
<p class="pp-note">Zero undeclared regions. ⚖ resolutions this build: ⚖3 shipped tabs · ⚖7 rail replaces floating panels · ⚖8 modal folded · ⚖10 Settings row.</p>`,
  placement: `<h3>Sidebar</h3><p>New conversation + temporary · filter · pinned · recents w/ scope dots: <b>at rest</b>. Row time → <b>consolidated</b> (FD cards, W0a). Row menu/multi-select/DnD → <b>consolidated into W0a</b>. Project tree → <b>consolidated</b> (W0b + Rooms; nesting ⚖1). Notification counts → <b>deleted-on-record</b> (quiet dot + New). Routines count badge → <b>deleted-on-record</b>.</p>
<h3>Front Door</h3><p>Composer w/ all triggers/plan/temporary: <b>at rest</b>. Needs-you · Continue · Ran-overnight: <b>at rest, earned</b>. Starters/teaching: <b>at rest (F0 only)</b>. Opt-out re-entry cue: session-3 read-status batch, untagged.</p>
<h3>Chat header (GAPLIST 1.6, decided against the list)</h3><p>Title · breadcrumb · gauge: <b>at rest</b>. Shared-by · test-run: <b>at rest, quiet</b>. Pinned messages: <b>earned icon → panel</b>. Members/artifact chips: <b>consolidated</b> (Room avatars/share; T3+P4 per ⚖8). Agent/mode pickers: <b>consolidated into composer</b>. Rename/Move/Pin/Share/Export/Delete: <b>overflow menu</b> (dialogs MOUNT). Project-tag folder CRUD: waits on ⚖1.</p>
<h3>Message row (§C2)</h3><p>Meta line (notes · steps · cost · Inspect): <b>at rest</b>. Last-message footer pin/rate/delete: <b>at rest</b>. Earlier-message actions: <b>in gear panel</b>. Rating-count badge → <b>consolidated into "Rated N/10" pill</b> (no-badges). Command chips · artifact cards · form pills · mentions · file chips · (edited): <b>at rest</b>. Inline edit: <b>hover</b>. Image grid/fullscreen: <b>MOUNT</b> (GAPLIST 2.10). Shift+click diagnostics: <b>deleted-on-record</b> (dev tool).</p>
<h3>Room</h3><p>Overview panels (since-you-left · Runs · conversations · needs-you · memory · artifacts): <b>at rest, earned</b>. Workflows tab → <b>consolidated</b> (Runs section + history). Members tab → <b>consolidated</b> (avatars → share modal). Ledger: scope select · provenance · provisional review: <b>at rest</b>; edit/forget: <b>hover</b>; org-wide forget <b>warns</b>. P2 select → <b>consolidated into W0a</b>.</p>
<h3>W2 Collections (GAPLIST 2.2)</h3><p>Breadcrumb drop targets · grid/list+sort · search · select · shelf · drag-move · origin chips · follows-latest pins · open-source-conversation: <b>at rest</b>. Context menus: <b>right-click</b>. Share w/ cascade: <b>at rest</b> (roles = MOUNT). Pagination: <b>deleted-on-record</b> at mockup scale (CONTRACT keeps 50/pg). Keyboard ranges: MOUNT nicety.</p>
<h3>W3 Routines</h3><p>Segments · Run now · pause · detail editor · history → conversations: <b>at rest</b>. Project-agnostic per boundary 3.</p>
<h3>Shell</h3><p>Tasks: <b>deleted-on-record</b> (D-S6). ⌘K/search: omnibar lane (⚖5). Overlay · deep links · host gates: CONTRACT class (ledger §C).</p>`,
};

function openPaper(kind) { state.paperOpen = kind; renderPaper(); }
function renderPaper() {
  const open = !!state.paperOpen;
  $('#paperScrim').classList.toggle('on', open);
  const p2 = $('#paperPanel');
  p2.hidden = !open;
  if (!open) return;
  const titles = { changelog: 'Changelog — 2026-07-22', manifest: 'Reuse manifest (cumulative)', placement: 'Placement accounts' };
  p2.innerHTML = `<header class="set-head"><span class="n">${titles[state.paperOpen]}</span><button class="iconbtn" data-act="paper-close" title="Close (Esc)"><i class="fa-solid fa-xmark"></i></button></header><div class="paper-body">${PAPER[state.paperOpen]}</div>`;
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
    desc.innerHTML = `<input class="f-input" style="font-size:12.5px" value="${esc(p.desc)}" placeholder="One line on what this project is for — agents read it">`;
    const input = $('input', desc); input.focus();
    const commit = () => { p.desc = input.value.trim(); render(); if (p.desc) toast('Description updated — agents read this'); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    input.addEventListener('blur', commit);
  },
  'proj-delete': () => {
    const p = project(state.projectId);
    openChoice(`Remove "${p.name}"?`,
      `Archive keeps everything and gets it out of your way — restore any time. Delete moves its ${p.conversations.length} conversations to Ungrouped, keeps artifacts available in Collections, and removes project memory.`,
      [
        { label: 'Archive', cls: 'btn', fn: () => archiveProject(p.id) },
        { label: 'Delete', cls: 'btn danger', fn: () => deleteProject(p.id) },
        { label: 'Cancel', cls: 'btn secondary', fn: () => {} },
      ]);
  },
  'proj-edit': () => openProjectModal(state.projectId),
  'conv-move': () => openMove(),
  'conv-pin': () => toast('Pinned (prototype stub)'),
  'conv-rename': () => {
    const found = findConv(state.convId);
    if (!found) return;
    openModal('convModal');
    $('#cmName').value = found.conv.title;
    $('#cmDesc').value = found.conv.summary || '';
    setTimeout(() => { $('#cmName').focus(); $('#cmName').select(); }, 50);
  },
  'conv-delete': () => {
    const found = findConv(state.convId);
    if (!found) return;
    openConfirm(`Delete "${found.conv.title}"?`, 'The conversation and its messages are removed. Memory it created stays with the project (notes belong to the project, not the conversation).', () => {
      detachConv(state.convId);
      Object.assign(state, { view: 'room', convId: null });
      render(); toast('Conversation deleted — its notes remain in project memory');
    });
  },
  /* W0a row menu — acts on the row's conversation, not the open one */
  'row-rename': (id) => {
    state.renameId = id;
    const f = findConv(id);
    if (!f) return;
    openModal('convModal');
    $('#cmName').value = f.conv.title;
    $('#cmDesc').value = f.conv.summary || '';
    setTimeout(() => { $('#cmName').focus(); $('#cmName').select(); }, 50);
  },
  'row-move': (id) => openMove(id),
  'row-pin': () => toast('Pinned (prototype stub)'),
  'row-delete': (id) => {
    const f = findConv(id);
    if (!f) return;
    openConfirm(`Delete "${f.conv.title}"?`, 'The conversation and its messages are removed. Memory it created stays with the project.', () => {
      detachConv(id);
      if (state.convId === id) Object.assign(state, { view: 'chats', convId: null });
      render(); toast('Conversation deleted — its notes remain in project memory');
    });
  },
  'conv-share': () => {
    const f = findConv(state.convId);
    if (f && f.proj) openShare('project');
    else toast('Conversation share — mounts the generic resource-share dialog (email · View/Edit/Owner)');
  },
  'conv-export': () => openChoice('Export conversation',
    'Markdown, JSON, HTML, or plain text — with include-messages / metadata options. The shipped export dialog mounts here.', [
      { label: 'Markdown', cls: 'btn secondary', fn: () => toast('Exported as Markdown (facsimile — shipped dialog mounts)') },
      { label: 'JSON', cls: 'btn secondary', fn: () => toast('Exported as JSON (facsimile)') },
      { label: 'HTML', cls: 'btn secondary', fn: () => toast('Exported as HTML (facsimile)') },
      { label: 'Cancel', cls: 'btn secondary', fn: () => {} },
    ]),
  'pin-jump': (arg) => { state.jumpTo = Number(arg); render(); },
  /* viewer Options dropdown */
  'm-art-edit': () => { state.editingArtifact = true; state.viewerTab = 'Display'; render(); },
  'm-art-collect': () => toast('Save to collection — the shipped picker (multi-select, inline create) mounts here'),
  'm-art-share': () => openShare('artifact', state.artifactId),
  'm-art-analyze': () => { const p2 = project(state.projectId); const a = artifact(p2, state.artifactId); if (!a) return;
    Object.assign(state, { studioId: null });
    createConversation(p2, { text: `Analyze ${a.title} — what stands out in the current data?`, tags: [{ kind: 'artifact', label: a.title, icon: 'fa-cube' }], agent: AGENTS[0], planArmed: false });
    toast('Analysis started from the artifact\'s state snapshot'); },
  'm-art-remix': () => { const a = artifact(project(state.projectId), state.artifactId); if (!a) return;
    Object.assign(state, { studioId: null });
    createConversation(project(state.projectId), `Remix ${a.title} — new direction`);
    toast('Remixed into a new conversation — original untouched'); },
  /* W2 context menus */
  'ctx-open': (id) => { const b = $(`[data-act="coll-item-open"][data-id="${id}"], [data-drag-coll-item="${id}"]`); const f2 = findCollItem(id);
    if (f2 && f2.it.artId && f2.it.fromProj) { Object.assign(state, { view: 'artifact', projectId: f2.it.fromProj, artifactId: f2.it.artId, artifactVersion: null, editingArtifact: false, viewerTab: 'Display' }); render(); }
    else toast('Facsimile preview — the artifact viewer (MOUNT) opens here'); },
  'ctx-src': (id) => { const f2 = findCollItem(id);
    if (f2 && f2.it.srcConv) { const fc = findConv(f2.it.srcConv); Object.assign(state, { view: 'chat', convId: f2.it.srcConv, projectId: fc && fc.proj ? fc.proj.id : null, studioId: null }); render(); }
    else toast('Origin conversation lives outside the seeded projects'); },
  'ctx-shelf': (id) => { const f2 = findCollItem(id); if (!f2) return;
    state.shelf.push(f2.it); f2.c.items = f2.c.items.filter((x) => x.id !== id);
    render(); toast('On the shelf — open another collection and "Move here"'); },
  'ctx-remove': (id) => { const f2 = findCollItem(id); if (!f2) return;
    openConfirm(`Remove "${f2.it.title}" from "${f2.c.name}"?`, 'The artifact stays with its origin project — only the curation is removed.', () => {
      f2.c.items = f2.c.items.filter((x) => x.id !== id); render(); toast('Removed — original untouched'); }); },
  'coll-open-menu': (id) => { Object.assign(state, { collId: id, collSelect: false }); render(); },
  'coll-rename': (id) => { const c2 = coll(id); if (!c2) return;
    state.renameCollId = id;
    $('#cmHead').textContent = 'Rename collection';
    openModal('convModal');
    $('#cmName').value = c2.name; $('#cmDesc').value = c2.desc || '';
    setTimeout(() => { $('#cmName').focus(); $('#cmName').select(); }, 50); },
  'coll-share-menu': (id) => openShare('collection', null, id),
  'coll-delete': (id) => { const c2 = coll(id); if (!c2) return;
    openConfirm(`Delete "${c2.name}"?`, 'Sub-folders move up a level; its artifacts go to the staging shelf so nothing is lost. Originals stay with their projects.', () => {
      for (const ch of collChildren(id)) ch.parent = c2.parent;
      state.shelf.push(...c2.items);
      DATA.collections = DATA.collections.filter((x) => x.id !== id);
      if (state.collId === id) state.collId = c2.parent;
      render(); toast(`"${c2.name}" deleted — ${c2.items.length ? 'its items are on the shelf' : 'nothing was inside'}`); }); },
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
    const d = draft();
    d.agent = name; // per-conversation, never global
    const ta = $('#chatInput'); if (ta) d.text = ta.value;
    render();
    if (name === 'Skip') toast('Remote agent for THIS conversation — plan mode and skills are delegated (D15)');
  },
  'set-mode': (mode) => {
    composer.mode = mode;
    const ta = $('#chatInput'); if (ta) draft().text = ta.value;
    render();
    toast(`${mode} mode — ${mode === 'Draft' ? 'fast + cheap' : mode === 'High' ? 'slow + thorough' : 'the default balance'}`);
  },
};

/* ---------- Modals ---------- */
function openProjectModal(editId) {
  const p = editId ? project(editId) : null;
  pmSel.editing = editId;
  pmSel.icon = p ? p.icon : 'fa-folder';
  pmSel.color = p ? p.color : '';
  $('#pmTitle').textContent = p ? 'Edit project' : 'New project';
  $('#pmCreate').textContent = p ? 'Save' : 'Create project';
  openModal('projectModal');
  $('#pmName').value = p ? p.name : '';
  $('#pmDesc').value = p ? p.desc : '';
  document.querySelectorAll('#pmIcons .pm-ic').forEach((b) => b.classList.toggle('sel', b.dataset.id === pmSel.icon));
  document.querySelectorAll('#pmColors .pm-sw').forEach((b) => b.classList.toggle('sel', b.dataset.id === pmSel.color));
  setTimeout(() => $('#pmName').focus(), 50);
}

let modalOpener = null;
function openModal(which) {
  modalOpener = document.activeElement;
  $('#scrim').classList.add('on');
  const m = $('#' + which);
  m.hidden = false;
  const f = m.querySelector('input, button'); if (f) f.focus();
}
function closeModals() {
  $('#scrim').classList.remove('on');
  for (const id of ['shareModal', 'projectModal', 'moveModal', 'confirmModal', 'convModal', 'ratingModal']) $('#' + id).hidden = true;
  state.moveConvPending = null;
  state.moveSrcId = null;
  state.renameId = null;
  hideMenu();
  if (modalOpener && document.contains(modalOpener)) modalOpener.focus();
  modalOpener = null;
}

function openChoice(title, text, buttons) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  const wrap = $('#confirmModal .modal-actions');
  wrap.innerHTML = buttons.map((b, i) => `<button class="${b.cls}" data-choice="${i}">${esc(b.label)}</button>`).join('');
  wrap.querySelectorAll('[data-choice]').forEach((el) =>
    el.addEventListener('click', () => { closeModals(); buttons[Number(el.dataset.choice)].fn(); }));
  openModal('confirmModal');
}

function archiveProject(id) {
  const p = project(id);
  DATA.projects = DATA.projects.filter((x) => x.id !== id);
  DATA.archived.push(p);
  Object.assign(state, { view: 'room', projectId: DATA.projects[0] ? DATA.projects[0].id : null, tab: 'overview', convId: null });
  render();
  toast(`"${p.name}" archived`, { label: 'Undo', fn: () => restoreProject(id) });
}

function restoreProject(id) {
  const i = DATA.archived.findIndex((x) => x.id === id);
  if (i < 0) return;
  const p = DATA.archived.splice(i, 1)[0];
  DATA.projects.push(p);
  Object.assign(state, { view: 'room', projectId: id, tab: 'overview', convId: null });
  render();
  toast(`"${p.name}" restored`);
}

function deleteProject(id) {
  const p = project(id); // conversations move to Ungrouped; artifacts survive in Collections
  DATA.ungrouped.push(...p.conversations);
  DATA.projects = DATA.projects.filter((x) => x.id !== id);
  const undo = { p, convIds: p.conversations.map((c) => c.id) };
  Object.assign(state, { view: 'room', projectId: DATA.projects[0] ? DATA.projects[0].id : null, tab: 'overview', convId: null });
  render();
  toast(`"${p.name}" deleted — conversations moved to Ungrouped, artifacts stay in Collections`, {
    label: 'Undo', fn: () => {
      DATA.ungrouped = DATA.ungrouped.filter((c) => !undo.convIds.includes(c.id));
      undo.p.conversations = undo.p.conversations;
      DATA.projects.push(undo.p);
      Object.assign(state, { view: 'room', projectId: undo.p.id, tab: 'overview' });
      render(); toast(`"${undo.p.name}" restored`);
    },
  });
}

let confirmFn = null;
function openConfirm(title, text, fn) {
  openChoice(title, text, [
    { label: 'Delete', cls: 'btn danger', fn },
    { label: 'Cancel', cls: 'btn secondary', fn: () => {} },
  ]);
}

let shareContext = { type: 'project', artifactId: null, collId: null };
function renderShare() {
  const p = project(state.projectId) || DATA.projects[0] || { members: [] };
  const isArtifact = shareContext.type === 'artifact';
  const isColl = shareContext.type === 'collection';
  const a = isArtifact ? artifact(p, shareContext.artifactId) : null;
  $('#shareTitle').textContent = isArtifact ? `Share "${a.title}"` : isColl ? `Share "${(coll(shareContext.collId) || {}).name}"` : 'Share project';

  const rows = p.members.map((m, i) =>
    `<div class="share-row"><span class="avatar" style="background:${m.color}">${m.init}</span><span class="nm">${esc(m.name)}</span>
     <span class="role-cluster">${
      m.role === 'Owner'
        ? '<span class="role">Owner</span>'
        : `<select class="f-select" data-member-role="${i}"><option ${m.role === 'Viewer' ? 'selected' : ''}>Viewer</option><option ${m.role === 'Editor' ? 'selected' : ''}>Editor</option></select>
           <button class="iconbtn" data-act="member-remove" data-id="${i}" title="Remove from project"><i class="fa-solid fa-user-minus"></i></button>`
    }</span></div>`).join('');
  const add = `<div class="share-add">
      <input class="f-input" id="shareInput" placeholder="Name or email…">
      <select class="f-select" id="shareRole"><option>Viewer</option><option>Editor</option></select>
      <button class="btn sm" data-act="share-invite">Invite</button></div>`;

  let pub = '';
  if (isArtifact) {
    pub = state.canPublish
      ? `<div class="pub-sect">
          <div class="pub-row"><button class="tgl ${a.publicLink ? 'on' : ''}" role="switch" aria-checked="${!!a.publicLink}" data-act="pub-toggle"></button>
            <span class="t">Public link</span><span class="s">anyone with the link · read-only</span></div>
          ${a.publicLink ? `<div class="pub-url"><input class="f-input" readonly value="https://app.example.org/a/${a.id}?t=mj_r3ad0nly…"><button class="btn secondary sm" data-act="pub-copy">Copy</button></div>
          <p class="share-note">Server-minted, single-artifact scope, read-only (Magic Links). Revoke by turning off.</p>` : ''}
        </div>`
      : `<div class="pub-sect"><p class="share-note"><i class="fa-solid fa-lock" style="margin-right:6px"></i>Public link is hidden — you don't hold "Can Publish Artifacts Publicly". No dead-end toggle (D11). Flip the demo privilege in the state map to see it.</p></div>`;
  } else if (isColl) {
    pub = `<p class="share-note">Sharing a collection cascades to everything inside — members get the same role on every folder and artifact. Grant-only-what-you-have applies.</p>`;
  } else {
    pub = `<p class="share-note">Members see everything in this project — conversations, memory, and artifacts.</p>`;
  }

  $('#shareBody').innerHTML = rows + add + pub + `<div class="modal-actions"><button class="btn" data-act="share-done">Done</button></div>`;
}

function openShare(type, artifactId, collId) {
  shareContext = { type, artifactId: artifactId || null, collId: collId || null };
  renderShare();
  openModal('shareModal');
}

function inviteMember() {
  const p = project(state.projectId);
  const input = $('#shareInput');
  const name = input.value.trim();
  if (!name) return;
  const err = $('#shareErr'); if (err) err.remove();
  if (!name.includes(' ') && !name.includes('@')) {
    input.insertAdjacentHTML('afterend', `<p class="f-error" id="shareErr">Couldn't find "${esc(name)}" — use a full name or an email address.</p>`);
    return;
  }
  const wasSparse = !isGrown(p);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#7C3AED', '#16A34A', '#D97706', '#DB2777'];
  p.members.push({ init: initials, color: colors[p.members.length % colors.length], name, role: $('#shareRole').value });
  renderShare(); renderSidebar();
  if (state.view === 'hub') renderHub();
  toast(wasSparse ? `${name} joined — the hub just grew tabs (growth contract)` : `${name} joined`);
}

function openMove(srcId) {
  const id = srcId || state.convId;
  const found = findConv(id);
  if (!found || !found.conv) return;
  state.moveSrcId = id;
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

function moveConvTo(convId, targetId) {
  const conv = detachConv(convId);
  if (!conv) return false;
  if (targetId === '__none') DATA.ungrouped.unshift(conv);
  else { const t = project(targetId); if (!t) return false; t.conversations.unshift(conv); state.openProjects.add(targetId); }
  return true;
}

function moveConversation(targetId) {
  const srcId = state.moveSrcId || state.convId;
  if (!moveConvTo(srcId, targetId)) return;
  if (state.view === 'chat' && targetId !== '__none') state.projectId = targetId;
  state.moveSrcId = null;
  closeModals(); render();
  toast(targetId === '__none' ? 'Moved to Ungrouped' : `Moved to ${project(targetId).name}`);
}

function detachConv(id) {
  const found = findConv(id);
  if (!found) return null;
  const { conv, proj } = found;
  const pi = DATA.pinned.findIndex((c) => c.id === id);
  if (pi >= 0) { DATA.pinned.splice(pi, 1); return conv; }
  if (proj) proj.conversations = proj.conversations.filter((c) => c.id !== id);
  else DATA.ungrouped = DATA.ungrouped.filter((c) => c.id !== id);
  return conv;
}

function createProject() {
  const pendingConvId = state.moveConvPending;
  const name = $('#pmName').value.trim() || 'Untitled project';
  if (pmSel.editing) {
    const ep = project(pmSel.editing);
    if (ep) { ep.name = name; ep.desc = $('#pmDesc').value.trim(); ep.icon = pmSel.icon; ep.color = pmSel.color || ep.color; }
    pmSel.editing = null;
    closeModals(); render(); toast('Project updated');
    return;
  }
  const colors = ['#B794F6', '#68D391', '#F6AD55', '#FC8181', '#5CC0ED'];
  const p = {
    id: 'p' + Date.now(), name, icon: pmSel.icon, color: pmSel.color || colors[DATA.projects.length % colors.length],
    desc: $('#pmDesc').value.trim(),
    members: [{ init: 'AM', color: 'var(--mj-brand-primary)', name: 'Alex Morgan', role: 'Owner' }],
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

  Object.assign(state, { view: 'room', projectId: p.id, tab: 'overview', convId: null });
  render();
  toast('Project created — this is the just-created hub state (S3)');
}

/* ---------- Simulations ---------- */
function finishWorkflow() {
  const p = project('renewal');
  const wf = p.workflows.find((w) => w.state === 'running');
  if (!wf) { toast('Nothing running — already finished'); return; }
  Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview', convId: null });
  render();
  let pct = wf.pct;
  const tick = () => {
    pct = Math.min(100, pct + 8);
    wf.pct = pct; wf.meta = `Sage · step ${pct < 80 ? 3 : 4} of 4 · finishing`;
    render();
    if (pct < 100) setTimeout(tick, 350);
    else {
      wf.state = 'done';
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
  'view-editor', 'view-viewer', 'room-runs', 'flow-newrule', 'flow-archive', 'flow-activity', 'flow-error',
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
  /* Composed shell — session 1 (WP1 + S1). Full F/P/T/W re-key lands in session 5 (WP5). */
  'fd-canonical':     () => Object.assign(state, { view: 'frontdoor', convId: null, fdState: null, settingsOpen: false }),
  'fd-optout':        () => { state.showProjects = false; Object.assign(state, { view: 'frontdoor', convId: null, fdState: null }); render(); toast('"Show Projects" OFF — the F0x opt-out state · flip it back in Settings'); return 'noRender'; },
  'panel-settings':   () => { Object.assign(state, { view: 'frontdoor', convId: null, fdState: null }); state.settingsOpen = true; render(); return 'noRender'; },
  'surf-chats':       () => Object.assign(state, { view: 'chats', convId: null }),
  'surf-projects':    () => Object.assign(state, { view: 'projects', convId: null }),
  'surf-collections': () => Object.assign(state, { view: 'collections', convId: null }),
  'surf-routines':    () => Object.assign(state, { view: 'routines', convId: null }),
  'fd-loading':       () => { Object.assign(state, { view: 'frontdoor', fdState: 'loading', convId: null }); render(); setTimeout(() => { if (state.fdState === 'loading') { state.fdState = null; render(); } }, 1600); return 'noRender'; },
  'fd-error':         () => Object.assign(state, { view: 'frontdoor', fdState: 'error', convId: null }),
  /* Session 4 — WP4 thread fidelity */
  'flow-msgrow':      () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', studioId: null, inspectId: null }),
  'flow-inspector':   () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', studioId: null }); const f = findConv('c1'); state.inspectId = f.conv.messages.length - 1; },
  'flow-rate':        () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', studioId: null }); render(); const f = findConv('c1'); state.rateMsg = f.conv.messages.length - 1; openRating(); return 'noRender'; },
  'flow-artcard':     () => Object.assign(state, { view: 'chat', convId: 'c4', projectId: 'renewal', studioId: null }),
  'flow-formpill':    () => Object.assign(state, { view: 'chat', convId: 'c2', projectId: 'renewal', studioId: null }),
  'flow-testrun':     () => Object.assign(state, { view: 'chat', convId: 'c3', projectId: 'renewal', studioId: null }),
  'flow-pins':        () => { const f = findConv('c1'); if (f) f.conv.messages[1].pinned = true; Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', studioId: null }); render(); toast('Pinned messages earn the header thumbtack — click it for the panel'); return 'noRender'; },
  /* Sessions 5–6 — W2 full · W3 harvest */
  'coll-board':       () => Object.assign(state, { view: 'collections', collId: 'boardpack', convId: null, collSelect: false }),
  'flow-shelf':       () => { Object.assign(state, { view: 'collections', collId: 'boardpack', collSelect: true, convId: null }); render(); toast('Select cards → "Shelf (n)" → open another collection → "Move here"'); return 'noRender'; },
  'rout-detail':      () => Object.assign(state, { view: 'routines', routineId: 'r1', convId: null }),
  /* Read-status demo (D-S9 substrate, design of record) */
  'flow-newrule':     () => { const f = findConv('c2'); if (!f) return 'noRender';
    f.conv.newFrom = Math.max(1, f.conv.messages.length - 1);
    Object.assign(state, { view: 'chat', convId: 'c2', projectId: 'renewal', studioId: null }); render();
    toast('The "New" rule marks your last-read point — it clears when you reply'); return 'noRender'; },
  /* Paperwork — the artifact carries its own deliverables */
  'doc-changelog':    () => { openPaper('changelog'); return 'noRender'; },
  'doc-manifest':     () => { openPaper('manifest'); return 'noRender'; },
  'doc-placement':    () => { openPaper('placement'); return 'noRender'; },
  /* Session 3 — Room + WP3 */
  'flow-rail':        () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', companion: false, studioId: null }); render();
    const f = findConv('c1');
    if (!f.conv.messages.some((m) => m.plan && m.plan.status === 'pending'))
      f.conv.messages.push({ who: 'Sage', text: '', plan: { status: 'pending', steps: ['Pull renewal cohorts and current state', 'Draft outreach per segment with project memory applied', 'File results to this project\'s artifacts'], exec: [] } });
    render(); toast('Approve the plan — the Companion Rail slides in while the run is live'); return 'noRender'; },
  'flow-studio':      () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', studioId: 'a2', artifactId: 'a2', viewerTab: 'Display', artifactVersion: null, editingArtifact: false, companion: false }),
  'flow-escalate':    () => { const u = DATA.ungrouped.find((c) => c.id === 'u1');
    if (!u) { toast('That state needs seed data — switch to "Established user" (P1) first'); return 'noRender'; }
    if (u.messages.length < 4) u.messages.push(
      { who: 'user', text: 'Break the tiers down by member type.', when: 'now' },
      { who: 'Sage', when: 'now', dur: '0:03', text: 'Individual $195 (student $95, retired $120), Small org $850 up to 10 seats, Enterprise $2,400 unlimited. This thread is turning into ongoing work — see the suggestion below.' });
    delete u.escDismissed;
    Object.assign(state, { view: 'chat', convId: 'u1', projectId: null, studioId: null }); },
  'persona-est':      () => { setPersona('established'); return 'noRender'; },
  'persona-new':      () => { setPersona('firstrun'); return 'noRender'; },
  'persona-stress':   () => { setPersona('stress'); return 'noRender'; },
  'view-editor':      () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview', convId: null, viewAs: { name: 'Dana Kim', role: 'Editor' } }); render(); toast('Previewing as Dana — Editor: no share, no settings, no member management'); return 'noRender'; },
  'view-viewer':      () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview', convId: null, viewAs: { name: 'Ray Barnes', role: 'Viewer' } }); render(); toast('Previewing as Ray — Viewer: read everything, change nothing'); return 'noRender'; },
  'room-runs':        () => Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'runs' }),
  'flow-archive':     () => { Object.assign(state, { view: 'room', projectId: 'website', tab: 'overview', convId: null }); render(); MENU_ACTIONS['proj-delete'](); return 'noRender'; },
  'flow-activity':    () => {
    const p = project('renewal');
    p.conversations.unshift({ id: 'fresh' + Date.now(), fresh: true, title: 'Coastal save plan', summary: 'Dana · drafted overnight — needs your eyes', when: '2h',
      messages: [{ who: 'user', text: '(Dana) Draft a Coastal save plan.' }, { who: 'Sage', text: 'Coastal save plan drafted — usage-based win-back with a Q3 checkpoint.' }] });
    if (p.artifacts[0]) p.artifacts[0].fresh = true;
    Object.assign(state, { view: 'room', projectId: 'website', tab: 'overview', convId: null });
    render(); toast('Dana worked in Membership Renewal while you were away — fresh dots on Recents, the Front Door, and Projects');
    return 'noRender';
  },
  'flow-error':       () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); const ta = $('#chatInput'); ta.value = 'This will fail — run the renewal export'; draft().text = ta.value; toast('Send it — quiet error state with Retry'); return 'noRender'; },
  'hub-grown':        () => Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview', convId: null }),
  'hub-v1':           () => Object.assign(state, { view: 'room', projectId: 'website', tab: 'overview', convId: null }),
  'hub-empty':        () => { closeModals(); openProjectModal(null); return 'noRender'; },
  'tab-conversations':() => Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'conversations' }),
  'tab-memory':       () => Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'memory' }),
  'tab-artifacts':    () => Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'artifacts' }),
  'tab-members':      () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview', convId: null }); render(); openShare('project'); return 'noRender'; },
  'chat-project':     () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }),
  'chat-new':         () => Object.assign(state, { view: 'newchat', projectId: 'renewal' }),
  'chat-ungrouped':   () => Object.assign(state, { view: 'chat', convId: 'u1' }),
  'chat-companion':   () => Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal', companion: true, railMode: 'context' }),
  'chat-temporary':   () => { DATA.temporary.messages = []; Object.assign(state, { view: 'chat', convId: 'tmp' }); },
  'flow-plan':        () => { Object.assign(state, { view: 'newchat', projectId: 'renewal' }); draft().planArmed = true; render(); const ta = $('#chatInput'); ta.value = 'Compare renewal rates by chapter and flag outliers'; draft().text = ta.value; toast('Plan armed for THIS request — send it'); return 'noRender'; },
  'flow-remember':    () => { Object.assign(state, { view: 'chat', convId: 'c1', projectId: 'renewal' }); render(); $('#chatInput').value = 'Always loop in Dana on pipeline summaries'; toast('Send it — watch the quiet "Remembered" moment'); return 'noRender'; },
  'artifact-page':    () => Object.assign(state, { view: 'artifact', projectId: 'renewal', artifactId: 'a1', artifactVersion: null, editingArtifact: false }),
  'flow-grow':        () => { Object.assign(state, { view: 'room', projectId: 'website', tab: 'overview', convId: null }); render(); openShare('project'); setTimeout(() => { const i = $('#shareInput'); if (i) { i.value = 'Dana Kim'; i.focus(); } }, 60); return 'noRender'; },
  'flow-workflow':    () => { finishWorkflow(); return 'noRender'; },
  'micro-memory':     () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'memory' }); render(); toast('Hover a memory row — pencil edits inline, trash forgets'); return 'noRender'; },
  'micro-dnd':        () => { Object.assign(state, { view: 'chat', convId: 'c2', projectId: 'renewal' }); render(); openMove(); toast('Sidebar DnD re-homes on the Chats surface in session 2 (W0a) — Move to project… is the interim path'); return 'noRender'; },
  'proj-menu':        () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview' }); render(); const b = $('[data-act="proj-menu"]'); if (b) b.click(); return 'noRender'; },
  'modal-share':      () => { Object.assign(state, { view: 'room', projectId: 'renewal', tab: 'overview' }); render(); openShare('project'); return 'noRender'; },
  'modal-project':    () => { openProjectModal(null); return 'noRender'; },
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
  document.body.classList.remove('side-open'); // WP6 — drawer closes on any navigation
  renderSidebar();
  ({ frontdoor: renderFrontDoor, room: renderHub, chat: renderChat, newchat: renderNewChat, artifact: renderArtifact,
    chats: renderChatsSurface, projects: renderProjectsSurface, collections: renderCollectionsSurface, routines: renderRoutinesSurface })[state.view]();
  renderSettingsPanel();
  document.body.classList.toggle('density-compact', state.density === 'compact');
}

document.addEventListener('click', (e) => {
  const pip = e.target.closest('[data-pip]');
  if (pip) {
    document.querySelectorAll('#pips .pip').forEach((b) => b.classList.toggle('sel', b === pip));
    const s = $('#rateSubmit'); if (s) s.disabled = false;
    return;
  }
  if (e.target.id === 'rateSubmit') {
    const sel = $('#pips .pip.sel'); if (!sel) return;
    const consent = $('#rateConsent');
    if (consent && !consent.checked) { toast('Consent is required — a rating grants reviewer access'); return; }
    state.ratingConsented = true;
    const f = findConv(state.convId);
    if (f && state.rateMsg != null) f.conv.messages[state.rateMsg].rating = Number(sel.dataset.pip);
    state.rateMsg = null;
    closeModals(); render(); toast('Thanks — rating recorded');
    return;
  }
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
    case 'open-hub': Object.assign(state, { view: 'room', projectId: id, tab: 'overview', convId: null, studioId: null }); state.openProjects.add(id); render(); break;
    case 'open-tab': Object.assign(state, { view: 'room', tab: id }); render(); break;
    case 'open-tab-from-chat': Object.assign(state, { view: 'room', tab: id, convId: null }); render(); break;
    case 'open-conv': { const f = findConv(id);
      Object.assign(state, { view: 'chat', convId: id, studioId: null, editingArtifact: false, inspectId: null, editMsg: null });
      if (f && f.conv.fresh) { f.conv.newFrom = Math.max(1, f.conv.messages.length - 1); delete f.conv.fresh; }
      state.projectId = f && f.proj ? f.proj.id : null; render(); break; }
    case 'tab': state.tab = id; render(); break;
    case 'new-chat': state.view = 'newchat'; render(); break;
    case 'new-project': openProjectModal(null); break;
    case 'pm-icon': pmSel.icon = id; document.querySelectorAll('#pmIcons .pm-ic').forEach((b) => b.classList.toggle('sel', b.dataset.id === id)); break;
    case 'pm-color': pmSel.color = id; document.querySelectorAll('#pmColors .pm-sw').forEach((b) => b.classList.toggle('sel', b.dataset.id === id)); break;

    /* composer */
    case 'toggle-plan': { const d = draft(); d.text = $('#chatInput') ? $('#chatInput').value : d.text;
      d.planArmed = !d.planArmed; render(); if (d.planArmed) toast('Plan first — armed for this request only'); break; }
    case 'plan-delegated': toast('Skip runs its own planning — plan mode is delegated (D15)'); break;
    case 'plan-rearm': { const d = draft(); d.planArmed = true; render(); toast('Plan re-armed for your next message'); break; }
    case 'new-send': { const pl = composerPayload(); if (!pl) break;
      if (pl.temp) startTemporaryChat(pl); else createConversation(project(state.projectId), pl); break; }
    case 'toggle-temp': { const d = draft(); d.temp = !d.temp; const ta = $('#chatInput'); if (ta) d.text = ta.value; render();
      if (d.temp) toast('Temporary — locks once the conversation starts (D20)'); break; }
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
    case 'mem-forget': { const proj4 = p(); const note = proj4.memory.find((m) => m.id === id);
      const doForget = () => { proj4.memory = proj4.memory.filter((m) => m.id !== id); render(); toast('Forgotten'); };
      if (note && note.scope.includes('global')) openConfirm('Forget everywhere?', `"${note.text}" is a global note — forgetting it here removes it from ALL projects and conversations.`, doForget);
      else doForget();
      break; }
    case 'mem-keep': { const m = p().memory.find((m) => m.id === id); if (m) m.status = 'active'; render(); toast('Kept — now active project memory'); break; }
    case 'mem-undo': { const f = findConv(state.convId); const msg = f.conv.messages[Number(id)];
      if (msg && msg.memId && f.proj) { f.proj.memory = f.proj.memory.filter((m) => m.id !== msg.memId); delete msg.remembered; }
      render(); toast('Forgotten'); break; }

    /* companion rail */
    case 'toggle-companion': state.companion = !state.companion; state.railMode = 'context'; render(); break;
    case 'rail-artifact': Object.assign(state, { studioId: id, artifactId: id, artifactVersion: null, editingArtifact: false, viewerTab: 'Display' }); render(); break;
    case 'rail-context': state.railMode = 'context'; render(); break;

    /* artifacts */
    case 'open-artifact': { const a2 = artifact(p(), id); if (a2) delete a2.fresh;
      if (state.view === 'chat') { Object.assign(state, { studioId: id, artifactId: id, artifactVersion: null, editingArtifact: false, viewerTab: 'Display' }); render(); break; }
      Object.assign(state, { view: 'artifact', artifactId: id, artifactVersion: null, editingArtifact: false, viewerTab: 'Display' }); render(); break; }
    case 'art-version': state.artifactVersion = Number(id); state.editingArtifact = false; render(); break;
    case 'art-edit': state.editingArtifact = true; state.viewerTab = 'Display'; render(); break;
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
    case 'member-remove': { const proj3 = p(); const m = proj3.members[Number(id)];
      proj3.members.splice(Number(id), 1);
      if (!$('#shareModal').hidden) renderShare();
      render(); toast(`${m.name} removed${!isGrown(proj3) ? ' — the hub went back to v1 density' : ''}`); break; }
    case 'share-invite': inviteMember(); break;
    case 'share-done': closeModals(); break;

    /* menus */
    case 'proj-desc-add': MENU_ACTIONS['proj-desc'](); break;
    case 'proj-menu': showMenu([
        { act: 'proj-edit', icon: 'fa-pen', label: 'Edit project…' },
        { act: 'proj-rename', icon: 'fa-i-cursor', label: 'Rename inline' },
        { act: 'proj-desc', icon: 'fa-align-left', label: 'Edit description' },
        '-',
        { act: 'proj-delete', icon: 'fa-trash', label: 'Delete project', danger: true },
      ], el); break;
    case 'conv-menu': showMenu([
        { act: 'conv-rename', icon: 'fa-pen', label: 'Rename conversation' },
        { act: 'conv-move', icon: 'fa-folder-open', label: 'Move to project…' },
        { act: 'conv-pin', icon: 'fa-thumbtack', label: 'Pin conversation' },
        '-',
        { act: 'conv-share', icon: 'fa-user-plus', label: 'Share…' },
        { act: 'conv-export', icon: 'fa-file-export', label: 'Export…' },
        '-',
        { act: 'conv-delete', icon: 'fa-trash', label: 'Delete conversation', danger: true },
      ], el); break;
    case 'move-to': moveConversation(id); break;
    case 'move-new-project': {
      const convId = state.moveSrcId || state.convId;
      closeModals();
      openProjectModal(null);
      state.moveConvPending = convId; // set AFTER closeModals (which clears it)
      break;
    }

    case 'wf-retry': { const src = el.dataset.proj ? project(el.dataset.proj) : p(); const w = src.workflows.find((w) => w.id === id);
      if (w) { w.state = 'running'; w.pct = 10; w.meta = w.title.startsWith('Build') ? 'Skip · step 1 of 4 · retrying' : 'retrying'; }
      render(); toast('Retrying — back in Running now'); break; }
    case 'view-owner': state.viewAs = { name: 'You', role: 'Owner' }; render(); toast('Back to your own access'); break;
    case 'restore-project': restoreProject(id); break;
    case 'msg-retry': { const f = findConv(state.convId); const em = f.conv.messages[Number(id)];
      f.conv.messages.splice(Number(id), 1);
      appendChatMessage(em.retryText.replace(/fail/ig, '').trim() || 'try that again'); break; }
    /* WP1 chrome — top-level nav · Front Door · S1 settings */
    case 'nav': { Object.assign(state, { view: id, convId: null, fdState: null, studioId: null, chatsSelect: false, collSelect: false, routineId: null }); state.chatsSel.clear(); state.collSel.clear(); render(); break; }
    case 'go-frontdoor': Object.assign(state, { view: 'frontdoor', convId: null, fdState: null }); render(); break;
    case 'fd-send': { const pl = composerPayload(); if (!pl) break;
      if (pl.temp) startTemporaryChat(pl); else createConversation(null, pl); break; }
    case 'fd-review-notes': Object.assign(state, { view: 'room', projectId: id, tab: 'memory', convId: null }); render(); break;
    case 'fd-retry': state.fdState = null; render(); toast('Reloaded'); break;
    case 'settings-close': state.settingsOpen = false; renderSettingsPanel(); break;
    case 'tgl-projects': {
      state.showProjects = !state.showProjects;
      state.settingsOpen = true; // the panel stays open — the sidebar change is visible behind it
      if (!state.showProjects && (state.view === 'projects' || state.view === 'room')) Object.assign(state, { view: 'frontdoor', convId: null });
      render();
      toast(state.showProjects ? 'Projects visible — the ratified default (D-S7)' : 'Projects hidden (F0x) — chats, collections, and routines keep working whole');
      break; }
    /* W0a Chats · W0b Projects surface controls */
    case 'chats-group': state.chatsGroup = id; render(); break;
    case 'chats-select': state.chatsSelect = !state.chatsSelect; state.chatsSel.clear(); render(); break;
    case 'chats-ck': { if (state.chatsSel.has(id)) state.chatsSel.delete(id); else state.chatsSel.add(id); render(); break; }
    case 'chats-selall': { const ids = chatsVisibleIds(); const all = ids.length && ids.every((x) => state.chatsSel.has(x));
      state.chatsSel = all ? new Set() : new Set(ids); render(); break; }
    case 'chats-delsel': { const n = state.chatsSel.size;
      if (!n) { toast('Nothing selected'); break; }
      openConfirm(`Delete ${n} conversation${n > 1 ? 's' : ''}?`, 'Messages are removed. Memory notes stay with their projects.', () => {
        for (const cid of state.chatsSel) detachConv(cid);
        state.chatsSel = new Set(); state.chatsSelect = false;
        render(); toast(`Deleted ${n} conversation${n > 1 ? 's' : ''}`);
      }); break; }
    case 'proj-seg': state.projSeg = id; render(); break;
    case 'new-chat-global': Object.assign(state, { view: 'newchat', projectId: null, convId: null }); render(); break;
    case 'chat-row-menu': showMenu([
        { act: 'row-pin', arg: id, icon: 'fa-thumbtack', label: 'Pin conversation' },
        { act: 'row-rename', arg: id, icon: 'fa-pen', label: 'Rename…' },
        { act: 'row-move', arg: id, icon: 'fa-folder-open', label: 'Move to project…' },
        '-',
        { act: 'row-delete', arg: id, icon: 'fa-trash', label: 'Delete conversation', danger: true },
      ], el); break;
    /* Session 3 — Room + WP3 controls */
    case 'room-sort': state.roomSort = id; render(); break;
    case 'mem-seg': state.memSeg = id; render(); break;
    case 'art-view': state.artView = id; render(); break;
    case 'viewer-tab': state.viewerTab = id; state.editingArtifact = false; render(); break;
    case 'studio-close': Object.assign(state, { studioId: null, editingArtifact: false }); render(); break;
    case 'art-collect': toast('Save to collection — the shipped picker (multi-select, inline create) mounts here · W2 lands next session'); break;
    case 'vw-copy': toast('Copied'); break;
    case 'rail-keep': state.railKeep = true; render(); break;
    case 'run-cancel': { const f = findConv(state.convId); const m2 = f && f.conv.messages[Number(id)];
      if (m2 && m2.plan) m2.plan.status = 'canceled';
      if (!state.railKeep) state.companion = false;
      render(); toast('Run canceled — nothing was saved'); break; }
    case 'wf-cancel': { const src = el.dataset.proj ? project(el.dataset.proj) : p(); const w = src.workflows.find((w) => w.id === id);
      if (w) { w.state = 'failed'; w.meta = 'Canceled by you — retry when ready'; }
      if (!state.railKeep) state.companion = false;
      render(); toast('Run canceled'); break; }
    case 'esc-create': { const convId = state.convId; openProjectModal(null); state.moveConvPending = convId; break; }
    case 'esc-dismiss': { const f = findConv(state.convId); if (f) f.conv.escDismissed = true; render(); break; }
    case 'rem-edit': {
      const f = findConv(state.convId); const msg = f && f.conv.messages[Number(id)];
      const span = $(`#rem-${id}`); if (!msg || !span || !f.proj) break;
      span.outerHTML = `<input class="editing" id="remIn" value="${esc(msg.remembered)}">`;
      const input = $('#remIn'); input.focus(); input.select();
      const commit = () => {
        const v = input.value.trim() || msg.remembered;
        msg.remembered = v;
        const note = f.proj.memory.find((n) => n.id === msg.memId); if (note) note.text = v;
        render(); toast('Note updated');
      };
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') render(); });
      input.addEventListener('blur', commit);
      break; }
    case 'refresh-cache': toast('Agent cache refreshed — agents and skills re-synced'); break;
    /* WP4 — message row + header consolidation */
    case 'inspect': state.inspectId = state.inspectId === Number(id) ? null : Number(id); render(); break;
    case 'msg-pin': { const f = findConv(state.convId); const m2 = f.conv.messages[Number(id)];
      m2.pinned = !m2.pinned; render();
      toast(m2.pinned ? 'Message pinned — the header thumbtack collects them' : 'Unpinned'); break; }
    case 'msg-del-below': { const idx = Number(id); const f = findConv(state.convId);
      openConfirm('Delete this and everything below?', `${f.conv.messages.length - idx} message${f.conv.messages.length - idx > 1 ? 's are' : ' is'} removed from the record. Memory notes stay with the project.`, () => {
        f.conv.messages = f.conv.messages.slice(0, idx); state.inspectId = null; render();
        toast('Deleted — the conversation resumes from the previous turn'); }); break; }
    case 'msg-rate': state.rateMsg = Number(id); openRating(); break;
    case 'msg-edit': state.editMsg = Number(id); render();
      setTimeout(() => { const t = $('#muEdit'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30); break;
    case 'msg-edit-save': { const f = findConv(state.convId); const m2 = f.conv.messages[Number(id)];
      const t = $('#muEdit');
      if (t && t.value.trim() && t.value.trim() !== m2.text) { m2.text = t.value.trim(); m2.edited = true; }
      state.editMsg = null; render(); break; }
    case 'msg-edit-cancel': state.editMsg = null; render(); break;
    case 'cmd-chip': { const [mi2, ci] = id.split(':').map(Number); const f = findConv(state.convId);
      const cmd = f.conv.messages[mi2].cmds[ci];
      if (/^Open /.test(cmd)) { toast(`${cmd} — opens the record (open:resource routing)`); break; }
      delete f.conv.messages[mi2].cmds;
      appendChatMessage(cmd); break; }
    case 'pins-panel': { const f = findConv(state.convId); if (!f) break;
      const items = [];
      f.conv.messages.forEach((m, i) => { if (m.pinned) items.push({ act: 'pin-jump', arg: String(i), icon: 'fa-thumbtack', label: (m.text || '(no text)').slice(0, 52) + ((m.text || '').length > 52 ? '…' : '') }); });
      showMenu(items, el); break; }
    /* W2 Collections · W3 Routines */
    case 'coll-open': Object.assign(state, { collId: id || null, collSelect: false, collFilter: '' }); state.collSel.clear(); render(); break;
    case 'coll-sort': state.collSort = id; render(); break;
    case 'coll-view': state.collView = id; render(); break;
    case 'coll-select': state.collSelect = !state.collSelect; state.collSel.clear(); render(); break;
    case 'coll-ck': { if (state.collSel.has(id)) state.collSel.delete(id); else state.collSel.add(id); render(); break; }
    case 'coll-shelf-sel': { if (!state.collSel.size) { toast('Nothing selected'); break; }
      for (const cid of state.collSel) { const f2 = findCollItem(cid); if (f2) { state.shelf.push(f2.it); f2.c.items = f2.c.items.filter((x) => x.id !== cid); } }
      const moved = state.collSel.size; state.collSel = new Set(); state.collSelect = false;
      render(); toast(`${moved} on the shelf — open another collection and "Move here"`); break; }
    case 'coll-remove-sel': { const n2 = state.collSel.size; if (!n2) { toast('Nothing selected'); break; }
      openConfirm(`Remove ${n2} item${n2 > 1 ? 's' : ''} from this collection?`, 'Artifacts stay with their origin projects — only the curation is removed.', () => {
        for (const cid of state.collSel) { const f2 = findCollItem(cid); if (f2) f2.c.items = f2.c.items.filter((x) => x.id !== cid); }
        state.collSel = new Set(); state.collSelect = false; render(); toast('Removed — originals untouched'); }); break; }
    case 'shelf-drop': { const c2 = coll(state.collId); if (!c2) break;
      c2.items.push(...state.shelf); const n3 = state.shelf.length; state.shelf = [];
      render(); toast(`Moved ${n3} item${n3 > 1 ? 's' : ''} into "${c2.name}"`); break; }
    case 'shelf-clear': state.shelf = []; render(); break;
    case 'coll-new': { const nc = { id: 'col' + Date.now(), name: 'New collection', parent: state.collId, items: [] };
      DATA.collections.push(nc); render(); MENU_ACTIONS['coll-rename'](nc.id); break; }
    case 'coll-share': openShare('collection', null, state.collId); break;
    case 'coll-item-open': { const f2 = findCollItem(id); if (!f2) break;
      if (f2.it.artId && f2.it.fromProj) { Object.assign(state, { view: 'artifact', projectId: f2.it.fromProj, artifactId: f2.it.artId, artifactVersion: null, editingArtifact: false, viewerTab: 'Display' }); render(); }
      else toast('Facsimile preview — the artifact viewer (MOUNT) opens here'); break; }
    case 'rout-seg': state.routSeg = id; render(); break;
    case 'rout-open': Object.assign(state, { routineId: id }); render(); break;
    case 'rout-back': { const nm = $('#routName'); const r = DATA.routines.find((x) => x.id === state.routineId);
      if (nm && r) r.name = nm.textContent.trim() || r.name;
      state.routineId = null; render(); break; }
    case 'rout-new': { const nr = { id: 'r' + Date.now(), name: 'New routine', kind: 'Scheduled', schedule: 'Daily 7:00 AM', agent: state.defaultAgent || 'Sage', notify: 'In-app', last: 'never', next: 'tomorrow 7:00 AM', paused: false, history: [] };
      DATA.routines.push(nr); Object.assign(state, { routineId: nr.id }); render();
      const nm = $('#routName'); if (nm) { nm.focus(); document.getSelection().selectAllChildren(nm); } break; }
    case 'rout-run': { const r = DATA.routines.find((x) => x.id === id); if (!r || r.paused) break;
      r.history.unshift({ when: 'just now', note: 'Manual run — completed · opened a conversation with the result', link: 'Open conversation' });
      r.last = 'just now · healthy'; render(); toast(`"${r.name}" ran — result on your Front Door under "Ran overnight"`); break; }
    case 'rout-pause': { const r = DATA.routines.find((x) => x.id === id); if (!r) break;
      r.paused = !r.paused; render(); toast(r.paused ? `"${r.name}" paused — nothing runs until you resume` : `"${r.name}" resumed · next: ${r.next === 'paused' ? 'on schedule' : r.next}`); break; }
    case 'rout-delete': { const r = DATA.routines.find((x) => x.id === id); if (!r) break;
      openConfirm(`Delete "${r.name}"?`, 'The standing order and its run history are removed. Conversations its runs opened are untouched.', () => {
        DATA.routines = DATA.routines.filter((x) => x.id !== id); state.routineId = null; render(); toast('Routine deleted'); }); break; }
    case 'rout-hist': { const f2 = findConv('pin1'); if (f2) { Object.assign(state, { view: 'chat', convId: 'pin1', projectId: null, studioId: null }); render(); }
      else toast('Opens the run record'); break; }
    case 'viewer-menu': { const items = [];
      if (canEdit()) items.push({ act: 'm-art-edit', icon: 'fa-pen', label: 'Edit — saves as a new version' });
      items.push({ act: 'm-art-collect', icon: 'fa-layer-group', label: 'Save to collection…' });
      if (canManage()) items.push({ act: 'm-art-share', icon: 'fa-user-plus', label: 'Share…' });
      items.push({ act: 'm-art-analyze', icon: 'fa-magnifying-glass-chart', label: 'Analyze — conversation from this data snapshot' });
      if (canEdit()) items.push({ act: 'm-art-remix', icon: 'fa-code-branch', label: 'Remix into a new conversation' });
      showMenu(items, el); break; }
    case 'paper-close': state.paperOpen = null; renderPaper(); break;
    case 'noop': toast('Out of prototype scope'); break;
  }
});

/* Drag-and-drop — conversations→groups (W0a) + collection items→folders/crumbs (W2) */
document.addEventListener('dragstart', (e) => {
  const ci = e.target.closest('[data-drag-coll-item]');
  if (ci) { e.dataTransfer.setData('text/plain', 'collitem:' + ci.dataset.dragCollItem); e.dataTransfer.effectAllowed = 'move'; return; }
  const row = e.target.closest('[data-drag-conv]');
  if (!row) return;
  e.dataTransfer.setData('text/plain', row.dataset.dragConv);
  e.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', (e) => {
  const t = e.target.closest('[data-drop-target], [data-drop-coll]');
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  t.classList.add('drop-hover');
});
document.addEventListener('dragleave', (e) => {
  const t = e.target.closest('[data-drop-target], [data-drop-coll]');
  if (t) t.classList.remove('drop-hover');
});
document.addEventListener('drop', (e) => {
  const t = e.target.closest('[data-drop-target], [data-drop-coll]');
  if (!t) return;
  e.preventDefault();
  t.classList.remove('drop-hover');
  const data = e.dataTransfer.getData('text/plain');
  if (!data) return;
  if (data.startsWith('collitem:')) {
    if (!('dropColl' in t.dataset)) return;
    const itemId = data.slice(9);
    const targetId = t.dataset.dropColl;
    const f = findCollItem(itemId);
    if (!f) return;
    if (targetId === '__root' || targetId === '') { toast('Artifacts live inside collections — drop on a folder or breadcrumb below the root'); return; }
    const target = coll(targetId);
    if (!target || target.id === f.c.id) return;
    f.c.items = f.c.items.filter((x) => x.id !== itemId);
    target.items.push(f.it);
    render();
    toast(`Moved to "${target.name}"`);
    return;
  }
  if (!('dropTarget' in t.dataset)) return;
  const convId = data;
  const targetId = t.dataset.dropTarget;
  const f = findConv(convId);
  const already = targetId === '__none' ? (f && !f.proj) : (f && f.proj && f.proj.id === targetId);
  if (already) return;
  if (moveConvTo(convId, targetId)) {
    render();
    toast(targetId === '__none' ? 'Moved to Ungrouped' : `Moved to ${project(targetId).name}`);
  }
});

/* W2 — right-click context menus (Finder parity) */
document.addEventListener('contextmenu', (e) => {
  const t = e.target.closest('[data-ctx]');
  if (!t || !canEdit()) return;
  e.preventDefault();
  const id = t.dataset.id || t.dataset.dragCollItem;
  if (t.dataset.ctx === 'coll-item') showMenu([
    { act: 'ctx-open', arg: id, icon: 'fa-up-right-from-square', label: 'Open' },
    { act: 'ctx-src', arg: id, icon: 'fa-comment', label: 'Open source conversation' },
    { act: 'ctx-shelf', arg: id, icon: 'fa-inbox', label: 'Move to shelf' },
    '-',
    { act: 'ctx-remove', arg: id, icon: 'fa-trash', label: 'Remove from collection', danger: true },
  ], t);
  else showMenu([
    { act: 'coll-open-menu', arg: id, icon: 'fa-folder-open', label: 'Open' },
    { act: 'coll-rename', arg: id, icon: 'fa-pen', label: 'Rename…' },
    { act: 'coll-share-menu', arg: id, icon: 'fa-user-plus', label: 'Share…' },
    '-',
    { act: 'coll-delete', arg: id, icon: 'fa-trash', label: 'Delete folder', danger: true },
  ], t);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-set]')) {
    const v = e.target.value;
    switch (e.target.dataset.set) {
      case 'density': state.density = v.toLowerCase(); document.body.classList.toggle('density-compact', state.density === 'compact'); renderSidebar(); toast(`Density: ${v}`); break;
      case 'agent': state.defaultAgent = v; toast(`Default agent: ${v} — the per-conversation choice still wins`); break;
      case 'appearance': applyAppearance(v.toLowerCase()); toast(`Appearance: ${v}`); break;
    }
    return;
  }
  if (e.target.matches('[data-rout]')) {
    const r = DATA.routines.find((x) => x.id === state.routineId);
    if (r) { r[e.target.dataset.rout] = e.target.value; render(); toast('Routine updated'); }
    return;
  }
  if (e.target.matches('[data-ver-select]')) {
    state.artifactVersion = Number(e.target.value);
    state.editingArtifact = false;
    render();
    return;
  }
  if (e.target.matches('[data-capture-scope]')) {
    const f = findConv(state.convId); const msg = f && f.conv.messages[Number(e.target.dataset.captureScope)];
    if (msg && f.proj) {
      msg.remScope = e.target.value;
      const note = f.proj.memory.find((n) => n.id === msg.memId);
      if (note) note.scope = e.target.value === 'Org-wide' ? 'All agents · global' : 'All agents';
      toast(e.target.value === 'Org-wide' ? 'Scope: Org-wide — every agent reads this everywhere' : 'Scope: Project — stays inside ' + f.proj.name);
    }
    return;
  }
  if (e.target.matches('[data-member-role]')) {
    const proj5 = project(state.projectId);
    proj5.members[Number(e.target.dataset.memberRole)].role = e.target.value;
    toast('Role updated');
    if (!$('#shareModal').hidden) renderShare(); else render();
  }
  if (e.target.matches('[data-mem-scope]')) {
    const proj6 = project(state.projectId);
    const note = proj6.memory.find((m) => m.id === e.target.dataset.memScope);
    if (note) { note.scope = e.target.value; toast('Scope updated'); render(); }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'sideFilter') { state.sideFilter = e.target.value; renderSidebar(); return; }
  const FILTERS = ['chatsFilter', 'projFilter', 'roomFilter', 'memFilter', 'artFilter', 'collFilter'];
  if (FILTERS.includes(e.target.id)) {
    const id = e.target.id, v = e.target.value, pos = e.target.selectionStart;
    state[id] = v;
    ({ chats: renderChatsSurface, projects: renderProjectsSurface, room: renderHub, collections: renderCollectionsSurface })[state.view]();
    const inp = $('#' + id); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    return;
  }
  if (e.target.id !== 'chatInput') return;
  const ta = e.target;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  draft().text = ta.value;
  detectTrigger(ta);
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    Object.assign(state, { view: 'newchat', projectId: null, convId: null }); render();
    return;
  }
  if (e.key === 'Enter' && !e.isComposing) {
    if (e.target.id === 'chatInput') {
      if (popCtx) { e.preventDefault(); pickMention(); return; }
      if (!e.shiftKey) {
        e.preventDefault();
        const act = state.view === 'newchat' ? 'new-send' : state.view === 'frontdoor' ? 'fd-send' : 'chat-send';
        const b = $(`[data-act="${act}"]`); if (b) b.click();
      }
      return;
    }
    if (e.target.id === 'emptySend') { const b = $('[data-act="empty-send"]'); if (b) b.click(); }
    if (e.target.id === 'frInput') { const b = $('[data-act="fr-send"]'); if (b) b.click(); }
    if (e.target.id === 'pmName' || e.target.id === 'pmDesc') $('#pmCreate').click();
    if (e.target.id === 'cmName' || e.target.id === 'cmDesc') $('#cmSave').click();
    if (e.target.id === 'shareInput') { const b = $('[data-act="share-invite"]'); if (b) b.click(); }
  }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && popCtx && e.target.id === 'chatInput') {
    e.preventDefault();
    popCtx.active = (popCtx.active + (e.key === 'ArrowDown' ? 1 : popCtx.items.length - 1)) % popCtx.items.length;
    renderMentionPop();
    return;
  }
  if (e.key === 'Escape') {
    if (popCtx) { const mp = $('#mentionPop'); if (mp) mp.hidden = true; popCtx = null; return; }
    if (state.paperOpen) { state.paperOpen = null; renderPaper(); return; }
    if (state.settingsOpen && !$('#scrim').classList.contains('on')) { state.settingsOpen = false; renderSettingsPanel(); return; }
    closeModals();
  }
});

$('#scrim').addEventListener('click', closeModals);
$('#pmCancel').addEventListener('click', closeModals);
$('#cmCancel').addEventListener('click', closeModals);
$('#cmSave').addEventListener('click', () => {
  if (state.renameCollId) {
    const c2 = coll(state.renameCollId);
    if (c2) { c2.name = $('#cmName').value.trim() || c2.name; c2.desc = $('#cmDesc').value.trim(); }
    state.renameCollId = null;
    closeModals(); render(); toast('Renamed');
    return;
  }
  const found = findConv(state.renameId || state.convId);
  if (found) {
    found.conv.title = $('#cmName').value.trim() || found.conv.title;
    found.conv.summary = $('#cmDesc').value.trim();
  }
  closeModals(); render(); toast('Renamed');
});
$('#pmCreate').addEventListener('click', createProject);
$('#confirmNo').addEventListener('click', closeModals);
$('#confirmYes').addEventListener('click', () => { closeModals(); if (confirmFn) { confirmFn(); confirmFn = null; } });
$('#newConvBtn').addEventListener('click', () => { Object.assign(state, { view: 'newchat', projectId: null, convId: null }); render(); });
$('#newTempBtn').addEventListener('click', () => { DATA.temporary.messages = []; Object.assign(state, { view: 'chat', convId: 'tmp' }); render(); });
$('#smHead').addEventListener('click', () => $('#stateMap').classList.toggle('closed'));
$('#privToggle').addEventListener('click', () => {
  state.canPublish = !state.canPublish;
  $('#privTgl').classList.toggle('on', state.canPublish);
  if (!$('#shareModal').hidden) renderShare();
  toast(state.canPublish ? 'Privilege granted — publish appears' : 'Privilege revoked — publish is hidden, not disabled');
});
$('#settingsBtn').addEventListener('click', () => { state.settingsOpen = !state.settingsOpen; renderSettingsPanel(); });
$('#sideToggle').addEventListener('click', () => document.body.classList.toggle('side-open'));
$('#sideScrim').addEventListener('click', () => document.body.classList.remove('side-open'));
$('#paperScrim').addEventListener('click', () => { state.paperOpen = null; renderPaper(); });
$('#settingsScrim').addEventListener('click', () => { state.settingsOpen = false; renderSettingsPanel(); });
$('#themeBtn').addEventListener('click', () => {
  // First click commits an explicit theme (opposite of what's showing); after that it flips.
  const r = document.documentElement;
  const dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  r.dataset.theme = dark ? 'light' : 'dark';
  state.appearance = r.dataset.theme;
  if (state.settingsOpen) renderSettingsPanel();
});

render();
