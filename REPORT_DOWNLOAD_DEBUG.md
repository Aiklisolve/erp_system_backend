# Report Download Debug Guide

## Current Status
Reports are being generated and marked as COMPLETED, but frontend validation is failing.

## Issue Analysis

### Frontend Validation
The frontend is checking if downloaded files are valid PDF/Excel/CSV files by:
1. Checking file content (magic bytes/file signature)
2. Validating file extension matches format
3. Checking Content-Type header

### Current Backend Behavior
- **Excel Format**: Sends CSV content with `.csv` extension
- **PDF Format**: Sends text content with `.txt` extension  
- **CSV Format**: Sends CSV content with `.csv` extension ✅

## Debugging Steps

### 1. Check Server Logs
When downloading a report, check server console for:
```
[Download Report {id}] Starting download - Format: {format}, Type: {type}
[Download Report {id}] CSV File Details:
  - Format: {format}
  - FileName: {fileName}
  - Content-Type: text/csv; charset=utf-8
  - Headers count: {count}
  - Rows count: {count}
  - CSV Content preview: {preview}
[Download Report {id}] Sending CSV file - Size: {size} bytes
```

### 2. Check Report Generation Logs
When generating a report, check for:
```
[Generate Report] Created report record - ID: {id}
[Generate Report] Starting report generation for ID: {id}
[processReportGeneration] Starting for report ID: {id}
[processReportGeneration] Generated file URL: {url}
[processReportGeneration] Report {id} marked as COMPLETED successfully
[Generate Report] Report generation completed - ID: {id}, Status: COMPLETED
```

### 3. Test Download Endpoint
Use curl to test:
```bash
curl -v "http://localhost:3000/api/v1/reports/{id}/download" \
  -H "Authorization: Bearer {token}" \
  -o test-download.csv
```

Check:
- Response headers (Content-Type, Content-Disposition)
- File content (should be valid CSV/text)
- File extension matches content

## Solutions

### Option 1: Generate Actual Files (Recommended)
Install libraries and generate proper files:
```bash
npm install exceljs pdfkit
```

### Option 2: Update Frontend Validation
Update frontend to accept:
- CSV files for Excel format
- Text files for PDF format

### Option 3: Temporary Workaround
For now, reports will download as:
- Excel → CSV file (Excel can open CSV)
- PDF → Text file (can be converted to PDF manually)

## Verification Checklist

- [ ] Reports are being created in database
- [ ] Reports are marked as COMPLETED after generation
- [ ] Download endpoint returns file (not JSON)
- [ ] File content is valid CSV/text
- [ ] File extension matches content
- [ ] Content-Type header is correct
- [ ] Frontend receives file correctly

## Next Steps

1. Check server logs when generating/downloading reports
2. Verify file content is correct
3. Check if frontend validation can be updated
4. Or install exceljs/pdfkit to generate actual files

