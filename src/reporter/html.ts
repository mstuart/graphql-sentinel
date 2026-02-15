import type { ScanReport, ScanResult, Severity } from '../types/index.js';

function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'medium':
      return '#ca8a04';
    case 'low':
      return '#2563eb';
    case 'info':
      return '#6b7280';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderResult(result: ScanResult, index: number): string {
  const color = severityColor(result.severity);
  const statusClass = result.passed ? 'pass' : 'fail';

  return `
    <div class="result ${statusClass}">
      <div class="result-header" onclick="toggleDetails('details-${index}')">
        <span class="status-icon">${result.passed ? '&#10004;' : '&#10008;'}</span>
        <span class="severity-badge" style="background-color: ${color}">${result.severity.toUpperCase()}</span>
        <span class="result-title">${escapeHtml(result.title)}</span>
      </div>
      <div class="result-body">
        <p class="description">${escapeHtml(result.description)}</p>
        ${
          !result.passed
            ? `<details id="details-${index}">
            <summary>Remediation</summary>
            <p class="remediation">${escapeHtml(result.remediation)}</p>
          </details>`
            : ''
        }
      </div>
    </div>`;
}

export function generateHtmlReport(report: ScanReport): string {
  const results = report.results.map((r, i) => renderResult(r, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GraphQL Sentinel Security Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #a78bfa; margin-bottom: 0.5rem; font-size: 1.5rem; }
    .meta { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
    .meta span { margin-right: 1.5rem; }
    .result { background: #1e293b; border-radius: 8px; margin-bottom: 0.75rem; border-left: 4px solid #475569; overflow: hidden; }
    .result.fail { border-left-color: #ef4444; }
    .result.pass { border-left-color: #22c55e; }
    .result-header { display: flex; align-items: center; padding: 0.75rem 1rem; cursor: pointer; gap: 0.75rem; }
    .result-header:hover { background: #334155; }
    .status-icon { font-size: 1.1rem; min-width: 1.5rem; text-align: center; }
    .pass .status-icon { color: #22c55e; }
    .fail .status-icon { color: #ef4444; }
    .severity-badge { color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
    .result-title { font-weight: 600; }
    .result-body { padding: 0 1rem 0.75rem 3.25rem; }
    .description { color: #94a3b8; font-size: 0.875rem; margin-bottom: 0.5rem; }
    details { margin-top: 0.5rem; }
    summary { color: #60a5fa; cursor: pointer; font-size: 0.875rem; }
    summary:hover { color: #93c5fd; }
    .remediation { color: #86efac; font-size: 0.875rem; margin-top: 0.5rem; padding: 0.5rem; background: #1a2e1a; border-radius: 4px; }
    .summary-box { background: #1e293b; border-radius: 8px; padding: 1.5rem; margin-top: 1.5rem; }
    .summary-box h2 { color: #a78bfa; margin-bottom: 1rem; font-size: 1.1rem; }
    .summary-stats { display: flex; gap: 2rem; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; }
    .stat-pass .stat-value { color: #22c55e; }
    .stat-fail .stat-value { color: #ef4444; }
    .severity-counts { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
    .severity-count { padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem; color: white; }
    footer { text-align: center; color: #64748b; margin-top: 2rem; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>GraphQL Sentinel Security Report</h1>
    <div class="meta">
      <span>Target: ${escapeHtml(report.target)}</span>
      <span>Date: ${escapeHtml(report.timestamp)}</span>
      <span>Duration: ${report.duration}ms</span>
    </div>

    ${results}

    <div class="summary-box">
      <h2>Summary</h2>
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-value">${report.summary.total}</div>
          <div class="stat-label">Total Checks</div>
        </div>
        <div class="stat stat-pass">
          <div class="stat-value">${report.summary.passed}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat stat-fail">
          <div class="stat-value">${report.summary.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
      ${
        report.summary.failed > 0
          ? `<div class="severity-counts">
          ${Object.entries(report.summary.bySeverity)
            .filter(([_, count]) => count > 0)
            .map(
              ([severity, count]) =>
                `<span class="severity-count" style="background-color: ${severityColor(severity as Severity)}">${severity}: ${count}</span>`,
            )
            .join('\n          ')}
        </div>`
          : ''
      }
    </div>

    <footer>Generated by GraphQL Sentinel v0.1.0</footer>
  </div>
  <script>
    function toggleDetails(id) {
      const el = document.getElementById(id);
      if (el) { el.open = !el.open; }
    }
  </script>
</body>
</html>`;
}
