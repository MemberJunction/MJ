/* ============================================================================
   Conversations Phase 1 — clickable prototype logic (vanilla JS)
   Scripted/canned responses by design — no backend, no build, no login.

   Covers: plan mode (+ skill activations), inline memory + ledger, artifacts
   (edit/version/share/remix), routines (app + turn-into-routine + agenda +
   alerts), skills (catalog + per-agent enablement + pill popover), group chat
   (Phase 2 preview: threads, invites, prefs), proxy transparency (Skip),
   context gauge + proactive nudge, quote/fork/copy, TOC, ⌘K palette, ? cheats.
   ============================================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ================================================================ STATE */
  const state = {
    view: "chat",             // 'chat' | 'routines' | 'skills'
    planMode: false,
    canPublish: true,
    panelMode: "memory",      // 'memory' | 'artifact'
    panelWasOpen: true,
    focusedMsg: null,
    nextMemId: 100,
    memScope: "project",
    routineTab: "list",
    selectedRoutine: 1,
    acceptsSkills: "Limited",
  };

  /* ================================================================= DATA */
  const SKILLS = [
    { id: "crm", name: "CRM Lookup", icon: "fa-address-book", desc: "Pulls account, contact & pipeline context before replying.", actions: ["Account Fetch", "Pipeline Query"], subs: [], status: "Active", share: "Private", enabled: true },
    { id: "story", name: "Data Storyteller", icon: "fa-chart-line", desc: "Runs queries and narrates trends with charts.", actions: ["Run Query", "Chart Builder", "Trend Detect", "Narrate"], subs: ["Query Analyst", "Chart Smith"], status: "Active", share: "Shared org-wide", enabled: true },
    { id: "voice", name: "Brand Voice", icon: "fa-pen-nib", desc: "Rewrites output to match the company style guide.", actions: [], subs: [], status: "Active", share: "Shared org-wide", enabled: true },
    { id: "research", name: "Deep Research", icon: "fa-magnifying-glass-chart", desc: "Fans out web searches, verifies sources, writes a cited brief.", actions: ["Web Search", "Fetch Page", "Cite Check"], subs: ["Source Verifier"], status: "Draft", share: "Private", enabled: false },
  ];

  const ROUTINES = [
    {
      id: 1, name: "Morning sales digest", status: "Active", type: "Scheduled",
      freq: "Weekly", days: ["M", "T", "W", "Th", "F"], time: "07:30", tz: "America/New_York (ET)",
      target: "Revenue Analyst Agent", prompt: "Summarize yesterday's closed-won deals and flag anything over $50k.",
      notify: "Always", channels: ["In-app", "Email"],
      last: "Today 7:30 AM · ok", next: "Tomorrow 7:30 AM",
      history: [
        { when: "Today 7:30 AM", ok: true, dur: "8.2s", result: "View digest" },
        { when: "Yesterday 7:30 AM", ok: true, dur: "7.9s", result: "View digest" },
        { when: "Wed 7:30 AM", ok: false, dur: "2.1s", result: "Timeout" },
      ],
    },
    {
      id: 2, name: "Competitor pricing watch", status: "Paused", type: "Monitoring",
      freq: "Hourly", days: [], time: "", tz: "America/New_York (ET)",
      target: '"Summarize pricing changes" prompt', prompt: "Check competitor pricing pages and summarize any changes.",
      notify: "On change", channels: ["In-app"],
      last: "3:00 PM · change detected", next: "Paused",
      history: [
        { when: "3:00 PM", ok: true, dur: "12.4s", result: "Change detected" },
        { when: "11:00 AM", ok: true, dur: "10.8s", result: "No change" },
      ],
    },
    {
      id: 3, name: "EOD inventory sync", status: "Active", type: "Scheduled",
      freq: "Daily", days: [], time: "17:30", tz: "America/New_York (ET)",
      target: "Inventory Sync Action", prompt: "Reconcile inventory counts and flag mismatches.",
      notify: "On failure", channels: ["In-app", "Email"],
      last: "Yesterday 5:30 PM · failed", next: "Today 5:30 PM",
      history: [
        { when: "Yesterday 5:30 PM", ok: false, dur: "31.0s", result: "Connection timeout" },
        { when: "Mon 5:30 PM", ok: true, dur: "14.2s", result: "Synced 1,204 rows" },
      ],
    },
  ];

  const MEMORIES = [
    { id: 1, text: "Target close date is end of Q3; budget approval is pending finance.", scope: "project", project: "Acme Renewal", learned: "Learned yesterday" },
    { id: 2, text: "Primary procurement contact is Marcus Lee — keep him on technical threads.", scope: "project", project: "Acme Renewal", learned: "Learned 4 days ago" },
    { id: 3, text: "Prefers concise bullet summaries over long prose.", scope: "global", project: null, learned: "Learned 2 weeks ago" },
  ];

  const artifact = {
    name: "Q3 Revenue by Region",
    current: 2, selected: 2, editing: false,
    versions: [
      { v: 1, author: "Sage", when: "2h ago", title: "Q3 Revenue by Region", rows: [["Americas", 3.8], ["EMEA", 2.9], ["APAC", 1.9]], hl: "APAC" },
      { v: 2, author: "Sage", when: "1h ago", title: "Q3 Revenue by Region", rows: [["Americas", 4.2], ["EMEA", 3.1], ["APAC", 2.2]], hl: "APAC" },
    ],
  };

  /* ------------------------------------------------ conversation registry */
  const CONVS = {};
  let activeConvId = null;
  let convSeq = 0;

  function defineConv(id, cfg) {
    CONVS[id] = Object.assign({
      id, title: "Untitled", project: null, kind: "std", planCapable: true,
      agent: "Sage", agentModel: "Sage · GPT-4.1 · 1M",
      threadEl: null, seeded: false, log: [], anchors: [],
      ctx: { pct: 12, used: 118, turn: 2.2, cost: 0.18, msgs: 6 },
      temporary: false, memoryOn: true, nudged: false,
    }, cfg);
    return CONVS[id];
  }

  defineConv("q3", { title: "Q3 Pipeline Review", project: "Acme Renewal", ctx: { pct: 38, used: 382, turn: 6.1, cost: 0.74, msgs: 24 } });
  defineConv("renewal", { title: "Renewal terms draft", project: "Acme Renewal" });
  defineConv("stakeholders", { title: "Stakeholder map", project: "Acme Renewal" });
  defineConv("group", { title: "Budget planning", kind: "group", planCapable: false, ctx: { pct: 22, used: 226, turn: 3.4, cost: 0.31, msgs: 14 } });
  defineConv("skip", { title: "Skip Analyst", kind: "remote", planCapable: false, agent: "Skip", agentModel: "Skip · remote · api.getskip.ai", ctx: { pct: 9, used: 44, turn: 3.1, cost: 0.12, msgs: 3 } });
  defineConv("scratch", { title: "Quick questions", project: null });

  const activeConv = () => CONVS[activeConvId];

  /* ================================================================ toast */
  function toast(msg, icon = "fa-solid fa-circle-check") {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<i class="${icon}"></i><span>${msg}</span>`;
    $("#toastWrap").appendChild(t);
    setTimeout(() => { t.classList.add("toast-out"); setTimeout(() => t.remove(), 320); }, 2400);
  }

  /* ================================================================ theme */
  $("#themeBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = root.getAttribute("data-theme") || (sysDark ? "dark" : "light");
    root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  });

  /* ============================================================ VIEW SWAP */
  function showView(name) {
    state.view = name;
    $("#chatView").hidden = name !== "chat";
    $("#routinesView").hidden = name !== "routines";
    $("#skillsView").hidden = name !== "skills";
    $("#navRoutines").classList.toggle("active", name === "routines");
    $("#navSkills").classList.toggle("active", name === "skills");
    $$(".conv").forEach(c => c.classList.toggle("active", name === "chat" && c.dataset.conv === activeConvId));
    const app = $("#app");
    if (name === "chat") {
      app.classList.toggle("panel-open", state.panelWasOpen);
    } else {
      state.panelWasOpen = app.classList.contains("panel-open");
      app.classList.remove("panel-open");
      if (name === "routines") renderRoutines();
      if (name === "skills") renderSkills();
    }
  }
  $("#navRoutines").addEventListener("click", () => showView("routines"));
  $("#navSkills").addEventListener("click", () => showView("skills"));

  /* ================================================== CONVERSATION SWITCH */
  function threadElFor(conv) {
    if (!conv.threadEl) {
      const el = document.createElement("div");
      el.className = "thread";
      el.id = `thread-${conv.id}`;
      $("#threadHost").appendChild(el);
      // settle entrance animations even in backgrounded tabs
      new MutationObserver((muts) => {
        muts.forEach(m => m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.classList && n.classList.contains("msg-enter")) {
            setTimeout(() => n.classList.remove("msg-enter"), 520);
          }
        }));
      }).observe(el, { childList: true });
      conv.threadEl = el;
    }
    return conv.threadEl;
  }

  function switchConv(id) {
    const conv = CONVS[id];
    if (!conv) return;
    activeConvId = id;
    Object.values(CONVS).forEach(c => { if (c.threadEl) c.threadEl.hidden = c.id !== id; });
    const el = threadElFor(conv);
    el.hidden = false;
    if (!conv.seeded) { conv.seeded = true; (SEEDS[id] || SEEDS.generic)(conv); }
    showView("chat");
    renderHeader();
    renderMentionRow();
    updateGaugeUI();
    updateToc();
    applyTempUI();
    if (state.panelMode === "memory") renderMemory();
    scrollDown();
  }

  /* ------------------------------------------------------------ header */
  function renderHeader() {
    const conv = activeConv();
    $("#convTitle").textContent = conv.title;
    $("#convBread").innerHTML = conv.project
      ? `<i class="fa-solid fa-folder"></i> ${esc(conv.project)} <i class="fa-solid fa-chevron-right"></i> <span>Conversation</span>`
      : conv.kind === "group"
        ? `<i class="fa-solid fa-users"></i> Shared <i class="fa-solid fa-chevron-right"></i> <span>Group conversation · Phase 2 preview</span>`
        : conv.kind === "remote"
          ? `<i class="fa-solid fa-satellite-dish"></i> Direct <i class="fa-solid fa-chevron-right"></i> <span>Remote proxy agent</span>`
          : `<i class="fa-regular fa-comment"></i> Direct <i class="fa-solid fa-chevron-right"></i> <span>Conversation</span>`;
    $("#roster").hidden = conv.kind !== "group";
    if (conv.kind === "group") renderRoster();
    $("#remotePill").hidden = conv.kind !== "remote";
    $("#ctxModel").textContent = conv.agentModel;
    // memory / temporary don't apply to group + remote in this prototype
    $("#memToggle").classList.toggle("disabled", conv.kind !== "std");
    $("#tempToggle").classList.toggle("disabled", conv.kind !== "std");
    $("#memToggle").classList.toggle("on", conv.memoryOn && !conv.temporary);
    $("#tempToggle").classList.toggle("on", conv.temporary);
  }

  function renderMentionRow() {
    const conv = activeConv();
    const row = $("#mentionRow");
    if (conv.kind === "remote") {
      row.innerHTML = `
        <span class="mention-chip remote" id="agentChip">
          <i class="fa-solid fa-satellite-dish"></i> Skip Analyst
          <span class="pill sm" style="margin-left:2px;">remote</span>
          <span class="agent-pop" id="agentPop"></span>
        </span>`;
      $("#capNote").innerHTML = `<i class="fa-solid fa-circle-info"></i> Plan, skills &amp; memory are delegated to the remote agent`;
      $("#composerInput").placeholder = "Message Skip Analyst…";
    } else if (conv.kind === "group") {
      row.innerHTML = `
        <span class="mention-chip" id="agentChip"><i class="fa-solid fa-robot"></i> Sage<span class="agent-pop" id="agentPop"></span></span>
        <span class="pill sm">@mention people &amp; agents</span>`;
      $("#capNote").innerHTML = `<i class="fa-solid fa-circle-info"></i> Group runtime ships in Phase 2 — this is the UX preview`;
      $("#composerInput").placeholder = "Message #budget-planning…";
      wireAgentPop();
    } else {
      row.innerHTML = `
        <span class="mention-chip" id="agentChip">
          <i class="fa-solid fa-robot"></i> Sage
          <span class="chip-toggle" id="planToggle" title="Return a plan for approval before running">
            <span class="lbl">Plan</span>
            <span class="mini-switch ${state.planMode ? "" : "off"}"></span>
          </span>
          <span class="agent-pop" id="agentPop"></span>
        </span>`;
      $("#capNote").innerHTML = state.planMode
        ? `<span class="plan-active-note"><i class="fa-solid fa-list-check"></i> Sage will propose a plan before running</span>`
        : `<i class="fa-solid fa-circle-info"></i> Plan toggle shows only on plan-capable agents`;
      $("#composerInput").placeholder = conv.temporary ? "Message (not saved)…" : "Message Sage…";
      $("#planToggle").addEventListener("click", (e) => { e.stopPropagation(); setPlanMode(!state.planMode); });
      wireAgentPop();
    }
    $("#sendLabel").textContent = state.planMode && conv.kind === "std" ? "Plan & send" : "Send";
  }

  /* agent pill popover — attached skills (Skills · Option C chips) */
  function wireAgentPop() {
    const chip = $("#agentChip");
    if (!chip) return;
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".chip-toggle") || e.target.closest(".agent-pop")) return;
      const open = chip.classList.contains("open");
      closeAgentPop();
      if (!open) { renderAgentPop(); chip.classList.add("open"); }
      e.stopPropagation();
    });
  }
  function renderAgentPop() {
    const pop = $("#agentPop");
    if (!pop) return;
    const enabled = SKILLS.filter(s => s.enabled && state.acceptsSkills !== "None");
    pop.innerHTML = `
      <div class="ap-head">
        <span class="av">S</span>
        <div><div class="nm">Sage</div><div class="sub">Loop agent · GPT-4.1 · plan-capable</div></div>
      </div>
      <div class="ap-label">Skills · Accepts: ${state.acceptsSkills}</div>
      <div class="skill-chip-row">
        ${enabled.length
          ? enabled.map(s => `<span class="skill-chip"><i class="fa-solid ${s.icon}"></i> ${esc(s.name)}</span>`).join("")
          : `<span class="small muted">No skills enabled for this agent.</span>`}
      </div>
      <div class="ap-foot"><a id="manageSkillsLink"><i class="fa-solid fa-wand-magic-sparkles"></i> Manage skills</a></div>`;
    $("#manageSkillsLink").addEventListener("click", () => { closeAgentPop(); showView("skills"); });
  }
  function closeAgentPop() { $$(".mention-chip.open").forEach(c => c.classList.remove("open")); }
  document.addEventListener("click", (e) => { if (!e.target.closest(".mention-chip")) closeAgentPop(); });

  /* group roster */
  const GROUP_PEOPLE = [
    { init: "AK", name: "Amith K.", role: "Owner", presence: "" },
    { init: "PT", name: "Priya T.", role: "Member", presence: "" },
    { init: "JR", name: "Jordan R.", role: "Member", presence: "away" },
  ];
  let marcusStatus = "invited"; // invited | active | declined
  function renderRoster() {
    const avs = GROUP_PEOPLE.map(p =>
      `<span class="rav" style="background:var(--mj-brand-primary-active)" title="${esc(p.name)} · ${p.role}">${p.init}<span class="presence ${p.presence}"></span></span>`).join("")
      + (marcusStatus === "active" ? `<span class="rav" style="background:var(--mj-text-muted)" title="Marcus S. · Guest">MS<span class="presence off"></span></span>` : "")
      + `<span class="rav agent" title="Sage · agent">S</span>`;
    $("#rosterAvs").innerHTML = avs;
  }
  $("#inviteBtn").addEventListener("click", () => {
    const scrim = $("#inviteScrim");
    scrim.innerHTML = `
      <div class="dialog">
        <div class="dialog__head"><i class="fa-solid fa-user-plus" style="color:var(--mj-brand-primary)"></i><h3>Invite to "Budget planning"</h3></div>
        <div class="dialog__body">
          <div class="field"><span class="label">Email or name</span><input class="input" id="invEmail" placeholder="name@company.com"></div>
          <div class="field"><span class="label">Role</span>
            <div class="seg sm"><button class="seg-btn active">Member</button><button class="seg-btn">Guest</button></div>
          </div>
          <div class="small muted"><i class="fa-solid fa-circle-info"></i> They'll get an invite card in the thread — Invited → Active on accept.</div>
        </div>
        <div class="dialog__foot">
          <button class="btn" id="invSend">Send invite</button>
          <button class="btn ghost" id="invCancel" style="margin-left:auto;">Cancel</button>
        </div>
      </div>`;
    scrim.classList.add("open");
    $("#invSend").addEventListener("click", () => {
      const em = $("#invEmail").value.trim() || "taylor@partner.co";
      scrim.classList.remove("open");
      emitInviteCard(em.split("@")[0], em, false);
      toast("Invite sent — awaiting response", "fa-solid fa-user-plus");
    });
    $("#invCancel").addEventListener("click", () => scrim.classList.remove("open"));
    scrim.addEventListener("click", (e) => { if (e.target === scrim) scrim.classList.remove("open"); });
  });

  /* ============================================================ thread ops */
  function scrollDown() {
    const w = $("#threadWrap");
    requestAnimationFrame(() => { w.scrollTop = w.scrollHeight; });
  }

  function anchor(conv, label, icon, el) {
    conv.anchors.push({ label, icon, el });
    if (conv === activeConv()) updateToc();
  }

  // Build a chat message with hover toolbar. opts: {who, av, avBg, more, log, thread(conv), read}
  function addMessage(role, bodyHTML, opts = {}) {
    const conv = opts.conv || activeConv();
    const host = opts.host || threadElFor(conv);
    const block = document.createElement("div");
    block.className = `msg-block ${role} msg-enter`;
    const av = opts.av || (role === "user" ? "AM" : "S");
    const avBg = opts.avBg || (role === "agent" ? "var(--mj-brand-primary)" : "var(--mj-brand-primary-active)");
    const who = opts.who || (role === "user" ? "You" : conv.agent);
    const agentTag = opts.agentTag ? ` <span class="pill brand sm">agent</span>` : "";
    const when = opts.when ? ` <span class="when">${esc(opts.when)}</span>` : "";
    const moreBtn = opts.more === false ? "" : `
        <span class="sep"></span>
        <span class="msg-more">
          <button data-act="more"><i class="fa-solid fa-ellipsis"></i></button>
          <span class="msg-more-menu">
            <span class="mi" data-act="routine"><i class="fa-solid fa-clock-rotate-left"></i> Turn into a routine</span>
            <span class="mi" data-act="link"><i class="fa-solid fa-link"></i> Copy link to message</span>
          </span>
        </span>`;
    block.innerHTML = `
      <div class="msg-who"><span class="av" style="background:${avBg}">${av}</span> ${esc(who)}${agentTag}${when}</div>
      <div class="msg-bubble">${bodyHTML}</div>
      ${opts.read ? `<div class="read-row"><span class="ravs">${opts.read.map(r => `<span class="rav" style="background:var(--mj-text-disabled)">${r}</span>`).join("")}</span> Read by ${opts.read.length}</div>` : ""}
      <div class="msg-tools">
        <button data-act="quote"><i class="fa-solid fa-quote-right"></i> Quote <span class="sc">⇧Q</span></button>
        <span class="sep"></span>
        <button data-act="fork"><i class="fa-solid fa-code-branch"></i> Fork <span class="sc">F</span></button>
        <span class="sep"></span>
        <button data-act="copy"><i class="fa-regular fa-copy"></i> Copy <span class="sc">⌘C</span></button>
        ${moreBtn}
      </div>`;
    block.dataset.who = who;
    if (opts.log !== false) {
      conv.log.push({ role, html: bodyHTML, who });
      block.dataset.logi = conv.log.length - 1;
    }
    wireMsgTools(block);
    host.appendChild(block);
    if (conv === activeConv()) scrollDown();
    return block;
  }

  function wireMsgTools(block) {
    block.addEventListener("mouseenter", () => setFocused(block));
    block.querySelectorAll(".msg-tools button").forEach(b => {
      b.addEventListener("click", (e) => {
        setFocused(block);
        const act = b.dataset.act;
        if (act === "quote") quoteFrom(block);
        else if (act === "fork") openFork(block);
        else if (act === "copy") copyMsg(block);
        else if (act === "more") { e.stopPropagation(); const mm = b.closest(".msg-more"); const was = mm.classList.contains("open"); $$(".msg-more.open").forEach(m => m.classList.remove("open")); if (!was) mm.classList.add("open"); }
      });
    });
    block.querySelectorAll(".msg-more-menu .mi").forEach(mi => {
      mi.addEventListener("click", (e) => {
        e.stopPropagation();
        mi.closest(".msg-more").classList.remove("open");
        if (mi.dataset.act === "routine") openRoutineSlidein(bubbleText(block));
        else if (mi.dataset.act === "link") { copyText("https://app.mj.dev/c/" + activeConvId + "#m" + (block.dataset.logi || 0)); toast("Message link copied"); }
      });
    });
  }
  document.addEventListener("click", () => $$(".msg-more.open").forEach(m => m.classList.remove("open")));

  function setFocused(block) {
    if (state.focusedMsg) state.focusedMsg.classList.remove("focused");
    state.focusedMsg = block;
    block.classList.add("focused");
  }
  function bubbleText(block) {
    const b = block.querySelector(".msg-bubble");
    return b ? b.textContent.trim() : "";
  }

  function showTyping(who) {
    const conv = activeConv();
    const block = document.createElement("div");
    block.className = "msg-block agent msg-enter";
    block.innerHTML = `<div class="msg-who"><span class="av">${(who || conv.agent)[0]}</span> ${esc(who || conv.agent)}</div>
      <div class="msg-bubble" style="padding:4px 8px;"><span class="typing"><i></i><i></i><i></i></span></div>`;
    threadElFor(conv).appendChild(block);
    scrollDown();
    return block;
  }

  function sysNote(html, conv) {
    conv = conv || activeConv();
    const n = document.createElement("div");
    n.className = "sys-note msg-enter";
    n.innerHTML = html;
    threadElFor(conv).appendChild(n);
    if (conv === activeConv()) scrollDown();
    return n;
  }

  /* ================================================================ SEEDS */
  const SEEDS = {
    q3(conv) {
      const m1 = addMessage("agent", `Pulled the <strong>142 open opportunities</strong> for Acme's renewal. Want them grouped by stage or by owner?`, { conv });
      anchor(conv, "Kickoff — 142 open opps", "fa-flag", m1);
      addMessage("user", `By owner, descending by amount.`, { conv });
      const m3 = addMessage("agent", `Done — top owner is <strong>Dana Cole</strong> with $1.2M across 11 deals. Three enterprise deals worth $1.2M are slipping past the quarter boundary and need exec review.`, { conv });
      anchor(conv, "Owner ranking & slipping deals", "fa-ranking-star", m3);
      addMessage("agent", `I also built a <strong>Q3 revenue breakdown</strong> from those numbers — open it to edit, share, or remix.`, { conv });
      const art = emitArtifactCard(conv);
      anchor(conv, "Revenue artifact (v2)", "fa-chart-column", art);
    },
    renewal(conv) {
      addMessage("agent", `Draft terms are ready: 3-year commitment, 8% uplift capped, quarterly true-ups. Legal flagged the data-residency clause — want me to propose alternative language?`, { conv });
      addMessage("user", `Yes — and keep the uplift cap language exactly as-is.`, { conv });
      addMessage("agent", `Done. Two alternative clauses drafted; the second mirrors what Northwind accepted last quarter.`, { conv });
    },
    stakeholders(conv) {
      addMessage("agent", `Mapped 9 stakeholders. Champions: Dana Cole (VP Ops), Marcus Lee (Procurement). Skeptic: the new CFO — no direct contact yet. Want an intro path?`, { conv });
    },
    scratch(conv) {
      addMessage("agent", `This is your direct scratchpad — no project attached, so anything I learn here lands in <strong>Global</strong> memory only.`, { conv });
    },
    group(conv) {
      const host = threadElFor(conv);
      sysNote(`<i class="fa-solid fa-users" style="color:var(--mj-brand-primary)"></i> Group conversation · runtime ships in Phase 2 — this preview signs off the UX`, conv);
      const m1 = addMessage("peer", `Draft budget attached. Two open questions in the thread — please weigh in by Thursday.`, { conv, who: "Amith K.", av: "AK", avBg: "var(--mj-brand-primary-active)", read: ["PT", "JR"], when: "Tue 2:14 PM", more: false });
      anchor(conv, "Amith — draft budget", "fa-file-invoice-dollar", m1);
      // thread replies (collapsible)
      const toggle = document.createElement("button");
      toggle.className = "thread-toggle open";
      toggle.innerHTML = `<i class="fa-solid fa-chevron-down chev"></i> 2 replies in thread`;
      host.appendChild(toggle);
      const replies = document.createElement("div");
      replies.className = "thread-replies";
      host.appendChild(replies);
      addMessage("peer", `Marketing line feels high. <span class="selected-text">@Sage</span> what was last year's actual?`, { conv, host: replies, who: "Priya T.", av: "PT", avBg: "var(--mj-brand-primary-active)", when: "2:20 PM", more: false, log: false });
      addMessage("agent", `Last year marketing actual was <strong>$182k</strong> — this draft is <strong>+9%</strong>. The delta is entirely the two new event sponsorships.`, { conv, host: replies, who: "Sage", agentTag: true, when: "2:20 PM", more: false, log: false });
      toggle.addEventListener("click", () => {
        const open = !replies.hidden;
        replies.hidden = open;
        toggle.classList.toggle("open", !open);
        toggle.innerHTML = `<i class="fa-solid fa-chevron-down chev"></i> ${open ? "Show" : "Hide"} 2 replies in thread`.replace("Hide 2", "2");
        if (open) toggle.innerHTML = `<i class="fa-solid fa-chevron-down chev"></i> 2 replies in thread — show`;
        else toggle.innerHTML = `<i class="fa-solid fa-chevron-down chev"></i> 2 replies in thread`;
      });
      // typing presence
      const typing = document.createElement("div");
      typing.className = "read-row";
      typing.style.marginLeft = "26px";
      typing.innerHTML = `<span class="rav" style="background:var(--mj-text-disabled);position:static;width:14px;height:14px;">JR</span> Jordan is replying <span class="typing" style="padding:0 2px;"><i></i><i></i><i></i></span>`;
      host.appendChild(typing);
      emitInviteCard("Marcus S.", "marcus@partner.co", true);
      anchor(conv, "Pending invite — Marcus", "fa-user-plus", host.lastChild);
      // notification prefs
      const prefs = document.createElement("div");
      prefs.className = "prefs-card msg-enter";
      prefs.innerHTML = `
        <div class="p-title"><i class="fa-solid fa-bell" style="color:var(--mj-brand-primary)"></i> Your notifications here <span class="pill sm" style="margin-left:auto;">per-participant</span></div>
        <div class="pref-row" data-lvl="all">All messages <span class="head-toggle"><span class="track"></span></span></div>
        <div class="pref-row" data-lvl="mentions">Mentions &amp; agent replies to me <span class="head-toggle on"><span class="track"></span></span></div>
        <div class="pref-row" data-lvl="none">Nothing (muted) <span class="head-toggle"><span class="track"></span></span></div>`;
      host.appendChild(prefs);
      $$(".pref-row", prefs).forEach(row => row.querySelector(".head-toggle").addEventListener("click", () => {
        $$(".pref-row .head-toggle", prefs).forEach(t => t.classList.remove("on"));
        row.querySelector(".head-toggle").classList.add("on");
        toast(`Notifications: ${row.textContent.trim()}`, "fa-solid fa-bell");
      }));
    },
    skip(conv) {
      const host = threadElFor(conv);
      const note = document.createElement("div");
      note.className = "delegated-note msg-enter";
      note.innerHTML = `<i class="fa-solid fa-satellite-dish"></i><span><strong>Remote proxy agent.</strong> Skip runs its own loop, planning, skills and memory on its side — MJ assembles a governed <strong>context bag</strong> and ships it per turn. Plan mode &amp; local skills are off here by design.</span>`;
      host.appendChild(note);
      addMessage("user", `Summarize Q2 member churn and chart the trend.`, { conv });
      emitReceipt(conv);
      addMessage("agent", `Q2 churn was <strong>3.1%</strong>, down from 3.8% in Q1 — the third consecutive quarterly improvement. The dip concentrates in the association segment after the renewal-reminder workflow launched. Chart's attached; want the cohort table too?`, { conv, who: "Skip Analyst", av: "SK", avBg: "var(--mj-status-info)" });
    },
    generic(conv) {
      addMessage("agent", `New thread${conv.project ? ` in <strong>${esc(conv.project)}</strong>` : ""} — what should we dig into?`, { conv });
    },
  };

  /* proxy transparency receipt (Proxy · Option C) */
  function emitReceipt(conv) {
    conv = conv || activeConv();
    const r = document.createElement("div");
    r.className = "receipt msg-enter";
    r.innerHTML = `
      <div class="receipt-head"><i class="fa-solid fa-arrow-up-right-from-square"></i> Context sent to Skip · 3 shared <i class="fa-solid fa-chevron-down chev"></i></div>
      <div class="receipt-body">
        <div class="receipt-row"><i class="fa-solid fa-database"></i> Entities · Members, Subscriptions <span class="st shared">✓ shared</span></div>
        <div class="receipt-row"><i class="fa-solid fa-table"></i> Stored query · Churn by Month <span class="st shared">✓ shared</span></div>
        <div class="receipt-row"><i class="fa-solid fa-note-sticky"></i> Project notes · "Q2 review" <span class="st shared">✓ shared</span></div>
        <div class="receipt-row"><i class="fa-solid fa-cube"></i> Artifacts <span class="st off">— off</span></div>
        <div class="receipt-row"><i class="fa-solid fa-user"></i> User PII <span class="st off">— off</span></div>
      </div>
      <div class="receipt-foot"><i class="fa-solid fa-shield-halved"></i> Plan, skills &amp; memory handled remotely by Skip · single-step proxy call</div>`;
    r.querySelector(".receipt-head").addEventListener("click", () => r.classList.toggle("open"));
    threadElFor(conv).appendChild(r);
    if (conv === activeConv()) scrollDown();
    return r;
  }

  /* invite card (Group · Option C) */
  function emitInviteCard(name, email, isMarcus) {
    const conv = CONVS.group;
    const card = document.createElement("div");
    card.className = "invite-card msg-enter";
    const initials = name.split(/[\s.]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join("");
    card.innerHTML = `
      <span class="av">${initials}</span>
      <div class="who">
        <div class="nm">${esc(name)} <span class="pill warning sm">Invited</span></div>
        <div class="em">${esc(email)} · invited as Guest</div>
      </div>
      <button class="btn sm" data-act="accept"><i class="fa-solid fa-check"></i> Accept</button>
      <button class="btn secondary sm" data-act="decline">Decline</button>
      <span class="small muted">awaiting response</span>`;
    card.querySelector('[data-act="accept"]').addEventListener("click", () => {
      card.querySelector(".who .nm").innerHTML = `${esc(name)} <span class="pill success sm">Active</span>`;
      card.querySelector('[data-act="accept"]').remove();
      card.querySelector('[data-act="decline"]').remove();
      card.querySelector(".small.muted").textContent = "joined just now";
      if (isMarcus) { marcusStatus = "active"; renderRoster(); }
      toast(`${name} joined the conversation`, "fa-solid fa-user-check");
    });
    card.querySelector('[data-act="decline"]').addEventListener("click", () => {
      card.querySelector(".who .nm").innerHTML = `${esc(name)} <span class="pill sm">Declined</span>`;
      card.querySelector('[data-act="accept"]').remove();
      card.querySelector('[data-act="decline"]').remove();
      card.querySelector(".small.muted").textContent = "declined";
      toast(`${name} declined`, "fa-solid fa-user-xmark");
    });
    threadElFor(conv).appendChild(card);
    return card;
  }

  /* ========================================================== PLAN MODE */
  function setPlanMode(on) {
    state.planMode = on;
    const t = $("#planToggle");
    if (t) t.querySelector(".mini-switch").classList.toggle("off", !on);
    $("#sendLabel").textContent = on ? "Plan & send" : "Send";
    $("#capNote").innerHTML = on
      ? `<span class="plan-active-note"><i class="fa-solid fa-list-check"></i> Sage will propose a plan before running</span>`
      : `<i class="fa-solid fa-circle-info"></i> Plan toggle shows only on plan-capable agents`;
  }

  const PLAN_STEPS = [
    "Pull all 142 open opportunities for Acme Renewal",
    "Group by owner and rank by deal amount",
    "Flag deals slipping past the end of quarter",
    "Draft an exec summary with recommended next actions",
  ];

  function emitPlanCard() {
    const conv = activeConv();
    const card = document.createElement("div");
    card.className = "plan-card msg-enter";
    card.innerHTML = `
      <div class="plan-head">
        <span class="av">S</span>
        <span class="title">Sage · Proposed plan</span>
        <span class="pill brand" style="margin-left:auto;"><i class="fa-solid fa-list-check"></i> <span class="step-count">4</span> steps</span>
      </div>
      <ol class="plan-steps"></ol>
      <div class="plan-foot">
        <button class="btn sm" data-act="approve"><i class="fa-solid fa-check"></i> Approve &amp; run</button>
        <button class="btn secondary sm" data-act="add"><i class="fa-solid fa-plus"></i> Add step</button>
        <button class="btn ghost sm" data-act="reject" style="margin-left:auto;"><i class="fa-solid fa-xmark"></i> Reject</button>
      </div>`;
    const ol = card.querySelector(".plan-steps");
    PLAN_STEPS.forEach(t => ol.appendChild(makePlanStep(t)));
    renumber(card);
    card.querySelector('[data-act="approve"]').addEventListener("click", () => runPlan(card));
    card.querySelector('[data-act="reject"]').addEventListener("click", () => rejectPlan(card));
    card.querySelector('[data-act="add"]').addEventListener("click", () => {
      const li = makePlanStep("New step — click to edit");
      ol.appendChild(li); renumber(card);
      const txt = li.querySelector(".step-text");
      txt.focus(); document.getSelection().selectAllChildren(txt);
    });
    threadElFor(conv).appendChild(card);
    anchor(conv, "Proposed plan", "fa-list-check", card);
    scrollDown();
  }

  function makePlanStep(text) {
    const li = document.createElement("li");
    li.className = "plan-step pending";
    li.innerHTML = `
      <span class="num">1</span>
      <div class="body">
        <div class="step-text" contenteditable="true" spellcheck="false">${esc(text)}</div>
        <div class="edit-hint"><i class="fa-solid fa-pen"></i> click to edit this step</div>
        <div class="step-state"><span class="lbl">Pending</span></div>
      </div>
      <button class="step-rm" title="Remove step"><i class="fa-solid fa-xmark"></i></button>`;
    const txt = li.querySelector(".step-text");
    txt.addEventListener("focus", () => li.classList.add("editing"));
    txt.addEventListener("blur", () => li.classList.remove("editing"));
    txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); txt.blur(); } });
    li.querySelector(".step-rm").addEventListener("click", () => {
      const card = li.closest(".plan-card");
      li.remove(); renumber(card);
    });
    return li;
  }

  function renumber(card) {
    const steps = $$(".plan-step", card);
    steps.forEach((s, i) => { const n = s.querySelector(".num"); if (n && s.dataset.state !== "running" && s.dataset.state !== "done") n.textContent = i + 1; });
    const c = card.querySelector(".step-count"); if (c) c.textContent = steps.length;
  }

  function rejectPlan(card) {
    card.classList.add("collapsing");
    setTimeout(() => {
      card.remove();
      addMessage("agent", `No problem — I won't run anything. Tell me what you'd like to change and I'll re-plan.`);
    }, 380);
  }

  /* skill activation lines inside the run (Skills · Option C timeline rider) */
  function skillStepEl(skill, note) {
    const li = document.createElement("li");
    li.className = "skill-step";
    li.innerHTML = `
      <span class="sicon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
      <span>Skill activated · <b>${esc(skill.name)}</b> — ${esc(note)}</span>
      <span class="unlocked">${skill.actions.slice(0, 3).map(a => `<span class="tool-tag">${esc(a)}</span>`).join("")}</span>`;
    return li;
  }

  function runPlan(card) {
    const steps = $$(".plan-step", card);
    card.querySelector(".plan-foot").innerHTML =
      `<span class="row" style="color:var(--mj-brand-primary);font-weight:600;font-size:12.5px;"><i class="fa-solid fa-spinner fa-spin"></i> Running approved plan…</span>`;
    $$(".step-text", card).forEach(t => t.setAttribute("contenteditable", "false"));
    $$(".step-rm", card).forEach(b => b.style.display = "none");
    const ol = card.querySelector(".plan-steps");
    const skillsOn = state.acceptsSkills !== "None";
    const crm = SKILLS.find(s => s.id === "crm"), voice = SKILLS.find(s => s.id === "voice");

    let i = 0;
    const tick = () => {
      if (i >= steps.length) return finishPlan(card);
      const li = steps[i];
      if (skillsOn && i === 0 && crm.enabled) ol.insertBefore(skillStepEl(crm, "pulled account context"), li);
      if (skillsOn && i === steps.length - 1 && voice.enabled) ol.insertBefore(skillStepEl(voice, "applied to summary shaping"), li);
      li.classList.remove("pending"); li.classList.add("running"); li.dataset.state = "running";
      li.querySelector(".num").innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
      li.querySelector(".step-state").innerHTML = `<span>Running…</span><span class="mini-prog"><i></i></span>`;
      requestAnimationFrame(() => { const f = li.querySelector(".mini-prog > i"); if (f) f.style.width = "100%"; });
      scrollDown();
      setTimeout(() => {
        li.classList.remove("running"); li.classList.add("done"); li.dataset.state = "done";
        li.querySelector(".num").innerHTML = `<i class="fa-solid fa-check"></i>`;
        li.querySelector(".step-state").innerHTML = `<span>Done</span>`;
        i++; tick();
      }, 1050);
    };
    tick();
  }

  function finishPlan(card) {
    const n = $$(".plan-step", card).length;
    card.querySelector(".plan-foot").innerHTML =
      `<span class="row" style="color:var(--mj-status-success);font-weight:700;font-size:12.5px;"><i class="fa-solid fa-circle-check"></i> Plan complete · ${n} steps</span>`;
    bumpGauge(14, 18.4, 0.42);
    setTimeout(() => {
      addMessage("agent", `All steps are done. Dana's three slipping deals are flagged and I drafted the exec summary. Here's the revenue breakdown I generated along the way:`);
      const conv = activeConv();
      const art = emitArtifactCard(conv);
      anchor(conv, "Post-run artifact", "fa-chart-column", art);
    }, 500);
  }

  /* ============================================================ ARTIFACT */
  function emitArtifactCard(conv) {
    conv = conv || activeConv();
    const card = document.createElement("div");
    card.className = "art-card msg-enter";
    card.innerHTML = `
      <div class="art-card-top">
        <div class="art-card-icon"><i class="fa-solid fa-chart-column"></i></div>
        <div class="art-card-meta">
          <div class="nm">Q3 Revenue by Region</div>
          <div class="sub">Live component · v${artifact.current} · <span class="live-tag"><span class="live-dot"></span>Live</span></div>
        </div>
        <button class="btn sm" data-act="open" style="margin-left:auto;"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Open</button>
      </div>`;
    card.querySelector('[data-act="open"]').addEventListener("click", openArtifact);
    threadElFor(conv).appendChild(card);
    if (conv === activeConv()) scrollDown();
    return card;
  }

  function maxVal(rows) { return Math.max(...rows.map(r => r[1])); }

  function openArtifact() {
    state.panelMode = "artifact";
    state.panelWasOpen = true;
    $("#app").classList.add("panel-open");
    $("#app").style.setProperty("--right-w", "428px");
    $("#right").classList.remove("dimmed");
    renderArtifact();
  }

  function backToMemory() {
    state.panelMode = "memory";
    $("#app").style.setProperty("--right-w", "336px");
    renderMemory();
    applyTempUI();
  }

  function renderArtifact() {
    const head = $("#rightHead");
    head.innerHTML = `
      <button class="icon-btn" id="artBack" title="Back to memory"><i class="fa-solid fa-arrow-left"></i></button>
      <span class="ptitle"><i class="fa-solid fa-chart-column"></i> ${artifact.name}</span>
      <span class="live-tag" style="margin-left:auto;"><span class="live-dot"></span>${artifact.editing ? "Editing" : "Live"}</span>`;
    $("#artBack").addEventListener("click", backToMemory);

    const ver = artifact.versions.find(v => v.v === artifact.selected);
    const isLatest = artifact.selected === artifact.current;
    const body = $("#rightBody");
    body.innerHTML = `
      <div class="art-toolbar">
        <span class="pill info sm">Report</span>
        <span class="pill sm">v${ver.v}${isLatest ? "" : " · older"}</span>
        <span class="spacer" style="flex:1"></span>
        ${isLatest
          ? (artifact.editing
            ? `<button class="btn sm" data-act="save"><i class="fa-solid fa-floppy-disk"></i> Save</button>
               <button class="btn ghost sm" data-act="canceledit">Cancel</button>`
            : `<button class="btn secondary sm" data-act="edit"><i class="fa-solid fa-pen"></i> Edit</button>`)
          : `<button class="btn secondary sm" data-act="restore"><i class="fa-solid fa-rotate-left"></i> View latest</button>`}
        <button class="btn secondary sm" data-act="share"><i class="fa-solid fa-share-nodes"></i> Share</button>
        <button class="btn secondary sm" data-act="remix"><i class="fa-solid fa-code-branch"></i> Remix</button>
      </div>

      <div class="ver-rail">
        <div class="rail-title">Version history</div>
        <div class="ver-track">${artifact.versions.slice().reverse().map(v => `
          <div class="ver-item ${v.v === artifact.selected ? "active" : ""}" data-ver="${v.v}">
            <div class="v-num">v${v.v} ${v.v === artifact.current ? `<span class="pill brand sm">current</span>` : ""}</div>
            <div class="v-meta">${v.author} · ${v.when}</div>
          </div>`).join("")}</div>
      </div>

      <div class="art-render">${renderComp(ver, artifact.editing && isLatest)}</div>`;

    $$(".ver-item", body).forEach(it => it.addEventListener("click", () => {
      artifact.selected = +it.dataset.ver;
      if (artifact.selected !== artifact.current) artifact.editing = false;
      renderArtifact();
    }));
    const wire = (sel, fn) => { const b = body.querySelector(sel); if (b) b.addEventListener("click", fn); };
    wire('[data-act="edit"]', () => { artifact.editing = true; renderArtifact(); });
    wire('[data-act="canceledit"]', () => { artifact.editing = false; renderArtifact(); });
    wire('[data-act="restore"]', () => { artifact.selected = artifact.current; renderArtifact(); });
    wire('[data-act="save"]', saveArtifact);
    wire('[data-act="share"]', openShare);
    wire('[data-act="remix"]', remixArtifact);
  }

  function renderComp(ver, editing) {
    const mx = maxVal(ver.rows);
    const total = ver.rows.reduce((a, r) => a + r[1], 0);
    const rows = ver.rows.map((r, i) => {
      const [label, val] = r;
      const w = Math.round(val / mx * 100);
      const hl = label === ver.hl ? "hl" : "";
      return `<div class="bar-row ${hl}">
        <span class="bl">${esc(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div>
        ${editing
          ? `<input class="bv-edit" data-i="${i}" value="${val}">`
          : `<span class="bv">$${val.toFixed(1)}M</span>`}
      </div>`;
    }).join("");
    return `<div class="mini-comp">
      <h4>${editing
        ? `<input class="ttl-edit" id="ttlEdit" value="${esc(ver.title)}">`
        : esc(ver.title)}</h4>
      ${rows}
      <div class="art-total"><span>Total</span><span>$${total.toFixed(1)}M</span></div>
    </div>`;
  }

  function saveArtifact() {
    const cur = artifact.versions.find(v => v.v === artifact.current);
    const title = ($("#ttlEdit") && $("#ttlEdit").value.trim()) || cur.title;
    const rows = cur.rows.map((r, i) => {
      const inp = $(`.bv-edit[data-i="${i}"]`);
      const val = inp ? parseFloat(inp.value) : r[1];
      return [r[0], isNaN(val) ? r[1] : val];
    });
    const nv = artifact.current + 1;
    artifact.versions.push({ v: nv, author: "You", when: "just now", title, rows, hl: cur.hl });
    artifact.current = nv; artifact.selected = nv; artifact.editing = false;
    renderArtifact();
    bumpGauge(3, 2.1, 0.04);
    toast(`Saved as v${nv} — you're now a collaborator`, "fa-solid fa-floppy-disk");
  }

  function remixArtifact() {
    const id = "remix" + (++convSeq);
    defineConv(id, { title: "Q3 Revenue (remix)", project: null });
    const conv = CONVS[id];
    conv.seeded = true;
    sysNote(`<i class="fa-solid fa-code-branch"></i> Remixed from <strong>Q3 Pipeline Review</strong> — you own this copy; the original is untouched`, conv);
    emitArtifactCard(conv);
    addRailConv(id, conv.title, "direct", "remix");
    switchConv(id);
    toast("Remixed into a new conversation — original untouched", "fa-solid fa-code-branch");
  }

  /* ------------------------------------------------------- SHARE dialog */
  function openShare() {
    const scrim = $("#shareScrim");
    scrim.innerHTML = `
      <div class="dialog" id="shareDlg">
        <div class="dialog__head">
          <i class="fa-solid fa-share-nodes" style="color:var(--mj-brand-primary)"></i>
          <h3>Share "${artifact.name}"</h3>
          <span class="pill sm" style="margin-left:auto;">v${artifact.current}</span>
        </div>
        <div class="dialog__body">
          <div class="label">People &amp; roles (internal)</div>
          <div class="share-person"><span class="av">JD</span><span class="nm">Jordan Diaz</span><span class="rl"><span class="pill sm">Can edit</span></span></div>
          <div class="share-person"><span class="av">DC</span><span class="nm">Dana Cole</span><span class="rl"><span class="pill sm">Can view</span></span></div>
          <button class="mem-btn" style="margin-top:6px;"><i class="fa-solid fa-plus"></i> Add people</button>
          <hr class="divider">
          <div class="spread" style="margin-bottom:10px;">
            <label class="head-toggle ${state.canPublish ? "on" : ""}" id="pubSim" style="font-size:11.5px;">
              <span class="track"></span><span>Simulate: I have "Can Publish Artifacts Publicly"</span>
            </label>
          </div>
          <div id="pubArea"></div>
        </div>
        <div class="dialog__foot">
          <button class="btn" id="shareDone">Done</button>
          <button class="btn ghost" id="shareCancel" style="margin-left:auto;">Close</button>
        </div>
      </div>`;
    scrim.classList.add("open");
    renderPubArea();
    $("#pubSim").addEventListener("click", () => { state.canPublish = !state.canPublish; $("#pubSim").classList.toggle("on", state.canPublish); renderPubArea(); });
    $("#shareDone").addEventListener("click", closeShare);
    $("#shareCancel").addEventListener("click", closeShare);
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closeShare(); });
  }
  function renderPubArea() {
    const area = $("#pubArea");
    if (state.canPublish) {
      area.innerHTML = `
        <div class="public-section">
          <div class="spread" style="margin-bottom:8px;">
            <div class="label" style="margin:0;">Public link</div>
            <span class="pill success"><i class="fa-solid fa-lock-open"></i> Read-only</span>
          </div>
          <div class="link-box">
            <input class="input" readonly value="https://app.mj.dev/a/9f3a2c1b" id="pubLink">
            <button class="btn sm" id="copyLink"><i class="fa-regular fa-copy"></i> Copy</button>
            <button class="btn secondary sm" id="revokeLink">Revoke</button>
          </div>
          <div class="small muted" style="margin-top:7px;"><i class="fa-solid fa-shield-halved"></i> Server-minted, single-artifact Magic Link · expires in 30 days · no login required.</div>
        </div>`;
      $("#copyLink").addEventListener("click", () => { copyText($("#pubLink").value); toast("Public link copied"); });
      $("#revokeLink").addEventListener("click", () => toast("Public link revoked — external access ends now", "fa-solid fa-ban"));
    } else {
      area.innerHTML = `<div class="gated-note"><i class="fa-solid fa-lock"></i> Public link sharing isn't available on your account. The Magic-Link section is hidden entirely.</div>`;
    }
  }
  function closeShare() { $("#shareScrim").classList.remove("open"); }

  /* ============================================================== MEMORY */
  function renderMemory() {
    if (state.panelMode !== "memory" || !activeConvId) return;
    const conv = activeConv();
    const head = $("#rightHead");
    head.innerHTML = `<span class="ptitle"><i class="fa-solid fa-brain"></i> What I remember</span>
      <button class="icon-btn" id="rightClose" title="Collapse panel" style="margin-left:auto;"><i class="fa-solid fa-xmark"></i></button>`;
    $("#rightClose").addEventListener("click", () => { $("#app").classList.remove("panel-open"); state.panelWasOpen = false; });

    const body = $("#rightBody");
    const proj = conv.project;
    const f = state.memScope;
    const showProject = (m) => m.scope === "project" && proj && m.project === proj && (f === "project" || f === "all");
    const showGlobal = (m) => m.scope === "global" && (f !== "project" || true) && (f === "all" || f === "global" || f === "project");
    const visible = MEMORIES.filter(m => showProject(m) || showGlobal(m));
    const pMems = visible.filter(m => m.scope === "project");
    const gMems = visible.filter(m => m.scope === "global");

    let html = `
      <div class="temp-note"><i class="fa-solid fa-user-secret"></i> Temporary chat is on — memory is paused for this conversation.</div>
      <div class="scope-row">
        ${proj ? `<button class="scope-chip ${f === "project" ? "active" : ""}" data-f="project">${esc(proj)}</button>` : ""}
        <button class="scope-chip ${f === "all" ? "active" : ""}" data-f="all">All projects</button>
        <button class="scope-chip ${f === "global" ? "active" : ""}" data-f="global">Global</button>
      </div>`;
    if (!proj) html += `<div class="gated-note" style="margin-bottom:12px;"><i class="fa-solid fa-circle-info"></i> No project on this conversation — new memories save to Global.</div>`;

    if (pMems.length) {
      html += `<div class="mem-group-head"><i class="fa-solid fa-folder"></i> ${esc(proj)} <span class="count">· ${pMems.length}</span></div>`;
      html += pMems.map(memRow).join("");
    }
    if (gMems.length) {
      html += `<div class="mem-group-head"><i class="fa-solid fa-globe"></i> Global <span class="count">· ${gMems.length}</span></div>`;
      html += gMems.map(memRow).join("");
    }
    if (!visible.length) html += `<div class="mem-empty"><i class="fa-solid fa-brain" style="font-size:22px;opacity:.4"></i><br>Nothing remembered in this scope yet.</div>`;
    body.innerHTML = html;

    $("#rightFoot").innerHTML = `<div class="spread">
      <span class="small muted"><i class="fa-solid fa-cloud"></i> Stored to your account · synced</span>
      <button class="btn secondary sm" id="addMem"><i class="fa-solid fa-plus"></i> Add</button>
    </div>`;

    $$(".scope-chip", body).forEach(c => c.addEventListener("click", () => { state.memScope = c.dataset.f; renderMemory(); }));
    $$(".mem-item", body).forEach(wireMemRow);
    $("#addMem").addEventListener("click", () => {
      const conv2 = activeConv();
      MEMORIES.unshift({ id: state.nextMemId++, text: "New memory — click Edit to change", scope: conv2.project && state.memScope !== "global" ? "project" : "global", project: conv2.project, learned: "Just now", flash: true });
      renderMemory();
    });
  }

  function memRow(m) {
    const pill = m.scope === "project" ? `<span class="pill brand sm">Project</span>` : `<span class="pill sm">Global</span>`;
    const prov = m.provisional ? `<span class="pill warning sm">Provisional</span>` : "";
    return `<div class="mem-item ${m.flash ? "flash" : ""}" data-id="${m.id}">
      <div class="mem-text">${esc(m.text)}</div>
      <div class="mem-meta">${pill}${prov}<span><i class="fa-regular fa-clock"></i> ${m.learned}</span></div>
      <div class="mem-actions">
        ${m.provisional ? `<button class="mem-btn" data-act="confirm" style="color:var(--mj-status-success);"><i class="fa-solid fa-check"></i> Confirm</button>` : ""}
        <button class="mem-btn" data-act="edit"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="mem-btn danger" data-act="forget"><i class="fa-solid fa-trash"></i> Forget</button>
      </div>
    </div>`;
  }

  function wireMemRow(row) {
    const id = +row.dataset.id;
    const m = MEMORIES.find(x => x.id === id);
    if (m && m.flash) m.flash = false;
    const txt = row.querySelector(".mem-text");
    const confirmBtn = row.querySelector('[data-act="confirm"]');
    if (confirmBtn) confirmBtn.addEventListener("click", () => { m.provisional = false; m.flash = true; renderMemory(); toast("Promoted to Active memory", "fa-solid fa-brain"); });
    row.querySelector('[data-act="edit"]').addEventListener("click", () => {
      const editing = txt.getAttribute("contenteditable") === "true";
      if (!editing) {
        txt.setAttribute("contenteditable", "true"); txt.focus();
        document.getSelection().selectAllChildren(txt);
        row.querySelector('[data-act="edit"]').innerHTML = `<i class="fa-solid fa-check"></i> Save`;
      } else commitEdit();
    });
    txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } });
    txt.addEventListener("blur", commitEdit);
    function commitEdit() {
      if (txt.getAttribute("contenteditable") !== "true") return;
      txt.setAttribute("contenteditable", "false");
      m.text = txt.textContent.trim();
      row.querySelector('[data-act="edit"]').innerHTML = `<i class="fa-solid fa-pen"></i> Edit`;
      toast("Memory updated", "fa-solid fa-brain");
    }
    row.querySelector('[data-act="forget"]').addEventListener("click", () => {
      row.classList.add("fade");
      setTimeout(() => {
        const i = MEMORIES.findIndex(x => x.id === id);
        if (i >= 0) MEMORIES.splice(i, 1);
        renderMemory();
        toast("Forgotten", "fa-solid fa-trash");
      }, 360);
    });
  }

  /* memory MOMENT (inline chip · Option B) + panel sync */
  function maybeMemoryMoment(userText) {
    const conv = activeConv();
    if (conv.kind !== "std" || conv.temporary || !conv.memoryOn) return false;
    if (!/\b(remember|loop in|always|cc\b|keep .* in the loop)\b/i.test(userText)) return false;

    let memText = "Loop in Dana Cole (VP Ops) on all summaries.";
    const m = userText.match(/loop in ([A-Z][a-z]+)/i);
    if (m && !/dana/i.test(userText)) memText = `Loop in ${m[1]} on summaries.`;

    const mem = { id: state.nextMemId++, text: memText, scope: conv.project ? "project" : "global", project: conv.project, learned: "Just now", provisional: true, flash: true };
    MEMORIES.unshift(mem);
    if (state.panelMode === "memory") renderMemory();

    addMessage("agent", `Got it — I'll keep Dana in the loop on summaries going forward.`);
    const chip = document.createElement("div");
    chip.className = "mem-chip msg-enter";
    chip.innerHTML = `
      <div class="chip-lead"><i class="fa-solid fa-brain"></i> I'll remember</div>
      <div class="chip-body">${esc(memText)}</div>
      <div class="chip-actions">
        <button class="btn sm" data-act="keep"><i class="fa-solid fa-check"></i> Keep</button>
        <button class="mem-btn" data-act="discard">Discard</button>
        <select class="mini-select" data-scope>
          ${conv.project ? `<option value="project">This project</option>` : ""}
          <option value="global" ${conv.project ? "" : "selected"}>Global</option>
        </select>
        <a class="small" style="color:var(--mj-text-link);margin-left:auto;cursor:pointer;" data-act="manage">Manage</a>
      </div>`;
    threadElFor(conv).appendChild(chip);
    anchor(conv, "Memory moment", "fa-brain", chip);
    scrollDown();

    chip.querySelector("[data-scope]").addEventListener("change", (e) => {
      mem.scope = e.target.value; mem.project = e.target.value === "global" ? null : conv.project;
      if (state.panelMode === "memory") renderMemory();
    });
    chip.querySelector('[data-act="keep"]').addEventListener("click", () => {
      mem.provisional = false; mem.flash = true;
      chip.classList.add("kept");
      chip.querySelector(".chip-lead").innerHTML = `<i class="fa-solid fa-circle-check"></i> Remembered`;
      chip.querySelector(".chip-actions").innerHTML = `<span class="small muted">Saved to <strong>${mem.scope === "global" ? "Global" : esc(conv.project)}</strong> memory · visible in the panel →</span>`;
      if (state.panelMode === "memory") renderMemory();
      toast("Saved to memory", "fa-solid fa-brain");
    });
    chip.querySelector('[data-act="discard"]').addEventListener("click", () => {
      const i = MEMORIES.findIndex(x => x.id === mem.id);
      if (i >= 0) MEMORIES.splice(i, 1);
      if (state.panelMode === "memory") renderMemory();
      chip.classList.add("fade");
      setTimeout(() => chip.remove(), 360);
    });
    chip.querySelector('[data-act="manage"]').addEventListener("click", () => {
      if (state.panelMode !== "memory") backToMemory();
      $("#app").classList.add("panel-open");
      state.panelWasOpen = true;
    });
    return true;
  }

  /* ================================================ MEMORY / TEMP toggles */
  $("#memToggle").addEventListener("click", () => {
    const conv = activeConv();
    if (conv.temporary || conv.kind !== "std") return;
    conv.memoryOn = !conv.memoryOn;
    $("#memToggle").classList.toggle("on", conv.memoryOn);
    toast(conv.memoryOn ? "Memory on for this conversation" : "Memory off for this conversation", "fa-solid fa-brain");
  });

  $("#tempToggle").addEventListener("click", () => {
    const conv = activeConv();
    if (conv.kind !== "std") return;
    conv.temporary = !conv.temporary;
    applyTempUI();
    toast(conv.temporary ? "Temporary chat — nothing will be saved" : "Back to normal — memory restored",
      conv.temporary ? "fa-solid fa-user-secret" : "fa-solid fa-brain");
  });

  function applyTempUI() {
    const conv = activeConv();
    const on = conv.temporary;
    $("#tempToggle").classList.toggle("on", on);
    $("#tempBanner").style.display = on ? "flex" : "none";
    $("#composer").classList.toggle("temp", on);
    if (conv.kind === "std") $("#composerInput").placeholder = on ? "Message (not saved)…" : `Message ${conv.agent}…`;
    $("#memToggle").classList.toggle("on", !on && conv.memoryOn);
    $("#memToggle").style.opacity = on ? ".5" : "1";
    $("#right").classList.toggle("dimmed", on && state.panelMode === "memory");
  }

  /* ============================================================== POLISH */
  function quoteFrom(block) {
    const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
    const within = sel && block.contains(window.getSelection().anchorNode);
    const text = within ? sel : bubbleText(block);
    const who = block.dataset.who || (block.classList.contains("user") ? "You" : activeConv().agent);
    quotes.push({ text, who });
    renderQuotes();
    toast("Quoted into your reply", "fa-solid fa-quote-right");
    $("#composerInput").focus();
    if (window.getSelection) window.getSelection().removeAllRanges();
  }
  const quotes = [];
  function renderQuotes() {
    const stack = $("#quoteStack");
    stack.innerHTML = quotes.map((q, i) => `
      <div class="qrow">
        <span class="qbar"></span>
        <span style="min-width:0;flex:1;overflow:hidden;">
          <span class="qmeta"><i class="fa-solid fa-quote-left"></i> Replying to ${esc(q.who)}</span>
          <div class="qtxt">${esc(q.text)}</div>
        </span>
        <button class="x" data-i="${i}" title="Remove quote"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join("");
    $$(".qrow .x", stack).forEach(b => b.addEventListener("click", () => { quotes.splice(+b.dataset.i, 1); renderQuotes(); }));
  }

  function copyMsg(block) { copyText(bubbleText(block)); toast("Message copied"); }
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) { } ta.remove(); } }

  function openFork(block) {
    const scrim = $("#forkScrim");
    scrim.innerHTML = `
      <div class="fork-card">
        <div class="ftitle"><i class="fa-solid fa-code-branch"></i> Start a new branch from here?</div>
        <p>We'll copy the conversation up to this message into a new thread so you can explore a different direction without losing this one.</p>
        <div class="row" style="gap:8px;">
          <button class="btn sm" id="forkCreate"><i class="fa-solid fa-code-branch"></i> Create branch</button>
          <button class="btn secondary sm" id="forkCancel">Not now</button>
          <span class="fork-tip" style="margin-left:auto;"><i class="fa-regular fa-lightbulb"></i> Forks keep the original intact</span>
        </div>
      </div>`;
    scrim.classList.add("open");
    $("#forkCreate").addEventListener("click", () => {
      closeFork();
      forkConversation(block);
    });
    $("#forkCancel").addEventListener("click", closeFork);
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closeFork(); });
  }
  function closeFork() { $("#forkScrim").classList.remove("open"); }

  function forkConversation(block) {
    const src = activeConv();
    const upTo = block && block.dataset.logi != null ? +block.dataset.logi : src.log.length - 1;
    const id = "fork" + (++convSeq);
    const conv = defineConv(id, { title: src.title + " (branch)", project: src.project });
    conv.seeded = true;
    const el = threadElFor(conv);
    sysNote(`<i class="fa-solid fa-code-branch"></i> Branched from <strong>${esc(src.title)}</strong> at message ${upTo + 1} — the original is untouched`, conv);
    src.log.slice(0, upTo + 1).forEach(entry => {
      addMessage(entry.role, entry.html, { conv, host: el, who: entry.who, log: true, more: false });
    });
    addRailConv(id, conv.title, src.project ? "acme" : "direct", "fork");
    switchConv(id);
    toast("Branched into a new conversation", "fa-solid fa-code-branch");
  }

  /* ============================================================ LEFT RAIL */
  function addRailConv(id, title, where, tag) {
    const conv = document.createElement("div");
    conv.className = "conv";
    conv.dataset.conv = id;
    conv.innerHTML = `<span class="ci"><i class="fa-regular fa-comment"></i></span>
      <span class="ctitle">${esc(title)}</span>
      ${tag === "fork" ? `<span class="fork-tag"><i class="fa-solid fa-code-branch"></i> fork</span>` : ""}
      ${tag === "remix" ? `<span class="temp-tag">remix</span>` : ""}`;
    conv.addEventListener("click", () => switchConv(id));
    if (where === "acme") { $("#acmeConvs").appendChild(conv); $("#acmeCount").textContent = $$("#acmeConvs .conv").length; }
    else $(".rail__scroll").appendChild(conv);
  }

  $("#newConvBtn").addEventListener("click", () => {
    const id = "new" + (++convSeq);
    defineConv(id, { title: "Untitled conversation", project: "Acme Renewal" });
    addRailConv(id, "Untitled conversation", "acme");
    switchConv(id);
    toast("New conversation in Acme Renewal", "fa-solid fa-plus");
  });
  $$(".conv[data-conv]").forEach(c => c.addEventListener("click", () => switchConv(c.dataset.conv)));

  /* ============================================================ COMPOSER */
  const composerInput = $("#composerInput");
  const composer = $("#composer");
  composerInput.addEventListener("input", () => {
    composerInput.style.height = "auto";
    composerInput.style.height = Math.min(composerInput.scrollHeight, 160) + "px";
  });
  composer.addEventListener("focusin", () => composer.classList.add("focused"));
  composer.addEventListener("focusout", () => composer.classList.remove("focused"));
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("#sendBtn").addEventListener("click", send);

  function send() {
    const conv = activeConv();
    const text = composerInput.value.trim();
    if (!text && !quotes.length) return;
    let html = "";
    if (quotes.length) {
      html += quotes.map(q => `<div class="qrow" style="margin-bottom:7px;background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25);">
        <span class="qbar" style="background:rgba(255,255,255,.7)"></span>
        <span style="flex:1;min-width:0;"><span class="qmeta" style="color:#fff;opacity:.85;"><i class="fa-solid fa-quote-left"></i> ${esc(q.who)}</span>
        <div class="qtxt" style="color:#fff;opacity:.92;">${esc(q.text)}</div></span></div>`).join("");
    }
    html += esc(text || "(quoted)");
    addMessage("user", html);
    const planThisSend = state.planMode && conv.kind === "std";
    composerInput.value = ""; composerInput.style.height = "auto";
    quotes.length = 0; renderQuotes();
    if (planThisSend) setPlanMode(false); // per-request toggle resets

    bumpGauge(5, 6.1, 0.06);

    const typing = showTyping(conv.kind === "remote" ? "Skip Analyst" : undefined);
    setTimeout(() => {
      typing.remove();
      if (conv.kind === "remote") { emitReceipt(conv); remoteReply(text); return; }
      if (conv.kind === "group") { groupReply(text); return; }
      if (planThisSend) { emitPlanCard(); return; }
      if (maybeMemoryMoment(text)) return;
      cannedReply(text);
    }, 850);
  }

  function cannedReply(text) {
    const conv = activeConv();
    let reply;
    if (conv.temporary) reply = `Happy to help here — just a heads-up, this is a temporary chat so I won't save anything or use stored memory.`;
    else if (/cost|token|budget|spend/i.test(text)) reply = `This conversation is at ${conv.ctx.pct}% of the context window so far — hover the % chip up top for the full token and cost breakdown.`;
    else if (/artifact|chart|revenue|report/i.test(text)) reply = `The Q3 revenue breakdown is in the panel — open it to edit, version, or share.`;
    else if (/dana|owner|deal|pipeline/i.test(text)) reply = `Dana Cole still leads with $1.2M across 11 deals; three of those are slipping past quarter-end. Want me to draft the exec note?`;
    else if (/skill/i.test(text)) reply = `I have <strong>${SKILLS.filter(s => s.enabled).length} skills</strong> attached right now — click my pill below to see them, or open Skills in the rail to manage what I can do.`;
    else if (/routine|schedule|every (day|morning|week)/i.test(text)) reply = `That sounds like a routine. Hover my message and choose <strong>⋯ → Turn into a routine</strong>, and I'll run it on your schedule.`;
    else reply = `Got it. Want me to plan this out first? Flip the <strong>Plan</strong> switch on my pill and I'll propose steps before running.`;
    addMessage("agent", reply);
    bumpGauge(4, 5.4, 0.05);
  }

  function remoteReply(text) {
    let reply;
    if (/churn|member/i.test(text)) reply = `Member churn is trending down — 3.1% in Q2 vs 3.8% in Q1. The improvement concentrates where the renewal-reminder workflow is live.`;
    else if (/chart|graph|trend/i.test(text)) reply = `Chart generated on my side and attached to the response payload. Want it broken out by membership tier?`;
    else reply = `Working on it remotely — I ran your request through my own loop with the context MJ shared. Anything else you want pulled into scope?`;
    addMessage("agent", reply, { who: "Skip Analyst", av: "SK", avBg: "var(--mj-status-info)" });
    bumpGauge(3, 3.1, 0.04);
  }

  function groupReply(text) {
    if (/@sage|budget|actual|marketing/i.test(text)) {
      addMessage("agent", `Pulling the comparison now — last year's actuals by line item are in the shared sheet. I'll post the variance table into this thread.`, { who: "Sage", agentTag: true });
    } else {
      sysNote(`<i class="fa-regular fa-eye"></i> Delivered · Priya and Jordan will see this — read receipts update as they catch up`);
    }
    bumpGauge(3, 2.8, 0.03);
  }

  /* =========================================================== CTX GAUGE */
  function rampClass(p) { return p > 85 ? "ramp-crit" : p >= 60 ? "ramp-warn" : "ramp-ok"; }
  function updateGaugeUI() {
    const c = activeConv().ctx;
    const rc = rampClass(c.pct);
    const chip = $("#ctxChip"); chip.className = `ctx-chip ${rc}`; chip.style.setProperty("--pct", c.pct);
    $("#ctxPct").textContent = c.pct + "%";
    const bar = $("#ctxBar"); bar.className = `barline ${rc}`; bar.style.setProperty("--pct", c.pct);
    $("#ctxUsed").textContent = `${c.used}K / 1M`;
    $("#ctxTurn").textContent = `+${c.turn.toFixed(1)}K tok`;
    $("#ctxCost").textContent = `$${c.cost.toFixed(2)}`;
    $("#ctxAvg").textContent = `$${(c.cost / c.msgs).toFixed(3)}`;
  }
  function bumpGauge(dPct, dTok, dCost) {
    const conv = activeConv();
    const c = conv.ctx;
    const before = c.pct;
    c.pct = Math.min(99, c.pct + dPct);
    c.used = Math.round((c.used + dTok) * 10) / 10;
    c.turn = dTok; c.cost = Math.round((c.cost + dCost) * 100) / 100; c.msgs++;
    updateGaugeUI();
    if (before < 85 && c.pct >= 85 && !conv.nudged) { conv.nudged = true; setTimeout(() => emitNudge(conv), 700); }
  }

  /* proactive nudge (Gauge · Option C rider) */
  function emitNudge(conv) {
    const n = document.createElement("div");
    n.className = "nudge msg-enter";
    n.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div style="flex:1;min-width:0;">
        <div class="n-title">Approaching the context limit (${conv.ctx.pct}%)</div>
        <div class="n-body">Older messages may start getting trimmed — responses can lose earlier detail.</div>
        <div class="row" style="gap:8px;">
          <button class="btn sm" data-act="fresh"><i class="fa-solid fa-plus"></i> Start fresh thread</button>
          <button class="btn secondary sm" data-act="summarize"><i class="fa-solid fa-compress"></i> Summarize &amp; continue</button>
        </div>
      </div>
      <button class="x" title="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;
    n.querySelector('[data-act="fresh"]').addEventListener("click", () => {
      const id = "fresh" + (++convSeq);
      defineConv(id, { title: conv.title + " (continued)", project: conv.project });
      const nc = CONVS[id];
      nc.seeded = true;
      sysNote(`<i class="fa-solid fa-arrow-right"></i> Continued from <strong>${esc(conv.title)}</strong> — context reset, key facts carried over`, nc);
      addMessage("agent", `Fresh thread, same context essentials: Dana leads with $1.2M, three enterprise deals slipping, exec summary drafted. Where do we pick up?`, { conv: nc, host: threadElFor(nc) });
      addRailConv(id, nc.title, conv.project ? "acme" : "direct");
      switchConv(id);
      toast("Fresh thread started — key facts carried over", "fa-solid fa-plus");
    });
    n.querySelector('[data-act="summarize"]').addEventListener("click", () => {
      n.remove();
      conv.ctx.pct = 42; conv.ctx.used = 424;
      updateGaugeUI();
      sysNote(`<i class="fa-solid fa-circle-check"></i> Summarized ${conv.ctx.msgs - 6} earlier messages — context back to ${conv.ctx.pct}%`, conv);
      toast("Earlier context summarized", "fa-solid fa-compress");
    });
    n.querySelector(".x").addEventListener("click", () => n.remove());
    threadElFor(conv).appendChild(n);
    anchor(conv, "Context nudge", "fa-triangle-exclamation", n);
    if (conv === activeConv()) scrollDown();
  }

  /* ================================================================= TOC */
  function updateToc() {
    const conv = activeConv();
    const chip = $("#tocChip");
    if (conv.anchors.length < 3) { chip.hidden = true; return; }
    chip.hidden = false;
    $("#tocMenu").innerHTML = conv.anchors.map((a, i) =>
      `<div class="toc-item" data-i="${i}"><i class="fa-solid ${a.icon}"></i> ${esc(a.label)}</div>`).join("");
    $$("#tocMenu .toc-item").forEach(it => it.addEventListener("click", () => {
      chip.classList.remove("open");
      const a = conv.anchors[+it.dataset.i];
      if (a.el && a.el.isConnected) a.el.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }
  $("#tocBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#tocChip").classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".toc-chip")) $("#tocChip").classList.remove("open"); });

  /* ============================================================ ROUTINES */
  function friendlySchedule(r) {
    if (r.freq === "Hourly") return "Every hour";
    if (r.freq === "Daily") return `Every day at ${fmtTime(r.time)}`;
    if (r.freq === "Weekly") {
      const wk = r.days.length === 5 && !r.days.includes("Sa") && !r.days.includes("Su") ? "every weekday" : "on " + r.days.join(", ");
      return `Runs ${wk} at ${fmtTime(r.time)}`;
    }
    return "Custom schedule";
  }
  function fmtTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  $$("#routineTabs .seg-btn").forEach(b => b.addEventListener("click", () => {
    $$("#routineTabs .seg-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    state.routineTab = b.dataset.rtab;
    renderRoutines();
  }));
  $("#newRoutineBtn").addEventListener("click", () => openRoutineSlidein(""));

  function renderRoutines() {
    $("#routineCount").textContent = ROUTINES.length;
    const body = $("#routinesBody");
    if (state.routineTab === "list") return renderRoutineList(body);
    if (state.routineTab === "upcoming") return renderUpcoming(body);
    return renderAlerts(body);
  }

  function renderRoutineList(body) {
    const sel = ROUTINES.find(r => r.id === state.selectedRoutine) || ROUTINES[0];
    body.innerHTML = `<div class="alt-inner">
      ${ROUTINES.map(r => `
        <div class="routine-card ${r.id === sel.id ? "selected" : ""}" data-id="${r.id}">
          <div class="r-top">
            <span class="r-name">${esc(r.name)}</span>
            <span class="pill ${r.status === "Active" ? "success" : "warning"} sm">${r.status}</span>
            <span class="pill ${r.type === "Monitoring" ? "info" : "brand"} sm" style="margin-left:auto;">${r.type}</span>
          </div>
          <div class="r-sched">${friendlySchedule(r)} <span class="muted">(${esc(r.tz)})</span></div>
          <div class="r-meta">
            <span><i class="fa-solid fa-robot"></i> ${esc(r.target)}</span>
            <span class="${/fail/.test(r.last) ? "fail" : "ok"}"><i class="fa-regular fa-clock"></i> Last: ${esc(r.last)}</span>
            <span><i class="fa-solid fa-forward"></i> Next: ${esc(r.next)}</span>
            <span><i class="fa-solid fa-bell"></i> ${r.notify} · ${r.channels.join(" + ")}</span>
          </div>
        </div>`).join("")}
      ${sel ? routineEditorHTML(sel) : ""}
    </div>`;
    $$(".routine-card", body).forEach(c => c.addEventListener("click", () => { state.selectedRoutine = +c.dataset.id; renderRoutineList(body); }));
    if (sel) wireRoutineEditor(body, sel);
  }

  function routineEditorHTML(r) {
    const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
    return `
    <div class="routine-editor" id="routineEditor">
      <div class="re-title"><i class="fa-solid fa-pen-to-square" style="color:var(--mj-brand-primary)"></i> Edit routine <span class="muted" style="font-weight:400;margin-left:auto;font-size:12px;">${esc(r.name)}</span></div>
      <div class="field"><span class="label">Run schedule</span>
        <div class="seg" id="freqSeg">
          ${["Hourly", "Daily", "Weekly"].map(f => `<button class="seg-btn ${r.freq === f ? "active" : ""}" data-f="${f}">${f}</button>`).join("")}
          <button class="seg-btn" data-f="Custom">Custom (cron)</button>
        </div>
      </div>
      <div class="field" id="dayField" ${r.freq === "Weekly" ? "" : "hidden"}>
        <div class="day-chips">${days.map(d => `<button class="day-chip ${r.days.includes(d) ? "on" : ""}" data-d="${d}">${d}</button>`).join("")}</div>
      </div>
      <div class="field row" style="gap:10px;" id="timeField" ${r.freq === "Hourly" ? "hidden" : ""}>
        <div style="flex:1;"><span class="label">At time</span><input class="input" id="rTime" type="time" value="${r.time || "07:30"}"></div>
        <div style="flex:2;"><span class="label">Timezone</span>
          <select class="select" id="rTz"><option>${esc(r.tz)}</option><option>America/Chicago (CT)</option><option>UTC</option></select></div>
      </div>
      <div class="sched-summary" id="schedSummary">${friendlySchedule(r)} · next ${esc(r.next.toLowerCase())}</div>
      <div class="field" style="margin-top:13px;"><span class="label">Notify me</span>
        <div class="notify-chips" id="notifyChips">
          ${["Always", "On success", "On failure", "On change"].map(n => `<button class="scope-chip ${r.notify === n ? "active" : ""}" data-n="${n}">${n}</button>`).join("")}
        </div>
      </div>
      <div class="field"><span class="label">Channels</span>
        <div class="notify-chips">
          ${["In-app", "Email"].map(c => `<button class="scope-chip ${r.channels.includes(c) ? "active" : ""}" data-c="${c}">${c}</button>`).join("")}
          <button class="scope-chip">+ Add recipient</button>
        </div>
      </div>
      <div class="field"><span class="label">Run history</span>
        <table class="run-table"><thead><tr><th>When</th><th>Status</th><th>Duration</th><th>Result</th></tr></thead>
          <tbody>${r.history.map(h => `<tr class="${h.ok ? "ok" : "fail"}"><td>${esc(h.when)}</td><td><span class="st-dot"></span>${h.ok ? "Success" : "Failed"}</td><td>${esc(h.dur)}</td><td>${h.ok && /View/.test(h.result) ? `<a>${esc(h.result)}</a>` : esc(h.result)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="row" style="gap:8px;">
        <button class="btn" id="rSave"><i class="fa-solid fa-floppy-disk"></i> Save changes</button>
        <button class="btn secondary" id="rRunNow"><i class="fa-solid fa-play"></i> Run now</button>
        <button class="btn ghost" id="rPause" style="margin-left:auto;">${r.status === "Active" ? "Pause" : "Resume"}</button>
      </div>
    </div>`;
  }

  function wireRoutineEditor(body, r) {
    const ed = $("#routineEditor", body);
    const summary = () => { $("#schedSummary", ed).textContent = `${friendlySchedule(r)} · next ${r.next.toLowerCase()}`; };
    $$("#freqSeg .seg-btn", ed).forEach(b => b.addEventListener("click", () => {
      if (b.dataset.f === "Custom") return toast("Cron editor — the escape hatch stays available", "fa-solid fa-code");
      r.freq = b.dataset.f;
      $$("#freqSeg .seg-btn", ed).forEach(x => x.classList.toggle("active", x === b));
      $("#dayField", ed).hidden = r.freq !== "Weekly";
      $("#timeField", ed).hidden = r.freq === "Hourly";
      summary();
    }));
    $$(".day-chip", ed).forEach(d => d.addEventListener("click", () => {
      const day = d.dataset.d;
      d.classList.toggle("on");
      if (r.days.includes(day)) r.days = r.days.filter(x => x !== day); else r.days.push(day);
      summary();
    }));
    const t = $("#rTime", ed);
    if (t) t.addEventListener("change", () => { r.time = t.value; summary(); });
    $$("#notifyChips .scope-chip", ed).forEach(c => c.addEventListener("click", () => {
      r.notify = c.dataset.n;
      $$("#notifyChips .scope-chip", ed).forEach(x => x.classList.toggle("active", x === c));
    }));
    $("#rSave", ed).addEventListener("click", () => { toast("Routine saved", "fa-solid fa-floppy-disk"); renderRoutineList($("#routinesBody")); });
    $("#rRunNow", ed).addEventListener("click", () => {
      r.history.unshift({ when: "Just now", ok: true, dur: "6.4s", result: "View digest" });
      r.last = "Just now · ok";
      toast("Run started — result will land in your history", "fa-solid fa-play");
      renderRoutineList($("#routinesBody"));
    });
    $("#rPause", ed).addEventListener("click", () => {
      r.status = r.status === "Active" ? "Paused" : "Active";
      toast(r.status === "Active" ? "Routine resumed" : "Routine paused", "fa-solid fa-pause");
      renderRoutineList($("#routinesBody"));
    });
  }

  function renderUpcoming(body) {
    body.innerHTML = `<div class="alt-inner">
      <div class="agenda-day">Today</div>
      <div class="agenda-item">
        <span class="when">3:00 PM · in 40 min</span>
        <div class="what"><div class="nm">Competitor pricing watch</div><div class="sub">Monitoring · notify on change</div></div>
        <div class="acts"><button class="btn secondary sm" data-a="skip">Skip</button></div>
      </div>
      <div class="agenda-item">
        <span class="when">5:30 PM · in 3 hrs</span>
        <div class="what"><div class="nm">EOD inventory sync</div><div class="sub">Scheduled · notify on failure</div></div>
        <div class="acts"><button class="btn secondary sm" data-a="run">Run now</button></div>
      </div>
      <div class="agenda-day">Tomorrow</div>
      <div class="agenda-item">
        <span class="when">7:30 AM</span>
        <div class="what"><div class="nm">Morning sales digest</div><div class="sub">Scheduled · in-app + email</div></div>
        <div class="acts"><span class="pill brand sm">Weekday</span></div>
      </div>
    </div>`;
    $$('[data-a="skip"]', body).forEach(b => b.addEventListener("click", () => { b.closest(".agenda-item").style.opacity = ".45"; b.textContent = "Skipped"; b.disabled = true; toast("Next occurrence skipped", "fa-solid fa-forward"); }));
    $$('[data-a="run"]', body).forEach(b => b.addEventListener("click", () => toast("Run started", "fa-solid fa-play")));
  }

  function renderAlerts(body) {
    body.innerHTML = `<div class="alt-inner">
      <div class="alert-card">
        <div class="a-title"><i class="fa-solid fa-arrow-trend-down" style="color:var(--mj-status-warning)"></i> Competitor pricing watch — change detected</div>
        <div class="a-body">Acme dropped Pro plan from $99 → $79. Two other SKUs changed.</div>
        <div class="a-foot"><button class="btn secondary sm">View</button> <span>11 min ago</span></div>
      </div>
      <div class="alert-card err">
        <div class="a-title"><i class="fa-solid fa-circle-exclamation" style="color:var(--mj-status-error)"></i> EOD inventory sync — failed</div>
        <div class="a-body">Connection timeout. Will retry on next schedule.</div>
        <div class="a-foot"><button class="btn secondary sm" id="retryAlert">Retry now</button> <span>1 hr ago</span></div>
      </div>
    </div>`;
    const rb = $("#retryAlert", body);
    if (rb) rb.addEventListener("click", () => { toast("Retry queued", "fa-solid fa-rotate-right"); $("#alertBadge").textContent = "1"; rb.closest(".alert-card").style.opacity = ".45"; });
  }

  /* "Turn into a routine" slide-in (Routines · Option B) */
  function openRoutineSlidein(prefill) {
    const s = $("#routineSlidein");
    const draft = { freq: "Daily", days: ["M", "T", "W", "Th", "F"], time: "08:00", notify: "Always", inapp: true, email: false };
    s.innerHTML = `
      <div class="slidein__head">
        <h3><i class="fa-solid fa-clock-rotate-left"></i> Make this a routine</h3>
        <button class="icon-btn" id="riClose" style="margin-left:auto;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="slidein__body">
        ${prefill ? `<div class="src-quote">${esc(prefill.slice(0, 140))}${prefill.length > 140 ? "…" : ""}</div>` : ""}
        <div class="field"><span class="label">Runs against</span>
          <div class="row"><span class="mention-chip" style="cursor:default;"><i class="fa-solid fa-robot"></i> Sage</span><span class="pill sm">prefilled</span></div>
        </div>
        <div class="field"><span class="label">How often</span>
          <div class="seg" id="riFreq">
            ${["Hourly", "Daily", "Weekly"].map(f => `<button class="seg-btn ${draft.freq === f ? "active" : ""}" data-f="${f}">${f}</button>`).join("")}
          </div>
        </div>
        <div class="field" id="riDays" hidden>
          <div class="day-chips">${["Su", "M", "T", "W", "Th", "F", "Sa"].map(d => `<button class="day-chip ${draft.days.includes(d) ? "on" : ""}" data-d="${d}">${d}</button>`).join("")}</div>
        </div>
        <div class="field row" style="gap:10px;" id="riTimeRow">
          <div style="flex:1;"><span class="label">At</span><input class="input" type="time" id="riTime" value="${draft.time}"></div>
          <div style="flex:2;"><span class="label">Timezone</span><select class="select"><option>America/New_York (ET)</option><option>UTC</option></select></div>
        </div>
        <div class="sched-summary" id="riSummary"></div>
        <div class="field" style="margin-top:13px;"><span class="label">Tell me when</span>
          <div class="notify-chips" id="riNotify">
            ${["Always", "On success", "On failure", "On change"].map(n => `<button class="scope-chip ${draft.notify === n ? "active" : ""}" data-n="${n}">${n}</button>`).join("")}
          </div>
        </div>
        <div class="field"><span class="label">Channels</span>
          <div class="notify-chips">
            <button class="scope-chip active" id="riInapp">Notify in chat</button>
            <button class="scope-chip" id="riEmail">Email me</button>
          </div>
        </div>
      </div>
      <div class="slidein__foot">
        <button class="btn" id="riCreate" style="flex:1;justify-content:center;">Create routine</button>
        <button class="btn secondary" id="riCancel">Cancel</button>
      </div>`;
    const scrim = $("#routineScrim");
    scrim.classList.add("open"); s.classList.add("open");
    const close = () => { scrim.classList.remove("open"); s.classList.remove("open"); };
    $("#riClose").addEventListener("click", close);
    $("#riCancel").addEventListener("click", close);
    scrim.addEventListener("click", close);

    const summary = () => {
      const wk = draft.freq === "Weekly" ? (draft.days.length === 5 && !draft.days.includes("Sa") && !draft.days.includes("Su") ? "every weekday" : "on " + draft.days.join(", ")) : "";
      $("#riSummary").textContent =
        draft.freq === "Hourly" ? "Every hour."
          : draft.freq === "Daily" ? `Every day at ${fmtTime(draft.time)} ET.`
            : `Runs ${wk} at ${fmtTime(draft.time)} ET.`;
    };
    summary();
    $$("#riFreq .seg-btn").forEach(b => b.addEventListener("click", () => {
      draft.freq = b.dataset.f;
      $$("#riFreq .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      $("#riDays").hidden = draft.freq !== "Weekly";
      $("#riTimeRow").hidden = draft.freq === "Hourly";
      summary();
    }));
    $$("#riDays .day-chip").forEach(d => d.addEventListener("click", () => {
      const day = d.dataset.d; d.classList.toggle("on");
      if (draft.days.includes(day)) draft.days = draft.days.filter(x => x !== day); else draft.days.push(day);
      summary();
    }));
    $("#riTime").addEventListener("change", (e) => { draft.time = e.target.value; summary(); });
    $$("#riNotify .scope-chip").forEach(c => c.addEventListener("click", () => {
      draft.notify = c.dataset.n;
      $$("#riNotify .scope-chip").forEach(x => x.classList.toggle("active", x === c));
    }));
    $("#riInapp").addEventListener("click", (e) => e.target.classList.toggle("active"));
    $("#riEmail").addEventListener("click", (e) => e.target.classList.toggle("active"));

    $("#riCreate").addEventListener("click", () => {
      let name = (prefill || "New routine").split(/[.?!]/)[0].trim();
      if (name.length > 44) name = name.slice(0, 44).replace(/\s+\S*$/, "") + "…";
      if (!name) name = "New routine";
      ROUTINES.unshift({
        id: Date.now(), name, status: "Active", type: draft.notify === "On change" ? "Monitoring" : "Scheduled",
        freq: draft.freq, days: draft.days.slice(), time: draft.time, tz: "America/New_York (ET)",
        target: "Sage", prompt: prefill || "", notify: draft.notify,
        channels: [$("#riInapp").classList.contains("active") ? "In-app" : null, $("#riEmail").classList.contains("active") ? "Email" : null].filter(Boolean),
        last: "—", next: "Per schedule", history: [],
      });
      $("#routineCount").textContent = ROUTINES.length;
      close();
      const chip = document.createElement("div");
      chip.className = "routine-chip msg-enter";
      chip.innerHTML = `
        <div class="chip-lead"><i class="fa-solid fa-circle-check"></i> Routine created</div>
        <div class="chip-body">${esc($("#riSummary") ? "" : "")}${esc(name)} — runs ${draft.freq.toLowerCase()}${draft.freq !== "Hourly" ? ` at ${fmtTime(draft.time)} ET` : ""}. You'll get it right here in chat. <a data-act="manage">Manage</a></div>`;
      chip.querySelector('[data-act="manage"]').addEventListener("click", () => { state.selectedRoutine = ROUTINES[0].id; state.routineTab = "list"; $$("#routineTabs .seg-btn").forEach(x => x.classList.toggle("active", x.dataset.rtab === "list")); showView("routines"); });
      const conv = activeConv();
      threadElFor(conv).appendChild(chip);
      anchor(conv, "Routine created", "fa-clock-rotate-left", chip);
      scrollDown();
      toast("Routine created — manage it in Routines", "fa-solid fa-clock-rotate-left");
    });
  }

  /* ============================================================== SKILLS */
  $$("#acceptsSeg .seg-btn").forEach(b => b.addEventListener("click", () => {
    state.acceptsSkills = b.dataset.acc;
    $$("#acceptsSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
    renderSkills();
    toast(`Sage now accepts skills: ${state.acceptsSkills}`, "fa-solid fa-wand-magic-sparkles");
  }));
  $("#newSkillBtn").addEventListener("click", () => toast("Skill authoring wizard — fast-follow after the catalog ships", "fa-solid fa-wand-magic-sparkles"));

  function renderSkills() {
    $("#skillCount").textContent = SKILLS.length;
    const acc = state.acceptsSkills;
    const body = $("#skillsBody");
    body.innerHTML = `<div class="alt-inner">
      <div class="skills-grid">
        ${SKILLS.map(s => {
          const effEnabled = acc === "All" ? s.status === "Active" : acc === "None" ? false : s.enabled;
          return `
          <div class="skill-card ${effEnabled ? "enabled" : ""}" data-id="${s.id}">
            <div class="s-top">
              <div class="s-icon"><i class="fa-solid ${s.icon}"></i></div>
              <div style="min-width:0;">
                <div class="s-name">${esc(s.name)}</div>
                <div class="s-desc">${esc(s.desc)}</div>
              </div>
            </div>
            <div class="s-badges">
              ${s.actions.length ? `<span class="pill sm"><i class="fa-solid fa-bolt"></i> ${s.actions.length} Actions</span>` : `<span class="pill sm">Instructions only</span>`}
              ${s.subs.length ? `<span class="pill sm"><i class="fa-solid fa-sitemap"></i> ${s.subs.length} Sub-agent${s.subs.length > 1 ? "s" : ""}</span>` : ""}
              <span class="pill ${s.status === "Active" ? "success" : "warning"} sm">${s.status}</span>
            </div>
            <div class="s-foot">
              <span><i class="fa-solid ${s.share === "Private" ? "fa-lock" : "fa-share-nodes"}"></i> ${s.share}</span>
              <span class="head-toggle ${effEnabled ? "on" : ""} ${acc !== "Limited" || s.status !== "Active" ? "disabled" : ""}" data-tgl="${s.id}"><span class="track"></span></span>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div class="skills-note">
        ${acc === "None" ? `<div class="gated-note"><i class="fa-solid fa-ban"></i> <span><strong>AcceptsSkills: None</strong> — no skills are appended to Sage's prompt, regardless of toggles.</span></div>` : ""}
        ${acc === "All" ? `<div class="gated-note"><i class="fa-solid fa-circle-info"></i> <span><strong>AcceptsSkills: All</strong> — every Active skill is available to Sage; per-skill toggles apply in Limited mode.</span></div>` : ""}
        ${acc === "Limited" ? `<div class="gated-note"><i class="fa-solid fa-circle-info"></i> <span><strong>Limited</strong> — only the skills toggled on are appended to this agent's system prompt. The catalog exposes name + description; instructions &amp; tools load on activation (the <strong>Skill</strong> run-step).</span></div>` : ""}
      </div>
    </div>`;
    $$("[data-tgl]", body).forEach(t => t.addEventListener("click", () => {
      const s = SKILLS.find(x => x.id === t.dataset.tgl);
      s.enabled = !s.enabled;
      renderSkills();
      toast(`${s.name} ${s.enabled ? "enabled" : "disabled"} for Sage`, "fa-solid fa-wand-magic-sparkles");
    }));
  }

  /* ========================================================== PALETTE ⌘K */
  const PALETTE = [
    { g: "Message", i: "fa-solid fa-quote-right", t: "Quote selected text", d: "into the composer", k: "⇧Q", run: () => state.focusedMsg && quoteFrom(state.focusedMsg) },
    { g: "Message", i: "fa-solid fa-code-branch", t: "Fork from this message", d: "branch the thread", k: "F", run: () => state.focusedMsg && openFork(state.focusedMsg) },
    { g: "Message", i: "fa-solid fa-clock-rotate-left", t: "Turn message into a routine", d: "scheduled prompt", run: () => openRoutineSlidein(state.focusedMsg ? bubbleText(state.focusedMsg) : "") },
    { g: "Message", i: "fa-regular fa-copy", t: "Copy message", d: "to clipboard", k: "⌘C", run: () => state.focusedMsg && copyMsg(state.focusedMsg) },
    { g: "Agent", i: "fa-solid fa-list-check", t: "Toggle Plan mode", d: "plan before running", run: () => setPlanMode(!state.planMode) },
    { g: "Agent", i: "fa-solid fa-wand-magic-sparkles", t: "Manage skills", d: "catalog + per-agent toggles", run: () => showView("skills") },
    { g: "Conversation", i: "fa-solid fa-user-secret", t: "Toggle Temporary chat", d: "incognito — no memory", run: () => $("#tempToggle").click() },
    { g: "Conversation", i: "fa-solid fa-gauge-high", t: "Simulate: long conversation", d: "jump context to 88%", run: () => { const c = activeConv(); c.ctx.pct = 83; bumpGauge(5, 42.0, 0.9); } },
    { g: "Workspace", i: "fa-solid fa-clock-rotate-left", t: "Open Routines", d: "list · upcoming · alerts", run: () => showView("routines") },
    { g: "Workspace", i: "fa-solid fa-users", t: "Open group chat", d: "Budget planning · P2 preview", run: () => switchConv("group") },
    { g: "Workspace", i: "fa-solid fa-satellite-dish", t: "Open Skip Analyst", d: "remote proxy agent", run: () => switchConv("skip") },
    { g: "Artifact", i: "fa-solid fa-chart-column", t: "Open artifact", d: "Q3 Revenue by Region", run: openArtifact },
    { g: "Artifact", i: "fa-solid fa-share-nodes", t: "Share artifact", d: "internal + public link", run: () => { openArtifact(); openShare(); } },
    { g: "View", i: "fa-solid fa-circle-half-stroke", t: "Toggle light / dark", run: () => $("#themeBtn").click() },
    { g: "View", i: "fa-solid fa-brain", t: "Open memory panel", d: "what Sage remembers", run: () => { if (state.panelMode !== "memory") backToMemory(); $("#app").classList.add("panel-open"); state.panelWasOpen = true; } },
    { g: "View", i: "fa-regular fa-keyboard", t: "Keyboard shortcuts", d: "the full cheat-sheet", k: "?", run: openCheat },
  ];
  let palSel = 0, palItems = [];
  function openPalette() {
    const scrim = $("#paletteScrim");
    scrim.innerHTML = `
      <div class="palette">
        <div class="palette__q"><i class="fa-solid fa-magnifying-glass"></i>
          <input id="palInput" placeholder="Type a command…" autocomplete="off">
          <span class="kbd">esc</span></div>
        <div class="palette__list" id="palList"></div>
      </div>`;
    scrim.classList.add("open");
    palSel = 0;
    renderPalette("");
    const inp = $("#palInput"); inp.focus();
    inp.addEventListener("input", () => { palSel = 0; renderPalette(inp.value); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); markSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); markSel(); }
      else if (e.key === "Enter") { e.preventDefault(); runPal(palSel); }
      else if (e.key === "Escape") closePalette();
    });
    scrim.addEventListener("click", (e) => { if (e.target === scrim) closePalette(); });
  }
  function renderPalette(q) {
    q = q.toLowerCase();
    palItems = PALETTE.filter(p => !q || (p.t + " " + (p.d || "") + " " + p.g).toLowerCase().includes(q));
    const list = $("#palList");
    if (!palItems.length) { list.innerHTML = `<div class="pgroup-label">No matches</div>`; return; }
    let html = "", lastG = "";
    palItems.forEach((p, i) => {
      if (p.g !== lastG) { html += `<div class="pgroup-label">${p.g}</div>`; lastG = p.g; }
      html += `<div class="pitem ${i === palSel ? "sel" : ""}" data-i="${i}">
        <span class="pi"><i class="${p.i}"></i></span>
        <span class="pt">${p.t} ${p.d ? `<span class="pdesc">· ${p.d}</span>` : ""}</span>
        ${p.k ? `<span class="kbd">${p.k}</span>` : ""}</div>`;
    });
    list.innerHTML = html;
    $$(".pitem", list).forEach(it => it.addEventListener("click", () => runPal(+it.dataset.i)));
  }
  function markSel() { $$(".pitem").forEach((it, i) => it.classList.toggle("sel", i === palSel)); const s = $(".pitem.sel"); if (s) s.scrollIntoView({ block: "nearest" }); }
  function runPal(i) { const p = palItems[i]; if (!p) return; closePalette(); setTimeout(() => p.run(), 60); }
  function closePalette() { $("#paletteScrim").classList.remove("open"); }
  $("#paletteBtn").addEventListener("click", openPalette);

  /* ======================================================== CHEAT SHEET ? */
  function openCheat() {
    const scrim = $("#cheatScrim");
    scrim.innerHTML = `
      <div class="cheat">
        <div class="cheat__head">
          <h3><i class="fa-regular fa-keyboard"></i> Keyboard shortcuts</h3>
          <span class="kbd" style="margin-left:auto;">esc</span>
        </div>
        <div class="cheat__body">
          <div class="cheat-group"><div class="cg-title">Messages</div>
            <div class="cheat-row">Quote focused message <span class="keys"><span class="kbd">⇧</span><span class="kbd">Q</span></span></div>
            <div class="cheat-row">Fork from focused message <span class="keys"><span class="kbd">F</span></span></div>
            <div class="cheat-row">Copy focused message <span class="keys"><span class="kbd">⌘</span><span class="kbd">C</span></span></div>
          </div>
          <div class="cheat-group"><div class="cg-title">Composer</div>
            <div class="cheat-row">Send <span class="keys"><span class="kbd">↵</span></span></div>
            <div class="cheat-row">New line <span class="keys"><span class="kbd">⇧</span><span class="kbd">↵</span></span></div>
            <div class="cheat-row">Send (alt) <span class="keys"><span class="kbd">⌘</span><span class="kbd">↵</span></span></div>
          </div>
          <div class="cheat-group"><div class="cg-title">Workspace</div>
            <div class="cheat-row">Command palette <span class="keys"><span class="kbd">⌘</span><span class="kbd">K</span></span></div>
            <div class="cheat-row">This cheat-sheet <span class="keys"><span class="kbd">?</span></span></div>
            <div class="cheat-row">Close dialogs <span class="keys"><span class="kbd">esc</span></span></div>
          </div>
          <div class="cheat-group"><div class="cg-title">Discoverability</div>
            <div class="cheat-row"><span class="small muted">Every shortcut is also on hover toolbars and in ⌘K — keys accelerate, never gate.</span></div>
          </div>
        </div>
      </div>`;
    scrim.classList.add("open");
    scrim.addEventListener("click", (e) => { if (e.target === scrim) scrim.classList.remove("open"); });
  }
  $("#helpBtn").addEventListener("click", openCheat);

  /* ============================================================ keyboard */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (e.key === "Escape") { closePalette(); closeShare(); closeFork(); $("#cheatScrim").classList.remove("open"); $("#inviteScrim").classList.remove("open"); $("#routineScrim").classList.remove("open"); $("#routineSlidein").classList.remove("open"); return; }
    if (typing) return;
    if (e.key === "?") { e.preventDefault(); openCheat(); }
    else if (e.shiftKey && e.key.toLowerCase() === "q") { e.preventDefault(); if (state.focusedMsg) quoteFrom(state.focusedMsg); }
    else if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (state.focusedMsg) openFork(state.focusedMsg); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      const sel = window.getSelection && window.getSelection().toString();
      if (!sel && state.focusedMsg) { e.preventDefault(); copyMsg(state.focusedMsg); }
    }
  });

  /* ============================================================= misc UI */
  $("#panelToggle").addEventListener("click", () => {
    const open = $("#app").classList.toggle("panel-open");
    state.panelWasOpen = open;
  });
  $("#rightClose").addEventListener("click", () => { $("#app").classList.remove("panel-open"); state.panelWasOpen = false; });

  const tt = $("#tryThis"), ttHost = $("#tryThisHost");
  $("#tryThisHead").addEventListener("click", () => tt.classList.toggle("collapsed"));
  $("#tryThisDismiss").addEventListener("click", (e) => { e.stopPropagation(); ttHost.classList.add("trythis-hidden"); });
  $("#tryThisFab").addEventListener("click", () => ttHost.classList.remove("trythis-hidden"));

  /* ================================================================ init */
  switchConv("q3");
  const first = threadElFor(CONVS.q3).querySelector(".msg-block.agent");
  if (first) setFocused(first);
})();
