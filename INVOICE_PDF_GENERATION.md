# Invoice PDF Generation

## Current Status
The invoice download endpoint (`GET /api/v1/invoices/:id/download`) is implemented but currently returns a placeholder text file.

## Requirements
The endpoint MUST return a valid PDF file with:
- Company logo in header
- Invoice number, date, due date prominently displayed
- Customer billing information
- Itemized list of products/services with quantities, prices, taxes
- Subtotal, tax, discount, shipping, and total amounts clearly shown
- Payment terms and notes
- Professional formatting and styling
- Page numbers (if multi-page)

## Implementation Steps

### 1. Install PDF Library
```bash
npm install pdfkit
```

### 2. Update downloadInvoicePDF Function
Replace the placeholder implementation in `src/controllers/invoices.controller.js` with actual PDF generation using pdfkit.

### Example Implementation:
```javascript
import PDFDocument from 'pdfkit';

export async function downloadInvoicePDF(req, res, next) {
  try {
    // ... get invoice data ...
    
    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Add content
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice Number: ${invoice.invoice_number}`);
    doc.text(`Date: ${invoice.invoice_date}`);
    doc.text(`Due Date: ${invoice.due_date}`);
    doc.moveDown();
    
    // Customer information
    doc.text(`Bill To:`, { underline: true });
    doc.text(invoice.customer_name);
    if (invoice.customer_address) doc.text(invoice.customer_address);
    if (invoice.customer_city) doc.text(`${invoice.customer_city}, ${invoice.customer_state}`);
    doc.moveDown();
    
    // Items table
    doc.fontSize(10);
    // Add table headers and rows
    // ... implement table layout ...
    
    // Totals
    doc.moveDown();
    doc.text(`Subtotal: ${invoice.currency} ${invoice.subtotal}`);
    doc.text(`Tax: ${invoice.currency} ${invoice.tax_amount}`);
    doc.text(`Total: ${invoice.currency} ${invoice.total_amount}`);
    
    // Finalize PDF
    doc.end();
  } catch (err) {
    next(err);
  }
}
```

### 3. Add Company Branding
- Load company logo image
- Add company name and address
- Style headers and footers

### 4. Test PDF Generation
- Verify PDF opens correctly in PDF viewers
- Check formatting and layout
- Ensure all invoice data is included
- Test with different invoice sizes (single page vs multi-page)

## Notes
- PDF must start with `%PDF` magic bytes (pdfkit handles this automatically)
- File extension must be `.pdf`
- Content-Type must be `application/pdf`
- PDF must be readable by standard PDF viewers

