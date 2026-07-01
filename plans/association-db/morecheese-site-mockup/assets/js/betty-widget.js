/* Betty voice agent widget — floating FAB + panel
 * Mockup behavior only: scripted conversation + mic-state animation.
 * In production this is wired to MJ Caliber realtime engine.
 */
(function () {
  'use strict';

  const SCRIPTED_DEMOS = [
    {
      user: "When's the next regional workshop in California?",
      betty: "The next California workshop is the <strong>Sonoma Valley Sensory Intensive</strong>, August 14–16 at Point Reyes. There are 6 seats remaining at the member rate ($425). Want me to open the registration page?"
    },
    {
      user: "How do I become a Certified Master Cheesemaker?",
      betty: "The Master Cheesemaker certification is a 3-year program with 6 courses, 200 supervised production hours, and a final practical exam. Most candidates also complete our Food Safety Level 2 and HACCP for Small Producers first. The next cohort opens enrollment October 1. Should I take you to the program page?"
    },
    {
      user: "What's the federation's stance on the FDA dairy labeling proposal?",
      betty: "Our Standards Committee adopted a formal position on June 12, 2026: <strong>support with revisions</strong>. We're advocating for clearer terroir-of-origin labeling but pushing back on the proposed pasteurization disclosure language for traditional cheeses. Robert Kihm chairs the working group — would you like to see the full position paper?"
    },
    {
      user: "Are there events near me this fall?",
      betty: "I'd love to help — what's your zip code, or which chapter region are you in? We have 23 events scheduled across all 15 chapters between September and December, ranging from a Vermont aging-cave tour to the National Cheese Awards gala in Madison."
    }
  ];

  const SUGGESTS = [
    "Tell me about membership tiers",
    "When's the next event near me?",
    "How do I get certified?",
    "What's our position on dairy labeling?",
    "Show me my renewal status"
  ];

  function createFAB() {
    const fab = document.createElement('button');
    fab.className = 'betty-fab';
    fab.setAttribute('aria-label', 'Open Betty, the MoreCheese voice agent');
    fab.innerHTML = `
      <span class="betty-fab-pulse" aria-hidden="true"></span>
      <span>Ask Betty</span>
      <i class="fa-solid fa-microphone" aria-hidden="true"></i>
    `;
    return fab;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.className = 'betty-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Betty conversation');
    panel.innerHTML = `
      <header class="betty-head">
        <div class="betty-avatar" aria-hidden="true">B</div>
        <div>
          <div class="betty-name">Betty</div>
          <div class="betty-status">● Voice + text · powered by MJ Caliber</div>
        </div>
        <button class="betty-close" aria-label="Close" type="button">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      <div class="betty-body" id="betty-body">
        <div class="betty-msg">
          <div class="betty-msg-mini-avatar" aria-hidden="true">B</div>
          <div class="betty-msg-bubble">
            Hi there — I'm Betty, the MoreCheese knowledge agent. I know our events, certifications, standards, advocacy positions, and member benefits inside and out. Ask me anything, or tap the mic to talk.
          </div>
        </div>
      </div>
      <div class="betty-suggests" id="betty-suggests"></div>
      <footer class="betty-foot">
        <input class="betty-input" type="text" placeholder="Ask about events, certifications, standards…" aria-label="Type a question for Betty" />
        <button class="betty-mic" aria-label="Toggle microphone" type="button">
          <i class="fa-solid fa-microphone" aria-hidden="true"></i>
        </button>
      </footer>
    `;
    return panel;
  }

  function renderSuggests(panel) {
    const wrap = panel.querySelector('#betty-suggests');
    wrap.innerHTML = SUGGESTS.map(s =>
      `<button class="betty-suggest" type="button" data-q="${s}">${s}</button>`
    ).join('');
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.betty-suggest');
      if (!btn) return;
      sendDemoMessage(panel, btn.dataset.q);
    });
  }

  function appendMessage(panel, role, html) {
    const body = panel.querySelector('#betty-body');
    const msg = document.createElement('div');
    msg.className = `betty-msg ${role === 'user' ? 'user' : ''}`;
    msg.innerHTML = `
      <div class="betty-msg-mini-avatar" aria-hidden="true">${role === 'user' ? 'You' : 'B'}</div>
      <div class="betty-msg-bubble">${html}</div>
    `;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }

  function findScriptedReply(question) {
    const q = question.toLowerCase();
    for (const demo of SCRIPTED_DEMOS) {
      const trigger = demo.user.toLowerCase();
      const sharedWords = trigger.split(/\s+/).filter(w => w.length > 4 && q.includes(w));
      if (sharedWords.length >= 2) return demo.betty;
    }
    return "That's a great question — in the live demo I'd answer this from live database content. (This is a mockup of the Caliber-powered Betty agent; in production I'd pull from events, certifications, standards positions, and member-portal context to give you a precise, sourced answer.)";
  }

  function sendDemoMessage(panel, text) {
    appendMessage(panel, 'user', text);
    // Typing indicator
    const body = panel.querySelector('#betty-body');
    const typing = document.createElement('div');
    typing.className = 'betty-msg';
    typing.innerHTML = `
      <div class="betty-msg-mini-avatar" aria-hidden="true">B</div>
      <div class="betty-msg-bubble"><em>Betty is thinking…</em></div>
    `;
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    setTimeout(() => {
      typing.remove();
      appendMessage(panel, 'betty', findScriptedReply(text));
    }, 700 + Math.random() * 600);
  }

  function init() {
    if (document.querySelector('.betty-fab')) return; // already mounted
    const fab = createFAB();
    const panel = createPanel();
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    renderSuggests(panel);

    fab.addEventListener('click', () => {
      panel.classList.add('open');
      fab.style.display = 'none';
    });
    panel.querySelector('.betty-close').addEventListener('click', () => {
      panel.classList.remove('open');
      fab.style.display = '';
    });

    const input = panel.querySelector('.betty-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        sendDemoMessage(panel, input.value.trim());
        input.value = '';
      }
    });

    const mic = panel.querySelector('.betty-mic');
    mic.addEventListener('click', () => {
      mic.classList.toggle('active');
      if (mic.classList.contains('active')) {
        const demo = SCRIPTED_DEMOS[Math.floor(Math.random() * SCRIPTED_DEMOS.length)];
        setTimeout(() => {
          mic.classList.remove('active');
          sendDemoMessage(panel, demo.user);
        }, 1800);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
