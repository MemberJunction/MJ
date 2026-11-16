document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const dialog = document.getElementById('proto-dialog');
  const sheet = document.getElementById('proto-sheet');
  const popover = document.getElementById('proto-popover');
  const statusEl = document.getElementById('gate-status');

  document.querySelectorAll('[data-set-look]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const look = btn.getAttribute('data-set-look') || 'mj';
      root.setAttribute('data-look', look);
      if (statusEl) statusEl.textContent = `Look: ${look}`;
    });
  });

  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
  });

  const wireLayer = (openBtnId, layerEl, closeBtnId) => {
    document.getElementById(openBtnId)?.addEventListener('click', () => {
      layerEl?.setAttribute('open', 'true');
    });
    // Event delegation: projected close buttons live inside CDK's TemplatePortal until opened.
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest(`#${closeBtnId}`)) {
        layerEl?.setAttribute('open', 'false');
      }
    });
    layerEl?.addEventListener('mj-after-close', () => {
      layerEl.setAttribute('open', 'false');
    });
  };

  wireLayer('open-dialog', dialog, 'close-dialog');
  wireLayer('open-sheet', sheet, 'close-sheet');
  wireLayer('open-popover', popover, 'close-popover');

  document.querySelectorAll('mj-row[interactive="true"]').forEach((row) => {
    row.addEventListener('mj-after-select', () => {
      const current = row.getAttribute('selected') === 'true';
      row.setAttribute('selected', current ? 'false' : 'true');
    });
  });
});
