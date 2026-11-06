// ExportableData wraps one table or chart and gives it CSV, Excel and (charts only) PNG export.
// MJ's linter allows one top-level function per component file, so the helpers live inside it; the
// writers are pure functions that the unit tests extract from the body.
function ExportableData({
  exportID,
  label,
  kind = 'table',
  rows,
  getRows,
  columns,
  getImage,
  placement = 'overlay',
  style,
  children,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const EXCEL_MAX_DATA_ROWS = 1048574; // Excel's 1,048,576 rows, less the header and the truncation note
  const EXCEL_NUMBER_FORMATS = {
    number: 'General',
    currency: '$#,##0.00',
    percent: '0.0%',
    date: 'yyyy-mm-dd',
    datetime: 'yyyy-mm-dd hh:mm:ss'
  };
  const NUMERIC_TYPES = ['number', 'currency', 'percent'];
  const CAPTURE_MAX_ELEMENTS = 20000; // bounds the overflow scan on very large drawings
  const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

  /**
   * Chart.js and ApexCharts as the element's own code loaded them. They are not dependencies of this
   * component (most elements need neither), so they are read as globals and may be absent.
   */
  function findChartLibraries() {
    return {
      chartJs: typeof Chart !== 'undefined' ? Chart : undefined,
      apexCharts: typeof ApexCharts !== 'undefined' ? ApexCharts : undefined
    };
  }

  /** `<label>_<YYYY-MM-DD>.<ext>`, with anything outside letters, digits, space, - and _ replaced by _. */
  function buildFileName(label, extension, now) {
    const date = now || new Date();
    const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const base = String(label || 'export').trim().replace(/[^A-Za-z0-9 _-]/g, '_') || 'export';
    return `${base}_${stamp}.${extension}`;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /** The declared columns, or (with a warning) the first row's keys as text columns. */
  function resolveColumns(columns, rows, exportID) {
    if (Array.isArray(columns) && columns.length > 0) {
      return columns
        .filter(column => column && column.field)
        .map(column => ({ field: column.field, label: column.label || column.field, type: column.type || 'string' }));
    }
    console.warn(`[ExportableData] "${exportID}" has no columns; using the keys of the first row as text columns.`);
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
    return Object.keys(first || {}).map(field => ({ field, label: field, type: 'string' }));
  }

  /**
   * Splits a date value into the calendar parts the user sees. A bare `YYYY-MM-DD` string stays on its
   * calendar day (it would otherwise parse as UTC midnight and shift a day west of Greenwich).
   */
  function toDateParts(value) {
    if (typeof value === 'string') {
      const dateOnly = DATE_ONLY_PATTERN.exec(value.trim());
      if (dateOnly) {
        return { year: +dateOnly[1], month: +dateOnly[2], day: +dateOnly[3], hours: 0, minutes: 0, seconds: 0, hasTime: false };
      }
    }
    const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
    if (!date || isNaN(date.getTime())) return null;
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    return {
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hours: date.getHours(), minutes: date.getMinutes(), seconds: date.getSeconds(), hasTime
    };
  }

  /** Normalizes one value by column type. Kinds: number, date, boolean, string, empty. */
  function toCell(value, type) {
    if (value === null || value === undefined || value === '') return { kind: 'empty' };
    if (NUMERIC_TYPES.includes(type)) {
      const number = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(number) ? { kind: 'number', value: number } : { kind: 'empty' };
    }
    if (type === 'date') {
      const parts = toDateParts(value);
      return parts ? { kind: 'date', value: parts } : { kind: 'string', value: String(value) };
    }
    if (type === 'boolean') {
      if (typeof value === 'boolean') return { kind: 'boolean', value };
      const text = String(value).toLowerCase();
      if (text === 'true' || text === '1' || text === 'yes') return { kind: 'boolean', value: true };
      if (text === 'false' || text === '0' || text === 'no') return { kind: 'boolean', value: false };
      return { kind: 'string', value: String(value) };
    }
    return { kind: 'string', value: typeof value === 'object' ? JSON.stringify(value) : String(value) };
  }

  function formatDateParts(parts) {
    const day = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    return parts.hasTime ? `${day} ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}` : day;
  }

  /** Excel's serial date: days since 1899-12-30, computed from calendar parts so no time zone shifts it. */
  function toExcelSerial(parts) {
    const utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, parts.seconds);
    return (utc - Date.UTC(1899, 11, 30)) / 86400000;
  }

  /** Text cells that a spreadsheet would run as a formula get a leading apostrophe. */
  function guardFormula(text) {
    return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
  }

  function toCsvField(cell) {
    let text;
    if (cell.kind === 'empty') text = '';
    else if (cell.kind === 'number') text = String(cell.value);
    else if (cell.kind === 'date') text = formatDateParts(cell.value);
    else if (cell.kind === 'boolean') text = cell.value ? 'true' : 'false';
    else text = guardFormula(cell.value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  /** RFC 4180 CSV with a UTF-8 BOM and CRLF line endings. */
  function buildCsv(rows, columns) {
    const header = columns.map(column => toCsvField({ kind: 'string', value: column.label }));
    const lines = [header.join(',')];
    for (const row of rows || []) {
      lines.push(columns.map(column => toCsvField(toCell(row ? row[column.field] : undefined, column.type))).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  function toExcelCell(cell, type) {
    if (cell.kind === 'number') return { t: 'n', v: cell.value, z: EXCEL_NUMBER_FORMATS[type] || 'General' };
    if (cell.kind === 'date') {
      return { t: 'n', v: toExcelSerial(cell.value), z: cell.value.hasTime ? EXCEL_NUMBER_FORMATS.datetime : EXCEL_NUMBER_FORMATS.date };
    }
    if (cell.kind === 'boolean') return { t: 'b', v: cell.value };
    if (cell.kind === 'string') return { t: 's', v: cell.value };
    return null;
  }

  /** Display width of a cell in characters, for fitting column widths. */
  function cellWidth(cell) {
    if (cell.kind === 'date') return cell.value.hasTime ? 19 : 10;
    if (cell.kind === 'number') return String(cell.value).length + 4;
    if (cell.kind === 'empty') return 0;
    return String(cell.value).length;
  }

  /** One typed sheet: header row with an autofilter, fitted column widths, a note row when cut off. */
  function buildWorksheet(xlsx, rows, columns) {
    const sheet = {};
    const widths = columns.map(column => String(column.label).length);
    const dataRows = (rows || []).slice(0, EXCEL_MAX_DATA_ROWS);
    columns.forEach((column, c) => {
      sheet[xlsx.utils.encode_cell({ r: 0, c })] = { t: 's', v: String(column.label) };
    });
    dataRows.forEach((row, index) => {
      columns.forEach((column, c) => {
        const cell = toCell(row ? row[column.field] : undefined, column.type);
        const excelCell = toExcelCell(cell, column.type);
        if (excelCell) sheet[xlsx.utils.encode_cell({ r: index + 1, c })] = excelCell;
        widths[c] = Math.max(widths[c], cellWidth(cell));
      });
    });
    let lastRow = dataRows.length;
    if ((rows || []).length > dataRows.length) {
      lastRow += 1;
      sheet[xlsx.utils.encode_cell({ r: lastRow, c: 0 })] = { t: 's', v: `Truncated: ${dataRows.length} of ${rows.length} rows fit in Excel.` };
    }
    const lastColumn = Math.max(columns.length - 1, 0);
    sheet['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } });
    sheet['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } }) };
    sheet['!cols'] = widths.map(width => ({ wch: Math.min(Math.max(width + 2, 8), 60) }));
    return sheet;
  }

  /** Excel's sheet name rules: at most 31 characters, none of : \ / ? * [ ]. */
  function toSheetName(label) {
    return (String(label || 'Data').replace(/[:\\/?*[\]]/g, ' ').trim() || 'Data').substring(0, 31);
  }

  function buildXlsxBlob(xlsx, rows, columns, label) {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, buildWorksheet(xlsx, rows, columns), toSheetName(label));
    const bytes = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function dataURLToBlob(dataURL) {
    const [header, payload] = String(dataURL).split(',');
    const mime = (/data:([^;]+)/.exec(header) || [])[1] || 'image/png';
    const binary = atob(payload || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /** Hands the file to the host's download service when it has one, else downloads it in the browser. */
  async function deliverFile(blob, fileName, utilities) {
    const hostExport = utilities && utilities.export;
    if (hostExport && typeof hostExport.DownloadFile === 'function') {
      await hostExport.DownloadFile(blob, fileName);
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Draws a PNG data URL onto a white background, so transparent chart canvases do not export black. */
  function onWhiteBackground(dataURL) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('Chart image could not be decoded'));
      image.src = dataURL;
    });
  }

  /** Chart.js re-rendered at 3x pixel ratio with animation off, then restored. Null when there is not exactly one chart. */
  async function captureChartJs(container) {
    const chartLibrary = findChartLibraries().chartJs;
    if (!chartLibrary || typeof chartLibrary.getChart !== 'function') return null;
    const charts = Array.from(container.querySelectorAll('canvas')).map(canvas => chartLibrary.getChart(canvas)).filter(Boolean);
    if (charts.length !== 1) return null;
    const chart = charts[0];
    const original = { devicePixelRatio: chart.options.devicePixelRatio, animation: chart.options.animation };
    try {
      chart.options.devicePixelRatio = 3;
      chart.options.animation = false;
      chart.resize();
      chart.update('none');
      return await onWhiteBackground(chart.toBase64Image('image/png', 1));
    } finally {
      chart.options.devicePixelRatio = original.devicePixelRatio;
      chart.options.animation = original.animation;
      chart.resize();
      chart.update('none');
    }
  }

  /** ApexCharts' own export at 3x. Only charts that set `chart.id` can be found this way; null otherwise. */
  async function captureApexChart(container) {
    const apexLibrary = findChartLibraries().apexCharts;
    const charts = container.querySelectorAll('.apexcharts-canvas');
    if (!apexLibrary || typeof apexLibrary.getChartByID !== 'function' || charts.length !== 1) return null;
    const chart = apexLibrary.getChartByID(String(charts[0].id || '').replace(/^apexcharts/, ''));
    if (!chart || typeof chart.dataURI !== 'function') return null;
    const result = await chart.dataURI({ scale: 3 });
    return result && result.imgURI ? onWhiteBackground(result.imgURI) : null;
  }

  /** Last resort: a picture of the wrapper's own subtree, without the export button. */
  /** True when an ancestor between `element` and `container` clips overflow, so the element is not drawn past it. */
  function isClippedWithin(element, container) {
    for (let node = element.parentElement; node && node !== container; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') return true;
    }
    return false;
  }

  /**
   * The size to capture: the container's box, grown to take in content drawn past its right or bottom edge
   * (an svg with `overflow: visible` whose labels run past its viewBox). Content an inner scroll box or a
   * clipping svg hides on screen is left out, as it is on screen.
   */
  function captureSize(container) {
    const box = container.getBoundingClientRect();
    let right = box.right;
    let bottom = box.bottom;
    const elements = container.querySelectorAll('*');
    for (let i = 0; i < elements.length && i < CAPTURE_MAX_ELEMENTS; i++) {
      const element = elements[i];
      const rect = element.getBoundingClientRect();
      if ((rect.right <= right && rect.bottom <= bottom) || (!rect.width && !rect.height)) continue;
      if (element.closest('[data-export-control="true"]') || isClippedWithin(element, container)) continue;
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    return { width: Math.ceil(right - box.left), height: Math.ceil(bottom - box.top) };
  }

  /**
   * html2canvas draws an svg clipped to its own box, so a chart whose drawing runs past its viewBox (with
   * `overflow: visible`, it looks fine on screen) loses that part. Grows each such svg's viewBox vertically to
   * its drawing, keeping its width and therefore its scale. Returns a function that restores every svg.
   */
  function expandOverflowingSvgs(container) {
    const restores = [];
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      if (svg.closest('[data-export-control="true"]') || getComputedStyle(svg).overflow === 'hidden') continue;
      const restore = expandSvgToDrawing(svg);
      if (restore) restores.push(restore);
    }
    return () => restores.forEach(restore => restore());
  }

  function expandSvgToDrawing(svg) {
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    let drawing;
    try { drawing = svg.getBBox(); } catch (error) { return null; }
    if (!viewBox || !viewBox.width || !viewBox.height || !drawing.height) return null;
    const top = Math.min(viewBox.y, drawing.y);
    const bottom = Math.max(viewBox.y + viewBox.height, drawing.y + drawing.height);
    if (top === viewBox.y && bottom === viewBox.y + viewBox.height) return null;
    const original = { viewBox: svg.getAttribute('viewBox'), height: svg.style.height };
    const scale = svg.getBoundingClientRect().width / viewBox.width;
    svg.setAttribute('viewBox', `${viewBox.x} ${top} ${viewBox.width} ${bottom - top}`);
    svg.style.height = `${(bottom - top) * scale}px`;
    return () => {
      svg.setAttribute('viewBox', original.viewBox);
      svg.style.height = original.height;
    };
  }

  async function captureSubtree(container) {
    if (typeof html2canvas !== 'function') throw new Error('html2canvas is not loaded');
    const restoreSvgs = expandOverflowingSvgs(container);
    try {
      return await captureExpanded(container);
    } finally {
      restoreSvgs();
    }
  }

  async function captureExpanded(container) {
    const size = captureSize(container);
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      width: size.width,
      height: size.height,
      ignoreElements: element => element.getAttribute && element.getAttribute('data-export-control') === 'true'
    });
    return canvas.toDataURL('image/png');
  }

  async function captureImage(getImage, container) {
    if (typeof getImage === 'function') {
      const provided = await getImage();
      if (provided) return provided;
    }
    return (await captureChartJs(container)) || (await captureApexChart(container)) || captureSubtree(container);
  }

  async function resolveRows(rows, getRows) {
    const resolved = typeof getRows === 'function' ? await getRows() : rows;
    return Array.isArray(resolved) ? resolved : [];
  }

  /** Builds the file for one format from the wrapper's current props. */
  async function buildExportFile(format, current, container) {
    if (format === 'png') {
      return { blob: dataURLToBlob(await captureImage(current.getImage, container)), fileName: buildFileName(current.label, 'png') };
    }
    const rows = await resolveRows(current.rows, current.getRows);
    const columns = resolveColumns(current.columns, rows, current.exportID);
    if (format === 'csv') {
      return { blob: new Blob([buildCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }), fileName: buildFileName(current.label, 'csv') };
    }
    if (typeof XLSX === 'undefined') throw new Error('The xlsx library is not loaded');
    return { blob: buildXlsxBlob(XLSX, rows, columns, current.label), fileName: buildFileName(current.label, 'xlsx') };
  }

  function menuItemsFor(kind, busyFormat, failedFormat) {
    const formats = [{ key: 'csv', label: 'CSV' }, { key: 'xlsx', label: 'Excel' }];
    if (kind === 'chart') formats.push({ key: 'png', label: 'PNG image' });
    const items = formats.map(format => ({
      key: format.key,
      label: busyFormat === format.key ? `${format.label} (preparing…)` : format.label,
      disabled: Boolean(busyFormat)
    }));
    if (failedFormat) items.push({ key: 'error', label: 'Export failed. See the browser console.', disabled: true, danger: true });
    return items;
  }

  function isTouchOnly() {
    return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  }

  /** Runs one export; reports failures through state and the console, never by throwing. */
  function useExportRunner(latestProps, containerRef) {
    const [busyFormat, setBusyFormat] = React.useState(null);
    const [failedFormat, setFailedFormat] = React.useState(null);
    const mountedRef = React.useRef(true);
    React.useEffect(() => () => { mountedRef.current = false; }, []);

    const runExport = React.useCallback(async (format) => {
      const current = latestProps.current;
      setBusyFormat(format);
      setFailedFormat(null);
      try {
        const file = await buildExportFile(format, current, containerRef.current);
        await deliverFile(file.blob, file.fileName, current.utilities);
        return true;
      } catch (error) {
        console.error(`[ExportableData] ${format} export of "${current.exportID}" failed:`, error);
        if (mountedRef.current) setFailedFormat(format);
        return false;
      } finally {
        if (mountedRef.current) setBusyFormat(null);
      }
    }, [latestProps, containerRef]);

    return { busyFormat, failedFormat, runExport };
  }

  /** Registers with the host's export registry when the host provides one (later MJ releases). */
  function useHostRegistration(latestProps, containerRef, exportID) {
    React.useEffect(() => {
      const hostExport = latestProps.current.utilities && latestProps.current.utilities.export;
      if (!hostExport || typeof hostExport.RegisterElement !== 'function') return undefined;
      try {
        const unregister = hostExport.RegisterElement({
          ExportID: exportID,
          GetLabel: () => latestProps.current.label,
          GetKind: () => latestProps.current.kind,
          GetRows: () => resolveRows(latestProps.current.rows, latestProps.current.getRows),
          GetColumns: () => resolveColumns(latestProps.current.columns, latestProps.current.rows || [], exportID),
          GetImage: () => captureImage(latestProps.current.getImage, containerRef.current),
          Element: containerRef.current
        });
        return typeof unregister === 'function' ? unregister : undefined;
      } catch (error) {
        console.error(`[ExportableData] Registering "${exportID}" with the host failed:`, error);
        return undefined;
      }
    }, [exportID, latestProps, containerRef]);
  }

  /**
   * 'toolbar': flush with the element's top-right corner at antd's 32px control height, always shown, so it
   * lines up with a toolbar row (a grid's search box) that leaves room for it.
   * 'overlay': a smaller button over the element's top-right corner, shown on hover or keyboard focus (and
   * always on touch screens), as BI tools show a visual's header; no space is reserved for it.
   */
  const PLACEMENTS = {
    toolbar: { top: 0, right: 0, size: 32 },
    overlay: { top: 6, right: 6, size: 26 }
  };

  function buttonStyle(colors, size, visible) {
    return {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, padding: 0, cursor: 'pointer', boxSizing: 'border-box',
      border: `1px solid ${colors.border || '#d9d9d9'}`, borderRadius: 6,
      background: colors.surface || colors.background || '#ffffff',
      color: colors.textSecondary || '#555555',
      opacity: visible ? 1 : 0, transition: 'opacity 120ms ease'
    };
  }

  /** The plain menu used when antd is not loaded. */
  function fallbackMenuStyle(colors) {
    return {
      position: 'absolute', top: 30, right: 0, minWidth: 140, padding: 4, zIndex: 11,
      background: colors.surface || '#ffffff', border: `1px solid ${colors.border || 'rgba(0,0,0,0.12)'}`,
      borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
    };
  }

  function fallbackItemStyle(colors, item) {
    return {
      display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent',
      color: item.danger ? (colors.error || '#c0392b') : (colors.text || '#222222'), cursor: item.disabled ? 'default' : 'pointer'
    };
  }

  // ---- Component ----
  const { Dropdown } = unwrapLibraryComponents(typeof antd !== 'undefined' ? antd : {}, 'Dropdown');
  const containerRef = React.useRef(null);
  const latestProps = React.useRef(null);
  latestProps.current = { exportID, label, kind, rows, getRows, columns, getImage, utilities };

  const [open, setOpen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const touchOnly = React.useMemo(isTouchOnly, []);
  const position = PLACEMENTS[placement] || PLACEMENTS.overlay;
  const { busyFormat, failedFormat, runExport } = useExportRunner(latestProps, containerRef);
  useHostRegistration(latestProps, containerRef, exportID);

  const items = menuItemsFor(kind, busyFormat, failedFormat);
  const handleSelect = async (key) => {
    if (key === 'error') return;
    const succeeded = await runExport(key);
    if (succeeded) setOpen(false);
  };
  const colors = (styles && styles.colors) || {};
  const accessibleName = `Export ${label || 'data'}`;
  // antd's Dropdown attaches its ref and handlers to this element, so it stays a plain <button>.
  const button = (
    <button
      type="button"
      aria-label={accessibleName}
      aria-haspopup="menu"
      aria-expanded={open}
      title={accessibleName}
      onClick={Dropdown ? undefined : () => setOpen(!open)}
      onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
      style={buttonStyle(colors, position.size, placement === 'toolbar' || open || hovered || focused || touchOnly)}
    >
      <svg width={position.size > 28 ? 16 : 14} height={position.size > 28 ? 16 : 14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
      </svg>
    </button>
  );

  return (
    <div
      ref={containerRef}
      data-export-id={exportID}
      style={{ minWidth: 0, ...(style || {}), position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
      <div data-export-control="true" style={{ position: 'absolute', top: position.top, right: position.right, zIndex: 10 }}>
        {Dropdown ? (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            open={open}
            onOpenChange={setOpen}
            menu={{ items, onClick: ({ key }) => handleSelect(key) }}
          >
            {button}
          </Dropdown>
        ) : (
          <>
            {button}
            {open && (
              <div role="menu" style={fallbackMenuStyle(colors)}>
                {items.map(item => (
                  <button key={item.key} type="button" role="menuitem" disabled={item.disabled} onClick={() => handleSelect(item.key)} style={fallbackItemStyle(colors, item)}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
