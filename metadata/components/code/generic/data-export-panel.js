function DataExportPanel({ 
  mode = 'ui',
  data = [],
  columns = [],
  filename = 'export',
  formats = ['csv', 'excel', 'pdf'],
  position = 'inline',
  buttonStyle = 'dropdown',
  buttonText = 'Export',
  icon = 'fa-download',
  showPreview = false,
  allowColumnSelection = true,
  includeHeaders = true,
  dateFormat = 'YYYY-MM-DD',
  numberFormat = { decimals: 2, thousandsSeparator: ',', decimalSeparator: '.' },
  pdfOptions = { orientation: 'portrait', pageSize: 'a4', margins: { top: 40, bottom: 40, left: 40, right: 40 } },
  excelOptions = { sheetName: 'Data', includeFilters: true, autoWidth: true },
  getHtmlElement = null,  // Function to get element at export time
  aiInsightsText = null,  // Raw markdown text for AI insights
  onExportStart = () => {},
  onExportComplete = () => {},
  onExportError = () => {},
  customStyles = {},
  visible = true,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState(0);
  
  // Validate and normalize columns on initialization
  const validateColumns = (cols) => {
    if (!cols || cols.length === 0) {
      console.warn('⚠️ [DataExportPanel] No columns provided for export');
      return [];
    }
    
    return cols.map((col, index) => {
      // Check for required properties
      if (!col.key && !col.field) {
        console.warn(`⚠️ [DataExportPanel] Column at index ${index} missing 'key' property. Expected format: { key: 'fieldName', label: 'Display Name' }. Got:`, col);
      }
      if (!col.label && !col.header && !col.name) {
        console.warn(`⚠️ [DataExportPanel] Column at index ${index} missing 'label' property. Will fallback to key/field value.`);
      }
      
      const key = col.key || col.field;
      const label = col.label || col.header || col.name || key;
      
      if (!key) {
        console.error(`❌ [DataExportPanel] Column at index ${index} has no valid key identifier. This will cause export to fail. Column:`, col);
      }
      
      return {
        ...col,
        key: key,
        label: label,
        selected: true
      };
    });
  };
  
  const [selectedColumns, setSelectedColumns] = React.useState(
    validateColumns(columns)
  );
  const [showColumnSelector, setShowColumnSelector] = React.useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = React.useState(false);
  const [previewFormat, setPreviewFormat] = React.useState(null);
  
  const exportRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  
  // Re-validate columns if they change
  React.useEffect(() => {
    setSelectedColumns(validateColumns(columns));
  }, [columns]);
  
  // Merge default styles with custom styles
  const panelStyles = {
    container: {
      position: position === 'floating' ? 'fixed' : 'relative',
      display: position === 'inline' ? 'inline-block' : 'block',
      ...customStyles.container
    },
    button: {
      padding: '8px 16px',
      backgroundColor: styles?.colors?.primary || '#3B82F6',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'all 0.2s',
      ...customStyles.button
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '4px',
      backgroundColor: 'white',
      border: '1px solid #E5E7EB',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      zIndex: 1000,
      minWidth: '200px',
      ...customStyles.dropdown
    },
    dropdownItem: {
      padding: '10px 16px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '14px',
      transition: 'background-color 0.15s',
      borderBottom: '1px solid #F3F4F6',
      ...customStyles.dropdownItem
    },
    progressBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '3px',
      backgroundColor: '#E5E7EB',
      borderRadius: '0 0 6px 6px',
      overflow: 'hidden',
      ...customStyles.progressBar
    },
    progressFill: {
      height: '100%',
      backgroundColor: styles?.colors?.success || '#10B981',
      transition: 'width 0.3s ease',
      ...customStyles.progressFill
    }
  };
  
  // Format value based on type
  const formatValue = (value, type) => {
    if (value == null) return '';
    
    if (type === 'date' && dayjs) {
      return dayjs(value).format(dateFormat);
    }
    
    if (type === 'number' && numberFormat) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        const parts = num.toFixed(numberFormat.decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, numberFormat.thousandsSeparator);
        return parts.join(numberFormat.decimalSeparator);
      }
    }
    
    if (type === 'currency' && numberFormat) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        const formatted = formatValue(num, 'number');
        return `$${formatted}`;
      }
    }
    
    return String(value);
  };
  
  // Prepare data for export
  const prepareData = () => {
    const activeColumns = allowColumnSelection 
      ? selectedColumns.filter(col => col.selected)
      : selectedColumns; // Use validated selectedColumns instead of raw columns
      
    if (!data || data.length === 0) {
      console.warn('⚠️ [DataExportPanel] No data to export');
      return { headers: [], rows: [] };
    }
    
    // Validate data structure
    if (data.length > 0) {
      const sampleRow = data[0];
      activeColumns.forEach(col => {
        if (!(col.key in sampleRow)) {
          console.warn(`⚠️ [DataExportPanel] Data missing key '${col.key}' that was defined in columns. First row keys:`, Object.keys(sampleRow));
        }
      });
    }
    
    const headers = activeColumns.map(col => col.label || col.key);
    const rows = data.map((row, rowIndex) => 
      activeColumns.map(col => {
        if (!(col.key in row) && rowIndex === 0) {
          console.warn(`⚠️ [DataExportPanel] Row ${rowIndex} missing value for key '${col.key}'`);
        }
        return formatValue(row[col.key], col.type);
      })
    );
    
    console.log(`✅ [DataExportPanel] Prepared ${rows.length} rows with ${headers.length} columns for export`);
    
    return { headers, rows };
  };
  
  // Export to CSV
  const exportToCSV = async () => {
    try {
      setIsExporting(true);
      setExportProgress(10);
      onExportStart('csv');
      
      const { headers, rows } = prepareData();
      setExportProgress(30);
      
      // Build CSV content
      let csvContent = '';
      
      if (includeHeaders) {
        csvContent += headers.map(h => `"${h}"`).join(',') + '\n';
      }
      
      setExportProgress(50);
      
      // Process rows in chunks for large datasets
      const chunkSize = 1000;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        csvContent += chunk.map(row => 
          row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        if (i + chunkSize < rows.length) {
          csvContent += '\n';
        }
        
        setExportProgress(50 + (i / rows.length) * 40);
      }
      
      setExportProgress(90);
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
      onExportComplete('csv', `${filename}.csv`);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 500);
      
    } catch (error) {
      console.error('CSV export failed:', error);
      onExportError(error);
      setIsExporting(false);
      setExportProgress(0);
    }
  };
  
  // Export to Excel
  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      setExportProgress(10);
      onExportStart('excel');
      
      const { headers, rows } = prepareData();
      setExportProgress(30);
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      
      // Combine headers and rows
      const worksheetData = includeHeaders ? [headers, ...rows] : rows;
      setExportProgress(50);
      
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Apply column widths if autoWidth is enabled
      if (excelOptions.autoWidth && selectedColumns) {
        const colWidths = selectedColumns
          .filter(col => !allowColumnSelection || col.selected)
          .map(col => ({ wch: col.width ? col.width / 7 : 15 }));
        ws['!cols'] = colWidths;
      }
      
      setExportProgress(70);
      
      // Add filters if enabled
      if (excelOptions.includeFilters && includeHeaders) {
        ws['!autofilter'] = { 
          ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: worksheetData.length - 1, c: headers.length - 1 }
          })
        };
      }
      
      setExportProgress(80);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, excelOptions.sheetName || 'Data');
      
      // Generate file
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
      
      // Convert to blob
      const buf = new ArrayBuffer(wbout.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < wbout.length; i++) {
        view[i] = wbout.charCodeAt(i) & 0xFF;
      }
      
      setExportProgress(90);
      
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
      onExportComplete('excel', `${filename}.xlsx`);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 500);
      
    } catch (error) {
      console.error('Excel export failed:', error);
      onExportError(error);
      setIsExporting(false);
      setExportProgress(0);
    }
  };
  
  // Export to PDF
  const exportToPDF = async () => {
    // Get elements at export time
    const exportHtmlElement = getHtmlElement ? getHtmlElement() : null;
    
    console.log('=== PDF Export Debug ===');
    console.log('getHtmlElement provided:', !!getHtmlElement);
    console.log('exportHtmlElement:', !!exportHtmlElement, exportHtmlElement);
    console.log('aiInsightsText provided:', !!aiInsightsText);
    console.log('pdfOptions:', pdfOptions);
    console.log('data length:', data?.length || 0);
    
    try {
      setIsExporting(true);
      setExportProgress(10);
      onExportStart('pdf');
      
      const { jsPDF } = jspdf;
      const doc = new jsPDF({
        orientation: pdfOptions.orientation || 'portrait',
        unit: 'mm',
        format: pdfOptions.pageSize || 'a4',
        compress: true  // Enable PDF compression
      });
      
      setExportProgress(20);
      
      if (exportHtmlElement) {
        console.log('HTML element path - capturing dashboard');
        console.log('exportHtmlElement dimensions:', {
          scrollWidth: exportHtmlElement.scrollWidth,
          scrollHeight: exportHtmlElement.scrollHeight,
          clientWidth: exportHtmlElement.clientWidth,
          clientHeight: exportHtmlElement.clientHeight
        });
        
        // Capture HTML element as image (for charts, dashboards, etc.)
        setExportProgress(30);
        
        // Add title and metadata
        doc.setFontSize(16);
        doc.text(pdfOptions.title || filename, pdfOptions.margins.left, pdfOptions.margins.top - 10);
        
        doc.setFontSize(10);
        doc.text(
          `Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`,
          pdfOptions.margins.left,
          pdfOptions.margins.top - 5
        );
        
        setExportProgress(40);
        
        // Wait longer for ApexCharts to fully render
        console.log('Waiting 1000ms for charts to render...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Wait complete, starting html2canvas...');
        
        // Capture the element with better options for dashboards
        let canvas = null;
        let imgData = null;
        try {
          canvas = await html2canvas(exportHtmlElement, {
            scale: 2,
            logging: false,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: exportHtmlElement.scrollWidth,
            windowHeight: exportHtmlElement.scrollHeight,
            ignoreElements: (element) => {
              // Ignore elements that shouldn't be in the PDF
              return element.classList?.contains('no-print') || 
                     element.tagName === 'BUTTON';
            }
          });
          console.log('Dashboard canvas captured successfully');
          imgData = canvas.toDataURL('image/jpeg', 0.95);  // Use JPEG for better compression
        } catch (canvasError) {
          console.error('Error capturing dashboard canvas:', canvasError);
          console.warn('⚠️ Continuing PDF export without visualization - will include data table only');
          // Don't throw - continue with data table export
          canvas = null;
          imgData = null;
        }
        
        setExportProgress(60);
        
        // Calculate proper aspect ratio
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = pdfOptions.margins.left || 20;
        const marginRight = pdfOptions.margins.right || 20;
        const marginTop = pdfOptions.margins.top || 20;
        const marginBottom = pdfOptions.margins.bottom || 20;
        
        const maxWidth = pageWidth - marginLeft - marginRight;
        const maxHeight = pageHeight - marginTop - marginBottom - 10;
        
        // Only process image if canvas was captured successfully
        if (canvas && imgData) {
          // Calculate dimensions maintaining aspect ratio
          const canvasAspectRatio = canvas.width / canvas.height;
          const pageAspectRatio = maxWidth / maxHeight;
          
          let imgWidth, imgHeight;
          
          if (canvasAspectRatio > pageAspectRatio) {
            // Image is wider than page ratio - fit to width
            imgWidth = maxWidth;
            imgHeight = maxWidth / canvasAspectRatio;
          } else {
            // Image is taller than page ratio - fit to height
            imgHeight = maxHeight;
            imgWidth = maxHeight * canvasAspectRatio;
          }
          
          // For cluster visualization, maximize the image size on the first page
          // since we'll put the data table on subsequent pages
          if (exportHtmlElement && exportHtmlElement.id === 'cluster-graph-container') {
            console.log('Detected cluster graph - maximizing image size for PDF');
            // Use more of the page for the visualization
            const availableHeight = pageHeight - marginTop - marginBottom;
            const availableWidth = pageWidth - marginLeft - marginRight;
            
            // Recalculate to use full available space
            if (canvasAspectRatio > (availableWidth / availableHeight)) {
              imgWidth = availableWidth;
              imgHeight = availableWidth / canvasAspectRatio;
            } else {
              imgHeight = availableHeight;
              imgWidth = availableHeight * canvasAspectRatio;
            }
          }
          
          console.log('Image sizing:', {
            canvas: { width: canvas.width, height: canvas.height, ratio: canvasAspectRatio },
            page: { maxWidth, maxHeight, ratio: pageAspectRatio },
            final: { width: imgWidth, height: imgHeight }
          });
          
          // Skip AI Insights canvas capture - we only want the markdown text
          // The aiInsightsText parameter provides the markdown content directly
          
          // Image data and dimensions are already calculated above
          let yPosition = marginTop;
          const bottomMargin = pageHeight - marginBottom;
          
          // Check if we need multi-page support for tall dashboards
          if (pdfOptions.multiPage && imgHeight > bottomMargin - yPosition) {
            console.log('Using multi-page mode for tall dashboard');
            // Split the image across multiple pages
            const pageHeight = bottomMargin - yPosition;
            let remainingHeight = imgHeight;
            let currentY = 0;
          
          while (remainingHeight > 0) {
            const currentPageHeight = Math.min(pageHeight, remainingHeight);
            
            // Create a temporary canvas for this page's portion
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = (currentPageHeight / imgWidth) * canvas.width;
            
            const ctx = pageCanvas.getContext('2d');
            ctx.drawImage(
              canvas,
              0, currentY * (canvas.height / imgHeight),
              canvas.width, pageCanvas.height * (canvas.height / imgHeight),
              0, 0,
              pageCanvas.width, pageCanvas.height
            );
            
            const pageImgData = pageCanvas.toDataURL('image/png');
            
            doc.addImage(
              pageImgData,
              'PNG',
              pdfOptions.margins.left,
              yPosition,
              imgWidth,
              currentPageHeight
            );
            
            remainingHeight -= currentPageHeight;
            currentY += currentPageHeight;
            
            if (remainingHeight > 0) {
              doc.addPage();
              yPosition = pdfOptions.margins.top;
            }
          }
          } else if (yPosition + imgHeight > bottomMargin) {
            // Single page mode - scale to fit
          const maxHeight = bottomMargin - yPosition;
          const scaledWidth = (maxHeight * canvas.width) / canvas.height;
          
          doc.addImage(
            imgData, 
            'PNG', 
            pdfOptions.margins.left, 
            yPosition, 
            scaledWidth > imgWidth ? imgWidth : scaledWidth,
            scaledWidth > imgWidth ? imgHeight : maxHeight
          );
          } else {
            // Center the image horizontally if it's narrower than the page
            const xPosition = marginLeft + Math.max(0, (maxWidth - imgWidth) / 2);
            
            doc.addImage(
              imgData, 
              'JPEG', 
              xPosition, 
              yPosition, 
              imgWidth, 
              imgHeight
            );
            
            // For cluster graphs, always put data table on next page for better layout
            if (exportHtmlElement && exportHtmlElement.id === 'cluster-graph-container') {
              console.log('Cluster graph exported - data table will be on next page');
              // Force data table to next page by setting a flag
              doc.addPage();
            }
          }
        } else {
          // No image captured - add a note
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text('Note: Visualization could not be captured', pageWidth / 2, marginTop + 20, { align: 'center' });
        }
        
        // Add AI Insights on a new page - only use markdown text
        if (aiInsightsText) {
          console.log('Adding AI Insights to PDF on new page');
          doc.addPage();
          
          // Add AI Insights header
          doc.setFontSize(16);
          doc.setFont(undefined, 'bold');
          doc.text('AI-Generated Insights', marginLeft, marginTop);
          
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(100);
          doc.text(
            `Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`,
            marginLeft,
            marginTop + 7
          );
          doc.setTextColor(0);
          
          if (aiInsightsText) {
            // Render markdown as text
            let yPos = marginTop + 20;
            const lineHeight = 5;
            const maxLineWidth = pageWidth - marginLeft - marginRight;
            
            // Clean the markdown text to handle special characters
            let cleanText = aiInsightsText
              .replace(/[""]/g, '"')  // Smart quotes to regular quotes
              .replace(/['']/g, "'")  // Smart apostrophes to regular apostrophes
              .replace(/—/g, '-')     // Em dash to hyphen
              .replace(/–/g, '-')     // En dash to hyphen
              .replace(/…/g, '...')   // Ellipsis
              .replace(/•/g, '* ')    // Bullet points
              .replace(/\u200B/g, '') // Zero-width space
              .replace(/\u00A0/g, ' ') // Non-breaking space
              .replace(/[\u2000-\u206F]/g, '') // Various Unicode spaces and formatting
              .replace(/[\u2070-\u209F]/g, '') // Superscripts and subscripts
              .replace(/[\u20A0-\u20CF]/g, '') // Currency symbols (except common ones)
              .replace(/[\u2100-\u214F]/g, '') // Letterlike symbols
              .replace(/[\uFE00-\uFE0F]/g, '') // Variation selectors
              .replace(/[^\x00-\x7F\u0080-\u00FF]/g, ''); // Remove other non-ASCII chars except Latin-1
            
            // Parse markdown to extract structure
            const lines = cleanText.split('\n');
            
            for (const line of lines) {
              // Check if we need a new page
              if (yPos > pageHeight - marginBottom - 10) {
                doc.addPage();
                yPos = marginTop;
              }
              
              // Handle different markdown elements
              if (line.startsWith('# ')) {
                // H1 heading
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                const text = line.substring(2).trim();
                doc.text(text, marginLeft, yPos);
                yPos += lineHeight * 1.5;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
              } else if (line.startsWith('## ')) {
                // H2 heading
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                const text = line.substring(3).trim();
                doc.text(text, marginLeft, yPos);
                yPos += lineHeight * 1.3;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
              } else if (line.startsWith('### ')) {
                // H3 heading
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                const text = line.substring(4).trim();
                doc.text(text, marginLeft, yPos);
                yPos += lineHeight * 1.2;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
              } else if (line.startsWith('- ') || line.startsWith('* ')) {
                // Bullet point
                const text = line.substring(2).trim();
                const bulletX = marginLeft + 5;
                doc.text('•', marginLeft, yPos);
                const splitText = doc.splitTextToSize(text, maxLineWidth - 5);
                doc.text(splitText, bulletX, yPos);
                yPos += lineHeight * splitText.length;
              } else if (line.startsWith('**') && line.endsWith('**')) {
                // Bold text
                doc.setFont(undefined, 'bold');
                const text = line.substring(2, line.length - 2).trim();
                const splitText = doc.splitTextToSize(text, maxLineWidth);
                doc.text(splitText, marginLeft, yPos);
                yPos += lineHeight * splitText.length;
                doc.setFont(undefined, 'normal');
              } else if (line.trim() === '') {
                // Empty line
                yPos += lineHeight * 0.5;
              } else {
                // Regular text - also strip inline markdown formatting for now
                // Remove bold markers and other inline formatting
                let processedLine = line
                  .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold markers
                  .replace(/\*(.*?)\*/g, '$1')      // Remove italic markers
                  .replace(/`(.*?)`/g, '$1');       // Remove inline code markers
                
                const splitText = doc.splitTextToSize(processedLine, maxLineWidth);
                doc.text(splitText, marginLeft, yPos);
                yPos += lineHeight * splitText.length;
              }
            }
          }
        }
        
        // Optionally add data table below the image if both are provided
        if (pdfOptions.includeDataTable && data && data.length > 0) {
          console.log('Adding data table to PDF on new page');
          doc.addPage();
          
          // Add table title
          doc.setFontSize(14);
          doc.text('Data Table', pdfOptions.margins.left, pdfOptions.margins.top);
          
          // Generate the data table on the new page
          const { headers, rows } = prepareData();
          let tableY = pdfOptions.margins.top + 10;
          
          // Add headers
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          
          if (includeHeaders) {
            const colWidth = (doc.internal.pageSize.getWidth() - (pdfOptions.margins.left + pdfOptions.margins.right)) / headers.length;
            headers.forEach((header, i) => {
              doc.text(
                header, 
                pdfOptions.margins.left + (i * colWidth), 
                tableY,
                { maxWidth: colWidth - 2 }
              );
            });
            tableY += 7;
            
            // Add separator line
            doc.line(
              pdfOptions.margins.left,
              tableY - 2,
              doc.internal.pageSize.getWidth() - pdfOptions.margins.right,
              tableY - 2
            );
          }
          
          // Add all data rows
          doc.setFont(undefined, 'normal');
          rows.forEach((row) => {
            // Check if we need a new page
            if (tableY > doc.internal.pageSize.getHeight() - pdfOptions.margins.bottom - 10) {
              doc.addPage();
              tableY = pdfOptions.margins.top;
              
              // Re-add headers on new page
              doc.setFont(undefined, 'bold');
              const headerColWidth = (doc.internal.pageSize.getWidth() - (pdfOptions.margins.left + pdfOptions.margins.right)) / headers.length;
              headers.forEach((header, i) => {
                doc.text(
                  header,
                  pdfOptions.margins.left + (i * headerColWidth),
                  tableY,
                  { maxWidth: headerColWidth - 2 }
                );
              });
              tableY += 10;
              doc.setFont(undefined, 'normal');
            }
            
            const colWidth = (doc.internal.pageSize.getWidth() - (pdfOptions.margins.left + pdfOptions.margins.right)) / row.length;
            row.forEach((cell, i) => {
              doc.text(
                String(cell),
                pdfOptions.margins.left + (i * colWidth),
                tableY,
                { maxWidth: colWidth - 2 }
              );
            });
            tableY += 6;
          });
        }
        
        setExportProgress(90);
        
      } else {
        console.log('No HTML element provided - using data table only path');
        // Generate table from data
        const { headers, rows } = prepareData();
        setExportProgress(30);
        
        // Add title
        doc.setFontSize(16);
        doc.text(filename, pdfOptions.margins.left, pdfOptions.margins.top - 10);
        
        // Add date
        doc.setFontSize(10);
        doc.text(
          `Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`,
          pdfOptions.margins.left,
          pdfOptions.margins.top - 5
        );
        
        setExportProgress(40);
        
        // Calculate column widths
        const pageWidth = doc.internal.pageSize.getWidth() - (pdfOptions.margins.left + pdfOptions.margins.right);
        const colWidth = pageWidth / headers.length;
        
        // Add headers
        let y = pdfOptions.margins.top + 5;
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        
        if (includeHeaders) {
          headers.forEach((header, i) => {
            doc.text(
              header, 
              pdfOptions.margins.left + (i * colWidth), 
              y,
              { maxWidth: colWidth - 2 }
            );
          });
          y += 10;
          
          // Add separator line
          doc.line(
            pdfOptions.margins.left,
            y - 3,
            doc.internal.pageSize.getWidth() - pdfOptions.margins.right,
            y - 3
          );
        }
        
        setExportProgress(60);
        
        // Add data rows
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        const pageHeight = doc.internal.pageSize.getHeight();
        const bottomMargin = pageHeight - pdfOptions.margins.bottom;
        
        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          
          // Check if we need a new page
          if (y > bottomMargin) {
            doc.addPage();
            y = pdfOptions.margins.top;
            
            // Re-add headers on new page
            if (includeHeaders) {
              doc.setFont(undefined, 'bold');
              headers.forEach((header, i) => {
                doc.text(
                  header,
                  pdfOptions.margins.left + (i * colWidth),
                  y,
                  { maxWidth: colWidth - 2 }
                );
              });
              doc.setFont(undefined, 'normal');
              y += 10;
              doc.line(
                pdfOptions.margins.left,
                y - 3,
                doc.internal.pageSize.getWidth() - pdfOptions.margins.right,
                y - 3
              );
            }
          }
          
          row.forEach((cell, i) => {
            doc.text(
              String(cell),
              pdfOptions.margins.left + (i * colWidth),
              y,
              { maxWidth: colWidth - 2 }
            );
          });
          
          y += 7;
          setExportProgress(60 + (rowIdx / rows.length) * 30);
        }
        
        setExportProgress(90);
      }
      
      // Save the PDF
      doc.save(`${filename}.pdf`);
      
      setExportProgress(100);
      onExportComplete('pdf', `${filename}.pdf`);
      
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 500);
      
    } catch (error) {
      console.error('PDF export failed:', error);
      onExportError(error);
      setIsExporting(false);
      setExportProgress(0);
    }
  };
  
  // Export methods for headless mode
  React.useImperativeHandle(exportRef, () => ({
    exportToCSV,
    exportToExcel,
    exportToPDF,
    setData: (newData) => { data = newData; },
    setColumns: (newColumns) => { 
      columns = newColumns;
      setSelectedColumns(newColumns.map(col => ({ ...col, selected: true })));
    }
  }));
  
  // Handle export based on format
  const handleExport = (format) => {
    console.log('🎯 [DataExportPanel] handleExport called with format:', format);
    console.log('  - data:', data);
    console.log('  - data length:', data?.length);
    console.log('  - columns:', columns);
    setIsDropdownOpen(false);
    
    if (showPreview) {
      setPreviewFormat(format);
      setShowPreviewDialog(true);
    } else {
      switch (format) {
        case 'csv':
          exportToCSV();
          break;
        case 'excel':
          exportToExcel();
          break;
        case 'pdf':
          exportToPDF();
          break;
      }
    }
  };
  
  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Column selector dialog
  const renderColumnSelector = () => {
    if (!showColumnSelector) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '400px',
          width: '90%',
          maxHeight: '70vh',
          overflow: 'auto'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Select Columns to Export</h3>
          
          <div style={{ marginBottom: '16px' }}>
            {selectedColumns.map((col, idx) => (
              <label key={col.key} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <input
                  type="checkbox"
                  checked={col.selected}
                  onChange={(e) => {
                    const updated = [...selectedColumns];
                    updated[idx].selected = e.target.checked;
                    setSelectedColumns(updated);
                  }}
                  style={{ marginRight: '10px' }}
                />
                <span>{col.label || col.key}</span>
              </label>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowColumnSelector(false)}
              style={{
                padding: '8px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setShowColumnSelector(false)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: styles?.colors?.primary || '#3B82F6',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // Preview dialog
  const renderPreviewDialog = () => {
    if (!showPreviewDialog) return null;
    
    const { headers, rows } = prepareData();
    const previewRows = rows.slice(0, 10);
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '90%',
          width: '800px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
            Preview Export - {previewFormat?.toUpperCase()} Format
          </h3>
          
          <div style={{
            flex: 1,
            overflow: 'auto',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            padding: '10px',
            marginBottom: '16px'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {includeHeaders && (
                <thead>
                  <tr>
                    {headers.map((header, idx) => (
                      <th key={idx} style={{
                        padding: '8px',
                        borderBottom: '2px solid #E5E7EB',
                        textAlign: 'left',
                        fontWeight: '600'
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {previewRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} style={{
                        padding: '8px',
                        borderBottom: '1px solid #F3F4F6'
                      }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '10px' }}>
                ... and {rows.length - 10} more rows
              </p>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setShowPreviewDialog(false);
                setPreviewFormat(null);
              }}
              style={{
                padding: '8px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowPreviewDialog(false);
                handleExport(previewFormat);
                setPreviewFormat(null);
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: styles?.colors?.primary || '#3B82F6',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Export
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // Render UI based on button style
  const renderButton = () => {
    if (buttonStyle === 'icon') {
      return (
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{
            ...panelStyles.button,
            padding: '8px',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          disabled={isExporting}
        >
          <i className={`fa-solid ${icon}`}></i>
        </button>
      );
    }
    
    if (buttonStyle === 'menu') {
      return (
        <div style={{ display: 'flex', gap: '4px' }}>
          {formats.includes('csv') && (
            <button
              onClick={() => handleExport('csv')}
              style={{ ...panelStyles.button, fontSize: '12px', padding: '6px 12px' }}
              disabled={isExporting}
            >
              CSV
            </button>
          )}
          {formats.includes('excel') && (
            <button
              onClick={() => handleExport('excel')}
              style={{ ...panelStyles.button, fontSize: '12px', padding: '6px 12px' }}
              disabled={isExporting}
            >
              Excel
            </button>
          )}
          {formats.includes('pdf') && (
            <button
              onClick={() => handleExport('pdf')}
              style={{ ...panelStyles.button, fontSize: '12px', padding: '6px 12px' }}
              disabled={isExporting}
            >
              PDF
            </button>
          )}
        </div>
      );
    }
    
    // Default dropdown or button style
    return (
      <button
        onClick={() => {
          console.log('🖱️ [DataExportPanel] Button clicked!');
          console.log('  - buttonStyle:', buttonStyle);
          console.log('  - formats:', formats);
          console.log('  - isDropdownOpen:', isDropdownOpen);
          console.log('  - data at click:', data);
          console.log('  - data length at click:', data?.length);
          
          if (buttonStyle === 'dropdown') {
            setIsDropdownOpen(!isDropdownOpen);
          } else if (formats.length === 1) {
            handleExport(formats[0]);
          } else {
            setIsDropdownOpen(!isDropdownOpen);
          }
        }}
        style={panelStyles.button}
        disabled={isExporting}
      >
        <i className={`fa-solid ${icon}`}></i>
        <span>{buttonText}</span>
        {buttonStyle === 'dropdown' && formats.length > 1 && (
          <i className="fa-solid fa-chevron-down" style={{ fontSize: '10px' }}></i>
        )}
      </button>
    );
  };
  
  // Headless mode - no UI
  if (mode === 'headless') {
    return <div ref={exportRef} style={{ display: 'none' }} />;
  }
  
  // UI mode
  if (!visible) {
    return null;
  }
  
  return (
    <div ref={dropdownRef} style={panelStyles.container}>
      {renderButton()}
      
      {isExporting && (
        <div style={panelStyles.progressBar}>
          <div style={{
            ...panelStyles.progressFill,
            width: `${exportProgress}%`
          }} />
        </div>
      )}
      
      {isDropdownOpen && buttonStyle === 'dropdown' && (
        <div style={panelStyles.dropdown}>
          {allowColumnSelection && (
            <div
              style={{
                ...panelStyles.dropdownItem,
                backgroundColor: '#F9FAFB'
              }}
              onClick={() => {
                setShowColumnSelector(true);
                setIsDropdownOpen(false);
              }}
            >
              <i className="fa-solid fa-columns" style={{ width: '16px' }}></i>
              <span>Select Columns...</span>
            </div>
          )}
          
          {formats.includes('csv') && (
            <div
              style={panelStyles.dropdownItem}
              onClick={() => handleExport('csv')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <i className="fa-solid fa-file-csv" style={{ width: '16px', color: '#10B981' }}></i>
              <span>Export as CSV</span>
            </div>
          )}
          
          {formats.includes('excel') && (
            <div
              style={panelStyles.dropdownItem}
              onClick={() => handleExport('excel')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <i className="fa-solid fa-file-excel" style={{ width: '16px', color: '#059669' }}></i>
              <span>Export as Excel</span>
            </div>
          )}
          
          {formats.includes('pdf') && (
            <div
              style={{
                ...panelStyles.dropdownItem,
                borderBottom: 'none'
              }}
              onClick={() => handleExport('pdf')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <i className="fa-solid fa-file-pdf" style={{ width: '16px', color: '#DC2626' }}></i>
              <span>Export as PDF</span>
            </div>
          )}
        </div>
      )}
      
      {renderColumnSelector()}
      {renderPreviewDialog()}
    </div>
  );
}