import * as ExcelJS from 'exceljs';
import { BaseExporter } from './base-exporter';
import {
  ExportOptions,
  ExportResult,
  ExportColumn,
  ExportData,
  ExportDataRow,
  SheetDefinition,
  CellStyle,
  CellFormula,
  CellStyleOverride,
  RowStyle,
  MergedCellRange,
  EmbeddedImage,
  DataValidationRule,
  ConditionalFormatRule,
  CellBorder,
  BorderSide,
  FontStyle,
  FillStyle,
  AlignmentStyle,
  FillPattern,
  BorderLineStyle
} from './types';

/**
 * Excel exporter using ExcelJS
 * Supports multi-sheet workbooks, formatting, styling, formulas, and all sampling options
 */
export class ExcelExporter extends BaseExporter {
  constructor(options: Partial<ExportOptions> = {}) {
    super({ ...options, format: 'excel' });
  }

  getMimeType(): string {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  getFileExtension(): string {
    return 'xlsx';
  }

  async export(data: ExportData): Promise<ExportResult> {
    try {
      // Check if we're doing multi-sheet export
      if (this.options.sheets && this.options.sheets.length > 0) {
        return this.exportMultiSheet();
      }

      // Single sheet export (backward compatible)
      return this.exportSingleSheet(data);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Export multiple sheets to a single workbook
   */
  private async exportMultiSheet(): Promise<ExportResult> {
    const workbook = this.createWorkbook();
    const sheets = this.options.sheets!;

    let totalRows = 0;
    let maxColumns = 0;
    const sheetStats: Array<{ name: string; rowCount: number; columnCount: number }> = [];

    for (const sheetDef of sheets) {
      const { rowCount, columnCount } = await this.addSheet(workbook, sheetDef);
      totalRows += rowCount;
      maxColumns = Math.max(maxColumns, columnCount);
      sheetStats.push({ name: sheetDef.name, rowCount, columnCount });
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const data = new Uint8Array(buffer as ArrayBuffer);

    return {
      success: true,
      data,
      mimeType: this.getMimeType(),
      fileName: this.getFullFileName(),
      rowCount: totalRows,
      columnCount: maxColumns,
      sheetCount: sheets.length,
      sheetStats,
      sizeBytes: data.length
    };
  }

  /**
   * Export single sheet (original behavior)
   */
  private async exportSingleSheet(data: ExportData): Promise<ExportResult> {
    // Apply sampling
    const sampledData = this.applySampling(data);

    // Derive columns
    const columns = this.deriveColumns(sampledData);

    if (columns.length === 0) {
      return {
        success: false,
        error: 'No columns to export'
      };
    }

    // Create workbook
    const workbook = this.createWorkbook();

    // Create worksheet
    const worksheet = workbook.addWorksheet(this.options.sheetName || 'Sheet1');

    // Add headers
    let rowIndex = 1;
    if (this.options.includeHeaders !== false) {
      this.addHeaderRow(worksheet, columns, this.options.styling?.headerStyle);
      rowIndex++;
    }

    // Add data rows
    for (const row of sampledData) {
      const values = this.extractRowValues(row, columns);
      const excelRow = worksheet.addRow(values);

      // Apply data style
      if (this.options.styling?.dataStyle) {
        this.applyRowCellStyle(excelRow, this.options.styling.dataStyle);
      }

      // Apply alternating row colors
      if (this.options.styling?.alternatingRowColors && rowIndex % 2 === 0) {
        const altStyle = this.options.styling.alternateRowStyle ||
          { fill: { pattern: 'solid' as FillPattern, fgColor: this.options.styling.alternateRowColor || 'F5F5F5' } };
        this.applyRowCellStyle(excelRow, altStyle);
      }
      rowIndex++;
    }

    // Apply column widths
    this.applyColumnWidths(worksheet, columns, sampledData);

    // Apply auto-filter
    if (this.options.styling?.autoFilter && this.options.includeHeaders !== false) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
      };
    }

    // Freeze header row
    if (this.options.styling?.freezeHeader && this.options.includeHeaders !== false) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const resultData = new Uint8Array(buffer as ArrayBuffer);

    return {
      success: true,
      data: resultData,
      mimeType: this.getMimeType(),
      fileName: this.getFullFileName(),
      rowCount: sampledData.length,
      columnCount: columns.length,
      sheetCount: 1,
      sizeBytes: resultData.length
    };
  }

  /**
   * Create and configure workbook with metadata
   */
  private createWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();

    // Set metadata from options
    const meta = this.options.metadata || {};
    workbook.creator = meta.author || this.options.author || 'MemberJunction';
    workbook.created = new Date();
    workbook.modified = new Date();

    if (meta.title || this.options.title) {
      workbook.title = (meta.title || this.options.title)!;
    }
    if (meta.subject) {
      workbook.subject = meta.subject;
    }
    if (meta.description) {
      workbook.description = meta.description;
    }
    if (meta.company) {
      workbook.company = meta.company;
    }
    if (meta.manager) {
      workbook.manager = meta.manager;
    }
    if (meta.keywords) {
      workbook.keywords = Array.isArray(meta.keywords) ? meta.keywords.join(', ') : meta.keywords;
    }
    if (meta.category) {
      workbook.category = meta.category;
    }

    // Calculate on save option
    if (this.options.calcOnSave !== undefined) {
      workbook.calcProperties = { fullCalcOnLoad: this.options.calcOnSave };
    }

    return workbook;
  }

  /**
   * Add a sheet to the workbook based on SheetDefinition
   */
  private async addSheet(
    workbook: ExcelJS.Workbook,
    sheetDef: SheetDefinition
  ): Promise<{ rowCount: number; columnCount: number }> {
    const worksheet = workbook.addWorksheet(sheetDef.name, {
      properties: {
        tabColor: sheetDef.tabColor ? { argb: `FF${sheetDef.tabColor}` } : undefined,
        defaultRowHeight: sheetDef.defaultRowHeight,
        defaultColWidth: sheetDef.defaultColWidth,
        showGridLines: sheetDef.showGridLines
      },
      views: sheetDef.rightToLeft ? [{ rightToLeft: true }] : undefined
    });

    // Derive columns from data or use provided columns/headers
    let columns: ExportColumn[];
    if (sheetDef.columns && sheetDef.columns.length > 0) {
      columns = sheetDef.columns;
    } else if (sheetDef.headers && sheetDef.headers.length > 0) {
      columns = sheetDef.headers.map((header, index) => ({
        name: header,
        displayName: header,
        width: sheetDef.columnWidths?.[index]
      }));
    } else {
      columns = this.deriveColumnsFromData(sheetDef.data);
    }

    // Apply column widths if specified separately
    if (sheetDef.columnWidths && !sheetDef.columns) {
      columns = columns.map((col, index) => ({
        ...col,
        width: sheetDef.columnWidths?.[index] || col.width
      }));
    }

    let rowIndex = 1;
    const includeHeaders = sheetDef.includeHeaders !== false;

    // Add headers
    if (includeHeaders) {
      const headerStyle = sheetDef.headerStyle || this.options.styling?.headerStyle;
      this.addHeaderRow(worksheet, columns, headerStyle);
      rowIndex++;
    }

    // Add data rows
    for (let i = 0; i < sheetDef.data.length; i++) {
      const row = sheetDef.data[i];
      const values = this.extractRowValuesForSheet(row, columns);
      const excelRow = worksheet.addRow(values);

      // Apply data style
      if (sheetDef.dataStyle) {
        this.applyRowCellStyle(excelRow, sheetDef.dataStyle);
      }

      // Apply alternating row style
      if (sheetDef.alternateRowStyle && rowIndex % 2 === 0) {
        this.applyRowCellStyle(excelRow, sheetDef.alternateRowStyle);
      }

      rowIndex++;
    }

    // Apply specific row styles
    if (sheetDef.rowStyles) {
      this.applyRowStyles(worksheet, sheetDef.rowStyles);
    }

    // Apply specific cell style overrides
    if (sheetDef.cellStyles) {
      this.applyCellStyleOverrides(worksheet, sheetDef.cellStyles);
    }

    // Add formulas
    if (sheetDef.formulas) {
      this.addFormulas(worksheet, sheetDef.formulas);
    }

    // Apply merged cells
    if (sheetDef.mergedCells) {
      this.applyMergedCells(worksheet, sheetDef.mergedCells);
    }

    // Apply data validation
    if (sheetDef.dataValidation) {
      this.applyDataValidation(worksheet, sheetDef.dataValidation);
    }

    // Apply conditional formatting
    if (sheetDef.conditionalFormatting) {
      this.applyConditionalFormatting(worksheet, sheetDef.conditionalFormatting);
    }

    // Add images
    if (sheetDef.images) {
      await this.addImages(workbook, worksheet, sheetDef.images);
    }

    // Apply freeze panes
    if (sheetDef.freeze) {
      worksheet.views = [{
        state: 'frozen',
        xSplit: sheetDef.freeze.column ? sheetDef.freeze.column - 1 : 0,
        ySplit: sheetDef.freeze.row ? sheetDef.freeze.row - 1 : 0
      }];
    }

    // Apply auto-filter
    if (sheetDef.autoFilter) {
      if (typeof sheetDef.autoFilter === 'string') {
        worksheet.autoFilter = sheetDef.autoFilter;
      } else if (sheetDef.autoFilter === true && includeHeaders) {
        worksheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: columns.length }
        };
      }
    }

    // Apply page setup
    if (sheetDef.pageSetup) {
      this.applyPageSetup(worksheet, sheetDef.pageSetup);
    }

    // Apply protection
    if (sheetDef.protection) {
      await this.applyProtection(worksheet, sheetDef.protection);
    }

    // Apply outline properties
    if (sheetDef.outlineProperties) {
      worksheet.properties.outlineProperties = {
        summaryBelow: sheetDef.outlineProperties.summaryBelow ?? true,
        summaryRight: sheetDef.outlineProperties.summaryRight ?? true
      };
    }

    // Auto-fit columns if no widths specified
    this.autoFitColumns(worksheet, columns, sheetDef.data);

    return {
      rowCount: sheetDef.data.length,
      columnCount: columns.length
    };
  }

  /**
   * Add styled header row
   */
  private addHeaderRow(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    headerStyle?: CellStyle
  ): void {
    const headerValues = columns.map(col => col.displayName || col.name);
    const headerRow = worksheet.addRow(headerValues);

    // Apply header styling
    const styling = this.options.styling;

    // Build combined style
    let style: CellStyle = {};

    if (styling?.boldHeaders !== false) {
      style.font = { bold: true };
    }

    if (styling?.headerBackgroundColor) {
      style.fill = {
        pattern: 'solid',
        fgColor: styling.headerBackgroundColor
      };
    }

    if (styling?.headerTextColor) {
      style.font = {
        ...style.font,
        color: styling.headerTextColor
      };
    }

    // Override with full header style if provided
    if (headerStyle) {
      style = { ...style, ...headerStyle };
    }

    // Apply the combined style
    this.applyRowCellStyle(headerRow, style);

    // Add bottom border to header
    headerRow.eachCell(cell => {
      cell.border = {
        ...cell.border,
        bottom: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
  }

  /**
   * Apply CellStyle to an ExcelJS cell
   */
  private applyCellStyle(cell: ExcelJS.Cell, style: CellStyle): void {
    if (style.font) {
      cell.font = this.convertFontStyle(style.font);
    }
    if (style.fill) {
      cell.fill = this.convertFillStyle(style.fill);
    }
    if (style.border) {
      cell.border = this.convertBorderStyle(style.border);
    }
    if (style.alignment) {
      cell.alignment = this.convertAlignmentStyle(style.alignment);
    }
    if (style.numFmt) {
      cell.numFmt = style.numFmt;
    }
  }

  /**
   * Apply CellStyle to all cells in a row
   */
  private applyRowCellStyle(row: ExcelJS.Row, style: CellStyle): void {
    row.eachCell({ includeEmpty: false }, cell => {
      this.applyCellStyle(cell, style);
    });
  }

  /**
   * Convert our FontStyle to ExcelJS font
   */
  private convertFontStyle(font: FontStyle): Partial<ExcelJS.Font> {
    const result: Partial<ExcelJS.Font> = {};

    if (font.name) result.name = font.name;
    if (font.size) result.size = font.size;
    if (font.bold !== undefined) result.bold = font.bold;
    if (font.italic !== undefined) result.italic = font.italic;
    if (font.strike !== undefined) result.strike = font.strike;
    if (font.color) result.color = { argb: `FF${font.color}` };

    if (font.underline !== undefined) {
      if (typeof font.underline === 'boolean') {
        result.underline = font.underline;
      } else {
        result.underline = font.underline;
      }
    }

    return result;
  }

  /**
   * Convert our FillStyle to ExcelJS fill
   */
  private convertFillStyle(fill: FillStyle): ExcelJS.Fill {
    return {
      type: 'pattern',
      pattern: fill.pattern || 'solid',
      fgColor: fill.fgColor ? { argb: `FF${fill.fgColor}` } : undefined,
      bgColor: fill.bgColor ? { argb: `FF${fill.bgColor}` } : undefined
    } as ExcelJS.Fill;
  }

  /**
   * Convert our CellBorder to ExcelJS border
   */
  private convertBorderStyle(border: CellBorder): Partial<ExcelJS.Borders> {
    const result: Partial<ExcelJS.Borders> = {};

    if (border.top) result.top = this.convertBorderSide(border.top);
    if (border.bottom) result.bottom = this.convertBorderSide(border.bottom);
    if (border.left) result.left = this.convertBorderSide(border.left);
    if (border.right) result.right = this.convertBorderSide(border.right);
    if (border.diagonal) {
      result.diagonal = {
        ...this.convertBorderSide(border.diagonal),
        up: border.diagonal.up,
        down: border.diagonal.down
      };
    }

    return result;
  }

  /**
   * Convert BorderSide to ExcelJS border
   */
  private convertBorderSide(side: BorderSide): Partial<ExcelJS.Border> {
    return {
      style: side.style as ExcelJS.BorderStyle,
      color: side.color ? { argb: `FF${side.color}` } : undefined
    };
  }

  /**
   * Convert our AlignmentStyle to ExcelJS alignment
   */
  private convertAlignmentStyle(alignment: AlignmentStyle): Partial<ExcelJS.Alignment> {
    return {
      horizontal: alignment.horizontal,
      vertical: alignment.vertical,
      wrapText: alignment.wrapText,
      shrinkToFit: alignment.shrinkToFit,
      textRotation: alignment.textRotation,
      indent: alignment.indent
    };
  }

  /**
   * Apply row styles
   */
  private applyRowStyles(worksheet: ExcelJS.Worksheet, rowStyles: RowStyle[]): void {
    for (const rs of rowStyles) {
      const row = worksheet.getRow(rs.row);

      if (rs.height) row.height = rs.height;
      if (rs.hidden) row.hidden = true;
      if (rs.outlineLevel !== undefined) row.outlineLevel = rs.outlineLevel;
      if (rs.style) {
        this.applyRowCellStyle(row, rs.style);
      }
    }
  }

  /**
   * Apply cell style overrides
   */
  private applyCellStyleOverrides(worksheet: ExcelJS.Worksheet, overrides: CellStyleOverride[]): void {
    for (const override of overrides) {
      // Handle both single cell and range
      if (override.cell.includes(':')) {
        // Range - apply to all cells in range
        const [start, end] = override.cell.split(':');
        const startCell = worksheet.getCell(start);
        const endCell = worksheet.getCell(end);

        // Get numeric indices
        const startRow = this.getRowNumber(startCell);
        const endRow = this.getRowNumber(endCell);
        const startCol = this.getColumnNumber(startCell);
        const endCol = this.getColumnNumber(endCell);

        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const cell = worksheet.getCell(row, col);
            this.applyCellStyle(cell, override.style);
            if (override.value !== undefined) {
              cell.value = override.value as ExcelJS.CellValue;
            }
          }
        }
      } else {
        // Single cell
        const cell = worksheet.getCell(override.cell);
        this.applyCellStyle(cell, override.style);
        if (override.value !== undefined) {
          cell.value = override.value as ExcelJS.CellValue;
        }
      }
    }
  }

  /**
   * Get numeric column index from cell
   */
  private getColumnNumber(cell: ExcelJS.Cell): number {
    // ExcelJS col can be string (letter) or have fullAddress
    if (typeof cell.col === 'number') {
      return cell.col;
    }
    // Parse from address
    const match = cell.address.match(/^([A-Z]+)/);
    if (match) {
      return this.columnLetterToNumber(match[1]);
    }
    return 1;
  }

  /**
   * Get numeric row index from cell
   */
  private getRowNumber(cell: ExcelJS.Cell): number {
    if (typeof cell.row === 'number') {
      return cell.row;
    }
    // Parse from address
    const match = cell.address.match(/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 1;
  }

  /**
   * Add formulas to worksheet
   */
  private addFormulas(worksheet: ExcelJS.Worksheet, formulas: CellFormula[]): void {
    for (const formula of formulas) {
      const cell = worksheet.getCell(formula.cell);
      // Cast to the formula value type expected by ExcelJS
      const formulaValue: ExcelJS.CellFormulaValue = {
        formula: formula.formula
      };
      if (formula.result !== undefined) {
        formulaValue.result = formula.result as string | number | boolean | Date;
      }
      cell.value = formulaValue;
    }
  }

  /**
   * Apply merged cells
   */
  private applyMergedCells(worksheet: ExcelJS.Worksheet, mergedCells: MergedCellRange[]): void {
    for (const range of mergedCells) {
      worksheet.mergeCells(
        range.startRow,
        range.startColumn,
        range.endRow,
        range.endColumn
      );
    }
  }

  /**
   * Apply data validation rules
   */
  private applyDataValidation(worksheet: ExcelJS.Worksheet, rules: DataValidationRule[]): void {
    for (const rule of rules) {
      // Build formulae array first
      let formulae: string[] = [];
      if (rule.type === 'list' && rule.allowedValues) {
        formulae = [rule.allowedValues.join(',')];
      } else if (rule.formula1 !== undefined) {
        formulae = [String(rule.formula1)];
        if (rule.formula2 !== undefined) {
          formulae.push(String(rule.formula2));
        }
      }

      const validation: ExcelJS.DataValidation = {
        type: rule.type as 'list' | 'whole' | 'decimal' | 'date' | 'textLength' | 'custom',
        formulae,
        allowBlank: rule.allowBlank,
        showErrorMessage: rule.showError,
        errorTitle: rule.errorTitle,
        error: rule.errorMessage,
        errorStyle: rule.errorStyle,
        showInputMessage: rule.showInputMessage,
        promptTitle: rule.inputTitle,
        prompt: rule.inputMessage
      };

      if (rule.operator) {
        validation.operator = rule.operator as 'between' | 'notBetween' | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual';
      }

      // Apply to range
      const [start, end] = rule.range.includes(':')
        ? rule.range.split(':')
        : [rule.range, rule.range];

      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);
      const startRow = this.getRowNumber(startCell);
      const endRow = this.getRowNumber(endCell);
      const startCol = this.getColumnNumber(startCell);
      const endCol = this.getColumnNumber(endCell);

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          worksheet.getCell(row, col).dataValidation = validation;
        }
      }
    }
  }

  /**
   * Apply conditional formatting rules
   */
  private applyConditionalFormatting(worksheet: ExcelJS.Worksheet, rules: ConditionalFormatRule[]): void {
    for (const rule of rules) {
      // Map our operator names to ExcelJS operator names
      const operatorMap: Record<string, string> = {
        'equal': 'equal',
        'notEqual': 'notEqual',
        'greaterThan': 'greaterThan',
        'lessThan': 'lessThan',
        'greaterThanOrEqual': 'greaterThanOrEqual',
        'lessThanOrEqual': 'lessThanOrEqual',
        'between': 'between',
        'notBetween': 'notBetween'
      };

      // Build formulae if values provided
      const formulae: string[] = [];
      if (rule.value !== undefined) {
        formulae.push(String(rule.value));
        if (rule.value2 !== undefined) {
          formulae.push(String(rule.value2));
        }
      }

      // Build the conditional formatting rule
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfRule: any = {
        type: rule.type,
        priority: rule.priority || 1
      };

      if (rule.operator && operatorMap[rule.operator]) {
        cfRule.operator = operatorMap[rule.operator];
      }

      if (formulae.length > 0) {
        cfRule.formulae = formulae;
      }

      if (rule.style) {
        cfRule.style = {
          font: rule.style.font ? this.convertFontStyle(rule.style.font) : undefined,
          fill: rule.style.fill ? this.convertFillStyle(rule.style.fill) : undefined
        };
      }

      worksheet.addConditionalFormatting({
        ref: rule.range,
        rules: [cfRule as ExcelJS.ConditionalFormattingRule]
      });
    }
  }

  /**
   * Add images to worksheet
   */
  private async addImages(
    workbook: ExcelJS.Workbook,
    worksheet: ExcelJS.Worksheet,
    images: EmbeddedImage[]
  ): Promise<void> {
    for (const img of images) {
      const imageData = typeof img.data === 'string'
        ? Buffer.from(img.data, 'base64')
        : img.data;

      const imageId = workbook.addImage({
        buffer: imageData,
        extension: img.type
      });

      const col = typeof img.position.col === 'string'
        ? this.columnLetterToNumber(img.position.col)
        : img.position.col;

      worksheet.addImage(imageId, {
        tl: {
          col: col - 1 + (img.position.colOffset ? img.position.colOffset / 64 : 0),
          row: img.position.row - 1 + (img.position.rowOffset ? img.position.rowOffset / 20 : 0)
        },
        ext: img.size ? { width: img.size.width || 100, height: img.size.height || 100 } : { width: 100, height: 100 }
      });
    }
  }

  /**
   * Apply page setup options
   */
  private applyPageSetup(worksheet: ExcelJS.Worksheet, setup: ExportOptions['sheets'] extends undefined ? never : NonNullable<ExportOptions['sheets']>[number]['pageSetup']): void {
    if (!setup) return;

    const pageSetup: Partial<ExcelJS.PageSetup> = {};

    if (setup.paperSize) {
      const paperSizes: Record<string, number> = {
        letter: 1, legal: 5, tabloid: 3, a3: 8, a4: 9, a5: 11
      };
      pageSetup.paperSize = paperSizes[setup.paperSize];
    }

    if (setup.orientation) {
      pageSetup.orientation = setup.orientation;
    }

    if (setup.fitToWidth !== undefined) {
      pageSetup.fitToPage = true;
      pageSetup.fitToWidth = setup.fitToWidth;
    }

    if (setup.fitToHeight !== undefined) {
      pageSetup.fitToPage = true;
      pageSetup.fitToHeight = setup.fitToHeight;
    }

    if (setup.scale) {
      pageSetup.scale = setup.scale;
    }

    if (setup.showGridLines !== undefined) {
      pageSetup.showGridLines = setup.showGridLines;
    }

    if (setup.showRowColHeaders !== undefined) {
      pageSetup.showRowColHeaders = setup.showRowColHeaders;
    }

    if (setup.margins) {
      pageSetup.margins = {
        left: setup.margins.left || 0.7,
        right: setup.margins.right || 0.7,
        top: setup.margins.top || 0.75,
        bottom: setup.margins.bottom || 0.75,
        header: setup.margins.header || 0.3,
        footer: setup.margins.footer || 0.3
      };
    }

    if (setup.printTitlesRow) {
      pageSetup.printTitlesRow = setup.printTitlesRow;
    }

    if (setup.printTitlesColumn) {
      pageSetup.printTitlesColumn = setup.printTitlesColumn;
    }

    worksheet.pageSetup = pageSetup;

    // Header and footer
    if (setup.header || setup.footer) {
      worksheet.headerFooter = {
        oddHeader: setup.header,
        oddFooter: setup.footer
      };
    }
  }

  /**
   * Apply sheet protection
   */
  private async applyProtection(
    worksheet: ExcelJS.Worksheet,
    protection: NonNullable<SheetDefinition['protection']>
  ): Promise<void> {
    const options: Partial<ExcelJS.WorksheetProtection> = {
      selectLockedCells: protection.selectLockedCells ?? true,
      selectUnlockedCells: protection.selectUnlockedCells ?? true,
      formatCells: protection.formatCells ?? false,
      formatColumns: protection.formatColumns ?? false,
      formatRows: protection.formatRows ?? false,
      insertColumns: protection.insertColumns ?? false,
      insertRows: protection.insertRows ?? false,
      insertHyperlinks: protection.insertHyperlinks ?? false,
      deleteColumns: protection.deleteColumns ?? false,
      deleteRows: protection.deleteRows ?? false,
      sort: protection.sort ?? false,
      autoFilter: protection.autoFilter ?? false,
      pivotTables: protection.pivotTables ?? false
    };

    if (protection.password) {
      await worksheet.protect(protection.password, options);
    } else {
      worksheet.protect('', options);
    }
  }

  /**
   * Apply column widths - either from options or auto-calculated
   */
  private applyColumnWidths(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    data: ExportData
  ): void {
    columns.forEach((col, index) => {
      const column = worksheet.getColumn(index + 1);

      if (col.width) {
        column.width = col.width;
      } else {
        // Auto-calculate width based on content
        let maxLength = (col.displayName || col.name).length;

        for (const row of data) {
          const values = this.extractRowValues(row, columns);
          const value = values[index];
          const strValue = value != null ? String(value) : '';
          maxLength = Math.max(maxLength, strValue.length);
        }

        // Set width with some padding, capped at 50
        column.width = Math.min(maxLength + 2, 50);
      }

      // Apply column style if specified
      if (col.style) {
        // Column-level styles are applied to new cells, not existing
        // For existing cells, we'd need to iterate
      }

      // Apply number format if specified
      if (col.numberFormat) {
        column.numFmt = col.numberFormat;
      } else if (col.dataType === 'currency') {
        column.numFmt = '$#,##0.00';
      } else if (col.dataType === 'date') {
        column.numFmt = this.options.defaultDateFormat || 'yyyy-mm-dd';
      } else if (col.dataType === 'percentage') {
        column.numFmt = '0.00%';
      }

      // Hide column if specified
      if (col.hidden) {
        column.hidden = true;
      }
    });
  }

  /**
   * Auto-fit columns based on content
   */
  private autoFitColumns(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    data: ExportData
  ): void {
    columns.forEach((col, index) => {
      // Skip if width already set
      if (col.width) return;

      const column = worksheet.getColumn(index + 1);
      let maxLength = (col.displayName || col.name).length;

      // Check all data values
      for (const row of data) {
        const values = this.extractRowValuesForSheet(row, columns);
        const value = values[index];
        const strValue = value != null ? String(value) : '';
        maxLength = Math.max(maxLength, Math.min(strValue.length, 50));
      }

      column.width = Math.min(maxLength + 2, 50);
    });
  }

  /**
   * Derive columns from data
   */
  private deriveColumnsFromData(data: ExportData): ExportColumn[] {
    if (data.length === 0) return [];

    const firstRow = data[0];

    if (Array.isArray(firstRow)) {
      return firstRow.map((_, index) => ({
        name: `Column${index + 1}`,
        displayName: `Column ${index + 1}`
      }));
    } else {
      return Object.keys(firstRow as Record<string, unknown>).map(key => ({
        name: key,
        displayName: this.formatColumnName(key)
      }));
    }
  }

  /**
   * Extract row values for sheet (handles both arrays and objects)
   */
  private extractRowValuesForSheet(row: ExportDataRow, columns: ExportColumn[]): unknown[] {
    if (Array.isArray(row)) {
      return row;
    }

    return columns.map(col => {
      const value = (row as Record<string, unknown>)[col.name];
      return this.formatValue(value, col);
    });
  }

  /**
   * Convert column letter to number (A=1, B=2, AA=27, etc.)
   */
  private columnLetterToNumber(letter: string): number {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64);
    }
    return result;
  }
}
