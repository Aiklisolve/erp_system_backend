-- Create reports table schema
-- Run this SQL script to create the reports table

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  report_code VARCHAR(50) UNIQUE NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  description TEXT,
  format VARCHAR(20) NOT NULL CHECK (format IN ('PDF', 'EXCEL', 'CSV', 'JSON')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  start_date DATE,
  end_date DATE,
  filters JSONB,
  file_url TEXT,
  file_name VARCHAR(255),
  file_size BIGINT,
  generated_at TIMESTAMP WITHOUT TIME ZONE,
  generated_by BIGINT,
  error_message TEXT,
  parameters JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_generated_by FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create index on report_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_reports_report_type ON reports(report_type);

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- Create index on generated_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_reports_generated_by ON reports(generated_by);

-- Add comment to table
COMMENT ON TABLE reports IS 'Stores generated reports metadata and file information';

-- Add comments to columns
COMMENT ON COLUMN reports.report_code IS 'Auto-generated unique report code (format: RPT-YYYY-XXXXXX)';
COMMENT ON COLUMN reports.report_type IS 'Type of report (HR_EMPLOYEE, FINANCE_TRANSACTION, etc.)';
COMMENT ON COLUMN reports.format IS 'Output format: PDF, EXCEL, CSV, or JSON';
COMMENT ON COLUMN reports.status IS 'Report generation status: PENDING, PROCESSING, COMPLETED, or FAILED';
COMMENT ON COLUMN reports.filters IS 'JSON object containing report-specific filters';
COMMENT ON COLUMN reports.parameters IS 'JSON object containing additional report generation parameters';
COMMENT ON COLUMN reports.file_url IS 'URL to download the generated report file';
COMMENT ON COLUMN reports.file_size IS 'Size of the generated file in bytes';

