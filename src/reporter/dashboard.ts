import type { ScanReport, ScanResult, Severity } from '../types/index.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 25,
  high: 20,
  medium: 10,
  low: 5,
  info: 1,
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
};

const CATEGORY_MAP: Record<string, string> = {
  introspection: 'Information Disclosure',
  'field-suggestion': 'Information Disclosure',
  'depth-limit': 'Denial of Service',
  'batch-attack': 'Denial of Service',
  'alias-overloading': 'Denial of Service',
  csrf: 'Authorization',
  'auth-bypass': 'Authorization',
};

export function calculatePostureScore(results: ScanResult[]): number {
  if (results.length === 0) return 100;

  let totalWeight = 0;
  let failedWeight = 0;

  for (const result of results) {
    const weight = SEVERITY_WEIGHTS[result.severity];
    totalWeight += weight;
    if (!result.passed) {
      failedWeight += weight;
    }
  }

  if (totalWeight === 0) return 100;
  const score = Math.round(((totalWeight - failedWeight) / totalWeight) * 100);
  return Math.max(0, Math.min(100, score));
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#ca8a04';
  if (score >= 40) return '#ea580c';
  return '#dc2626';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

function generateExecutiveSummary(report: ScanReport, score: number): string {
  const { summary } = report;
  const criticalHigh =
    (summary.bySeverity.critical || 0) + (summary.bySeverity.high || 0);

  if (score >= 90) {
    return `The GraphQL endpoint at ${escapeHtml(report.target)} demonstrates strong security posture with a score of ${score}/100. All ${summary.total} security checks were evaluated, with ${summary.passed} passing. No critical remediation is required at this time.`;
  }
  if (score >= 60) {
    return `The GraphQL endpoint at ${escapeHtml(report.target)} has a moderate security posture with a score of ${score}/100. Out of ${summary.total} checks, ${summary.failed} issues were identified. ${criticalHigh > 0 ? `${criticalHigh} high-severity issue(s) require immediate attention.` : 'Issues found are of moderate severity and should be addressed in the near term.'}`;
  }
  return `The GraphQL endpoint at ${escapeHtml(report.target)} requires immediate security attention with a score of ${score}/100. ${summary.failed} out of ${summary.total} checks failed, including ${criticalHigh} high or critical severity issue(s). Immediate remediation is strongly recommended to protect against known attack vectors.`;
}

function generateCategoryBreakdown(results: ScanResult[]): Record<string, ScanResult[]> {
  const categories: Record<string, ScanResult[]> = {};
  for (const result of results) {
    const category = CATEGORY_MAP[result.check] || 'Other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(result);
  }
  return categories;
}

function generateTimelineSvg(reports: ScanReport[]): string {
  if (reports.length < 2) return '';

  const width = 600;
  const height = 200;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const scores = reports.map((r) => calculatePostureScore(r.results));
  const maxScore = 100;
  const minScore = 0;

  const points = scores.map((score, i) => {
    const x = padding + (i / (scores.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((score - minScore) / (maxScore - minScore)) * chartHeight;
    return { x, y, score };
  });

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const labels = reports.map((r, i) => {
    const x = padding + (i / (reports.length - 1)) * chartWidth;
    const date = new Date(r.timestamp);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return `<text x="${x}" y="${height - 5}" text-anchor="middle" fill="#94a3b8" font-size="10">${label}</text>`;
  });

  const dots = points.map(
    (p) =>
      `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${getScoreColor(p.score)}" />
       <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" fill="#e2e8f0" font-size="11">${p.score}</text>`,
  );

  // Grid lines
  const gridLines = [0, 25, 50, 75, 100].map((v) => {
    const y = padding + chartHeight - (v / 100) * chartHeight;
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#334155" stroke-width="0.5" />
            <text x="${padding - 5}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="10">${v}</text>`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:auto;">
      <rect width="${width}" height="${height}" fill="#0f172a" rx="8" />
      ${gridLines.join('\n')}
      <path d="${pathData}" fill="none" stroke="#a78bfa" stroke-width="2" />
      ${dots.join('\n')}
      ${labels.join('\n')}
    </svg>`;
}

function renderCheckDetail(result: ScanResult, index: number): string {
  const color = SEVERITY_COLORS[result.severity];
  const statusClass = result.passed ? 'pass' : 'fail';
  const category = CATEGORY_MAP[result.check] || 'Other';

  return `
    <div class="check-card ${statusClass}">
      <div class="check-header" onclick="toggleCheck(${index})">
        <span class="check-status">${result.passed ? '&#10004;' : '&#10008;'}</span>
        <span class="sev-badge" style="background:${color}">${result.severity.toUpperCase()}</span>
        <span class="check-name">${escapeHtml(result.title)}</span>
        <span class="check-category">${escapeHtml(category)}</span>
        <span class="check-chevron" id="chevron-${index}">&#9654;</span>
      </div>
      <div class="check-details" id="check-${index}" style="display:none;">
        <p class="check-desc">${escapeHtml(result.description)}</p>
        ${!result.passed ? `<div class="remediation-box"><strong>Remediation:</strong> ${escapeHtml(result.remediation)}</div>` : ''}
      </div>
    </div>`;
}

export function generateDashboard(
  reports: ScanReport[],
  config?: { title?: string },
): string {
  if (reports.length === 0) {
    return '<html><body>No reports provided</body></html>';
  }

  const latestReport = reports[reports.length - 1];
  const score = calculatePostureScore(latestReport.results);
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const executiveSummary = generateExecutiveSummary(latestReport, score);
  const categories = generateCategoryBreakdown(latestReport.results);
  const timelineSvg = generateTimelineSvg(reports);
  const title = config?.title || 'GraphQL Sentinel Security Dashboard';

  const checkCards = latestReport.results
    .map((r, i) => renderCheckDetail(r, i))
    .join('\n');

  const categoryCards = Object.entries(categories)
    .map(([cat, results]) => {
      const catPassed = results.filter((r) => r.passed).length;
      const catFailed = results.filter((r) => !r.passed).length;
      const catColor = catFailed > 0 ? '#ef4444' : '#22c55e';
      return `
        <div class="cat-card">
          <div class="cat-header">
            <span class="cat-icon" style="color:${catColor}">${catFailed > 0 ? '&#9888;' : '&#10004;'}</span>
            <span class="cat-name">${escapeHtml(cat)}</span>
          </div>
          <div class="cat-stats">
            <span class="cat-passed">${catPassed} passed</span>
            <span class="cat-failed">${catFailed} failed</span>
          </div>
        </div>`;
    })
    .join('\n');

  const severityCounts = Object.entries(latestReport.summary.bySeverity)
    .filter(([_, count]) => count > 0)
    .map(
      ([sev, count]) =>
        `<span class="sev-count" style="background:${SEVERITY_COLORS[sev as Severity]}">${sev}: ${count}</span>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:1.5rem;min-height:100vh}
    .dashboard{max-width:1000px;margin:0 auto}
    h1{color:#a78bfa;font-size:1.4rem;margin-bottom:.25rem}
    .subtitle{color:#64748b;font-size:.8rem;margin-bottom:1.5rem}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1.5rem}
    .card{background:#1e293b;border-radius:8px;padding:1.25rem}
    .score-card{text-align:center;position:relative}
    .score-ring{position:relative;width:120px;height:120px;margin:0 auto .75rem}
    .score-ring svg{transform:rotate(-90deg)}
    .score-value{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2rem;font-weight:700}
    .score-label{font-size:.85rem;color:#94a3b8;margin-bottom:.5rem}
    .summary-card p{color:#94a3b8;font-size:.85rem;line-height:1.6}
    .stats-row{display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:1rem}
    .stat{text-align:center}
    .stat-val{font-size:1.3rem;font-weight:700}
    .stat-lbl{font-size:.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
    .stat-pass .stat-val{color:#22c55e}
    .stat-fail .stat-val{color:#ef4444}
    .severity-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
    .sev-count{padding:.15rem .6rem;border-radius:4px;font-size:.7rem;color:#fff;font-weight:600;text-transform:uppercase}
    .section-title{color:#a78bfa;font-size:1rem;font-weight:600;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1px solid #334155}
    .timeline-card{margin-bottom:1.5rem}
    .cat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.75rem;margin-bottom:1.5rem}
    .cat-card{background:#1e293b;border-radius:8px;padding:1rem}
    .cat-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
    .cat-icon{font-size:1.1rem}
    .cat-name{font-weight:600;font-size:.85rem}
    .cat-stats{display:flex;gap:1rem;font-size:.75rem}
    .cat-passed{color:#22c55e}
    .cat-failed{color:#ef4444}
    .checks-section{margin-bottom:1.5rem}
    .check-card{background:#1e293b;border-radius:8px;margin-bottom:.5rem;overflow:hidden;border-left:4px solid #475569}
    .check-card.fail{border-left-color:#ef4444}
    .check-card.pass{border-left-color:#22c55e}
    .check-header{display:flex;align-items:center;padding:.75rem 1rem;cursor:pointer;gap:.75rem;user-select:none}
    .check-header:hover{background:#334155}
    .check-status{font-size:1rem;min-width:1.25rem;text-align:center}
    .pass .check-status{color:#22c55e}
    .fail .check-status{color:#ef4444}
    .sev-badge{color:#fff;padding:.1rem .45rem;border-radius:3px;font-size:.65rem;font-weight:600;text-transform:uppercase}
    .check-name{font-weight:600;font-size:.85rem;flex:1}
    .check-category{font-size:.7rem;color:#64748b;background:#0f172a;padding:.15rem .5rem;border-radius:3px}
    .check-chevron{color:#64748b;font-size:.7rem;transition:transform .2s}
    .check-chevron.open{transform:rotate(90deg)}
    .check-details{padding:.75rem 1rem .75rem 3.5rem;border-top:1px solid #334155}
    .check-desc{color:#94a3b8;font-size:.8rem;line-height:1.5;margin-bottom:.5rem}
    .remediation-box{background:#1a2e1a;color:#86efac;font-size:.8rem;padding:.5rem .75rem;border-radius:4px;line-height:1.5}
    footer{text-align:center;color:#475569;font-size:.7rem;margin-top:2rem;padding-top:1rem;border-top:1px solid #1e293b}
  </style>
</head>
<body>
  <div class="dashboard">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">Target: ${escapeHtml(latestReport.target)} | ${escapeHtml(latestReport.timestamp)} | ${latestReport.duration}ms</div>

    <div class="grid">
      <div class="card score-card">
        <div class="section-title">Security Posture</div>
        <div class="score-ring">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#334155" stroke-width="8"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}" stroke-width="8" stroke-dasharray="${(score / 100) * 327} 327" stroke-linecap="round"/>
          </svg>
          <div class="score-value" style="color:${scoreColor}">${score}</div>
        </div>
        <div class="score-label">${scoreLabel}</div>
        <div class="stats-row">
          <div class="stat"><div class="stat-val">${latestReport.summary.total}</div><div class="stat-lbl">Total</div></div>
          <div class="stat stat-pass"><div class="stat-val">${latestReport.summary.passed}</div><div class="stat-lbl">Passed</div></div>
          <div class="stat stat-fail"><div class="stat-val">${latestReport.summary.failed}</div><div class="stat-lbl">Failed</div></div>
        </div>
        ${severityCounts ? `<div class="severity-row">${severityCounts}</div>` : ''}
      </div>

      <div class="card summary-card">
        <div class="section-title">Executive Summary</div>
        <p>${executiveSummary}</p>
      </div>
    </div>

    ${timelineSvg ? `
    <div class="card timeline-card">
      <div class="section-title">Vulnerability Timeline</div>
      ${timelineSvg}
    </div>` : ''}

    <div class="section-title">Category Breakdown</div>
    <div class="cat-grid">
      ${categoryCards}
    </div>

    <div class="checks-section">
      <div class="section-title">Check Details</div>
      ${checkCards}
    </div>

    <footer>Generated by GraphQL Sentinel v0.1.0</footer>
  </div>

  <script>
    function toggleCheck(idx){
      var el=document.getElementById('check-'+idx);
      var ch=document.getElementById('chevron-'+idx);
      if(el.style.display==='none'){el.style.display='block';ch.classList.add('open');}
      else{el.style.display='none';ch.classList.remove('open');}
    }

    // Persist scan results in localStorage for timeline tracking
    (function(){
      try{
        var key='graphql-sentinel-history';
        var current=${JSON.stringify({
          target: latestReport.target,
          timestamp: latestReport.timestamp,
          score: score,
          passed: latestReport.summary.passed,
          failed: latestReport.summary.failed,
          total: latestReport.summary.total,
        })};
        var history=JSON.parse(localStorage.getItem(key)||'[]');
        // Avoid duplicates by timestamp
        if(!history.some(function(h){return h.timestamp===current.timestamp;})){
          history.push(current);
          // Keep last 50 entries
          if(history.length>50)history=history.slice(-50);
          localStorage.setItem(key,JSON.stringify(history));
        }
      }catch(e){/* ignore storage errors */}
    })();
  </script>
</body>
</html>`;
}
