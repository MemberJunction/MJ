document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const dialog = document.getElementById('proto-dialog');
  const sheet = document.getElementById('proto-sheet');
  const popover = document.getElementById('proto-popover');
  const statusEl = document.getElementById('gate-status');

  const lookButtons = document.querySelectorAll('[data-set-look]');
  lookButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const look = btn.getAttribute('data-set-look') || 'mj';
      root.setAttribute('data-look', look);
      lookButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
      if (statusEl) statusEl.textContent = `Look: ${look}`;
    });
  });

  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
  });

  const wireLayer = (openBtnId, layerEl, closeBtnId, toggle = false) => {
    document.getElementById(openBtnId)?.addEventListener('click', () => {
      if (!layerEl) return;
      if (toggle && layerEl.getAttribute('open') === 'true') {
        layerEl.setAttribute('open', 'false');
      } else {
        layerEl.setAttribute('open', 'true');
      }
    });
    // Event delegation: projected close buttons live inside CDK's TemplatePortal until opened.
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`#${closeBtnId}`)) {
        layerEl?.setAttribute('open', 'false');
      }
      const closeTarget = event.target.closest('[data-close-layer]');
      if (closeTarget && layerEl && closeTarget.getAttribute('data-close-layer') === layerEl.id) {
        layerEl.setAttribute('open', 'false');
      }
    });
    layerEl?.addEventListener('mj-after-close', () => {
      layerEl.setAttribute('open', 'false');
    });
  };

  wireLayer('open-dialog', dialog, 'close-dialog');
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('#cancel-dialog')) {
      dialog?.setAttribute('open', 'false');
    }
    const popoverAction =
      event.target instanceof Element ? event.target.closest('[data-popover-action]') : null;
    if (popoverAction) {
      const look = popoverAction.getAttribute('data-popover-action') || 'mj';
      root.setAttribute('data-look', look);
      lookButtons.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-set-look') === look));
      if (statusEl) statusEl.textContent = `Look: ${look}`;
      popover?.setAttribute('open', 'false');
    }
  });
  wireLayer('open-sheet', sheet, 'close-sheet');
  wireLayer('open-popover', popover, 'close-popover', true);

  document.querySelectorAll('mj-row[interactive="true"]').forEach((row) => {
    row.addEventListener('mj-after-select', () => {
      const current = row.getAttribute('selected') === 'true';
      row.setAttribute('selected', current ? 'false' : 'true');
    });
  });
});
