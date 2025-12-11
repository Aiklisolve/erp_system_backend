# Excel File Generation Instructions

## Current Implementation
Currently, Excel format reports are served as CSV files, which Excel can open natively. This is a temporary solution.

## To Generate Proper Excel Files (.xlsx)

### Step 1: Install exceljs library
```bash
npm install exceljs
```

### Step 2: Update `src/controllers/reports.controller.js`

1. Uncomment the import at the top:
```javascript
import ExcelJS from 'exceljs';
```

2. Update the `generateFileName` function to use `.xlsx`:
```javascript
function generateFileName(reportName, format) {
  const extension = format.toLowerCase() === 'excel' ? 'xlsx' : format.toLowerCase();
  const sanitizedName = reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const timestamp = new Date().toISOString().split('T')[0];
  return `${sanitizedName}_${timestamp}.${extension}`;
}
```

3. Update the `generateFileUrl` function to use `.xlsx`:
```javascript
function generateFileUrl(reportCode, format) {
  const extension = format.toLowerCase() === 'excel' ? 'xlsx' : format.toLowerCase();
  return `/api/v1/reports/files/${reportCode}.${extension}`;
}
```

4. Replace the Excel download section in `downloadReport` function with:

```javascript
} else if (report.format === 'EXCEL') {
  // Generate proper Excel file
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  
  // Add headers
  worksheet.columns = [
    { header: 'Report Code', key: 'report_code', width: 20 },
    { header: 'Report Type', key: 'report_type', width: 20 },
    { header: 'Report Name', key: 'report_name', width: 30 },
    { header: 'Generated At', key: 'generated_at', width: 25 }
  ];
  
  // Add data row
  worksheet.addRow({
    report_code: report.report_code,
    report_type: report.report_type,
    report_name: report.report_name,
    generated_at: report.generated_at || new Date().toISOString()
  });
  
  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // Set proper headers
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  
  // Write workbook to response
  await workbook.xlsx.write(res);
  return res.end();
}
```

### Step 3: Update `processReportGeneration` function
When generating the file, calculate actual file size after creating the Excel file.

## Alternative: Use xlsx library (lighter)
```bash
npm install xlsx
```

Then use:
```javascript
import * as XLSX from 'xlsx';

// Create workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet([{
  'Report Code': report.report_code,
  'Report Type': report.report_type,
  'Report Name': report.report_name,
  'Generated At': report.generated_at
}]);
XLSX.utils.book_append_sheet(wb, ws, 'Report');

// Write to buffer
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
return res.send(buffer);
```

