/**
 * Dashboard HTML — the Human-Agent Control Observatory UI.
 *
 * A self-contained single-page app that fetches session data from the
 * dashboard server API and renders the six metrics with visualizations.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Human-Agent Control Observatory</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --yellow: #d29922;
    --orange: #db6d28;
    --red: #f85149;
    --purple: #bc8cff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 20px;
  }
  h1 { font-size: 1.8rem; margin-bottom: 4px; }
  h2 { font-size: 1.3rem; margin: 20px 0 10px; }
  .subtitle { color: var(--text-dim); font-size: 0.9rem; margin-bottom: 20px; }
  .container { max-width: 1400px; margin: 0 auto; }
  .grid { display: grid; gap: 16px; }
  .grid-3 { grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); }
  .grid-2 { grid-template-columns: repeat(auto-fill, minmax(500px, 1fr)); }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .card-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .metric-value {
    font-size: 2.2rem;
    font-weight: 700;
    margin: 8px 0;
  }
  .metric-desc {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .metric-interpretation {
    font-size: 0.85rem;
    padding: 8px 12px;
    border-radius: 6px;
    margin-top: 8px;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--border);
    overflow: hidden;
    margin: 8px 0;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .bar-fill.green { background: var(--green); }
  .bar-fill.yellow { background: var(--yellow); }
  .bar-fill.orange { background: var(--orange); }
  .bar-fill.red { background: var(--red); }
  .bar-fill.blue { background: var(--accent); }
  .bar-fill.purple { background: var(--purple); }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  th { color: var(--text-dim); font-weight: 600; }
  .session-list { max-height: 400px; overflow-y: auto; }
  .session-item {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
  }
  .session-item:hover { background: rgba(88, 166, 255, 0.1); }
  .session-item.active { background: rgba(88, 166, 255, 0.15); border-left: 3px solid var(--accent); }
  .session-id { font-family: monospace; font-size: 0.8rem; color: var(--text-dim); }
  .session-meta { font-size: 0.75rem; color: var(--text-dim); margin-top: 2px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .badge.green { background: rgba(63, 185, 80, 0.2); color: var(--green); }
  .badge.yellow { background: rgba(210, 153, 34, 0.2); color: var(--yellow); }
  .badge.orange { background: rgba(219, 109, 40, 0.2); color: var(--orange); }
  .badge.red { background: rgba(248, 81, 73, 0.2); color: var(--red); }
  .risk-chart { display: flex; gap: 4px; height: 24px; border-radius: 4px; overflow: hidden; }
  .risk-segment { display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; }
  .timeline-item {
    padding: 6px 12px;
    border-left: 2px solid var(--border);
    margin-left: 8px;
    font-size: 0.8rem;
  }
  .timeline-item.tool { border-color: var(--accent); }
  .timeline-item.human { border-color: var(--green); }
  .timeline-item.system { border-color: var(--text-dim); }
  .timeline-time { color: var(--text-dim); font-family: monospace; font-size: 0.7rem; }
  .timeline-content { color: var(--text); }
  .loading { text-align: center; padding: 40px; color: var(--text-dim); }
  .phase-bar { display: flex; gap: 2px; margin: 8px 0; }
  .phase-segment {
    padding: 4px 8px;
    font-size: 0.7rem;
    border-radius: 4px;
    text-align: center;
  }
  .controls { display: flex; gap: 12px; margin-bottom: 20px; align-items: center; }
  select, button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  button:hover { border-color: var(--accent); }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .summary-stats { display: flex; gap: 24px; }
  .stat { text-align: center; }
  .stat-value { font-size: 1.8rem; font-weight: 700; }
  .stat-label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; }
  .warning {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid var(--red);
    color: var(--red);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    margin: 8px 0;
  }
  .info-box {
    background: rgba(88, 166, 255, 0.1);
    border: 1px solid var(--accent);
    color: var(--accent);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    margin: 8px 0;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header-row">
    <div>
      <h1>Human-Agent Control Observatory</h1>
      <div class="subtitle">Jarvis Labs — Meaningful Human Control Metrics for Agentic Coding Sessions</div>
    </div>
  </div>

  <div class="controls">
    <label style="font-size:0.85rem; color:var(--text-dim);">Session:</label>
    <select id="sessionSelect" onchange="loadSession(this.value)">
      <option value="">Select a session...</option>
    </select>
    <button onclick="loadSessions()">Refresh</button>
    <button onclick="loadSummary()">Summary View</button>
  </div>

  <div id="content">
    <div class="loading">Select a session to begin analysis.</div>
  </div>
</div>

<script>
function colorForValue(value, thresholds) {
  // thresholds: [greenMax, yellowMax, orangeMax] — above is red
  if (value <= thresholds[0]) return 'green';
  if (value <= thresholds[1]) return 'yellow';
  if (value <= thresholds[2]) return 'orange';
  return 'red';
}

function formatValue(value) {
  if (typeof value === 'number') {
    if (value <= 1) return (value * 100).toFixed(1) + '%';
    return value.toFixed(2);
  }
  if (value && typeof value === 'object') {
    if (value.normalized !== undefined) return value.normalized.toFixed(1) + '/100';
    if (value.privilegeSurface !== undefined) return 'PS:' + value.privilegeSurface + ' BR:' + value.blastRadius;
    return JSON.stringify(value);
  }
  return String(value);
}

function metricCard(metric) {
  const val = formatValue(metric.value);
  let barHtml = '';
  let badgeHtml = '';

  if (typeof metric.value === 'number' && metric.value <= 1) {
    const pct = metric.value * 100;
    const color = colorForValue(metric.value, [0.3, 0.5, 0.7]);
    // For oversight and verification, high is good (green); for delegation and RAE, high is concerning
    const isGoodHigh = metric.name.includes('Oversight') || metric.name.includes('Verification');
    const barColor = isGoodHigh ? colorForValue(1 - metric.value, [0.3, 0.5, 0.7]) : color;
    barHtml = '<div class="bar"><div class="bar-fill ' + barColor + '" style="width:' + pct + '%"></div></div>';
    badgeHtml = '<span class="badge ' + barColor + '">' + pct.toFixed(0) + '%</span>';
  }

  let phaseHtml = '';
  if (metric.byPhase) {
    phaseHtml = '<div style="margin-top:8px;"><div class="card-title">By Phase</div>';
    for (const [phase, val] of Object.entries(metric.byPhase)) {
      const pct = (val * 100).toFixed(0);
      phaseHtml += '<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin:4px 0;">' +
        '<span style="color:var(--text-dim);">' + phase + '</span>' +
        '<span>' + pct + '%</span></div>';
    }
    phaseHtml += '</div>';
  }

  let interpHtml = '';
  if (metric.interpretation) {
    const isWarning = metric.interpretation.includes('WARNING') || metric.interpretation.includes('Very high') || metric.interpretation.includes('Minimal oversight') || metric.interpretation.includes('Very high risk');
    interpHtml = '<div class="metric-interpretation" style="background:' + (isWarning ? 'rgba(248,81,73,0.1)' : 'rgba(88,166,255,0.05)') + '; border:1px solid ' + (isWarning ? 'var(--red)' : 'var(--border)') + ';">' + metric.interpretation + '</div>';
  }

  return '<div class="card">' +
    '<div class="card-title">' + metric.name + '</div>' +
    '<div class="metric-value">' + val + ' ' + badgeHtml + '</div>' +
    barHtml +
    '<div class="metric-desc">' + metric.description + '</div>' +
    interpHtml +
    phaseHtml +
    '</div>';
}

function riskChart(dist) {
  const total = dist.critical + dist.high + dist.medium + dist.low;
  if (total === 0) return '<div style="color:var(--text-dim); font-size:0.85rem;">No tool calls</div>';
  const segments = [
    { label: 'Critical', count: dist.critical, color: '#f85149' },
    { label: 'High', count: dist.high, color: '#db6d28' },
    { label: 'Medium', count: dist.medium, color: '#d29922' },
    { label: 'Low', count: dist.low, color: '#3fb950' },
  ];
  let html = '<div class="risk-chart">';
  for (const seg of segments) {
    if (seg.count === 0) continue;
    const pct = (seg.count / total * 100);
    html += '<div class="risk-segment" style="width:' + pct + '%; background:' + seg.color + '; color:#0d1117;">' + seg.count + '</div>';
  }
  html += '</div><div style="display:flex; gap:12px; margin-top:8px; font-size:0.75rem;">';
  for (const seg of segments) {
    html += '<span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:' + seg.color + '; margin-right:4px;"></span>' + seg.label + ': ' + seg.count + '</span>';
  }
  html += '</div>';
  return html;
}

function timelineView(events) {
  const visible = events.slice(-100); // Last 100 events
  let html = '<div style="max-height:500px; overflow-y:auto;">';
  for (const ev of visible) {
    const time = new Date(ev.data.timestamp).toLocaleTimeString();
    let icon = '○';
    let content = '';
    let cls = 'system';
    if (ev.kind === 'tool-call') {
      icon = '🔧';
      cls = 'tool';
      const tc = ev.data;
      content = tc.toolName + ' (risk:' + tc.riskScore + ', auto:' + tc.autonomyScore + ')' + (tc.autoApproved ? ' ⚡auto' : ' ✋approved');
    } else if (ev.kind === 'human-action') {
      icon = '👤';
      cls = 'human';
      const ha = ev.data;
      content = ha.kind + ': ' + ha.content.substring(0, 100) + (ha.content.length > 100 ? '...' : '');
      if (ha.isOversight) content += ' 🛡️oversight';
    } else {
      icon = '⚙️';
      content = ev.data.subtype;
    }
    html += '<div class="timeline-item ' + cls + '">' +
      '<span class="timeline-time">' + time + '</span> ' + icon + ' ' +
      '<span class="timeline-content">' + content + '</span></div>';
  }
  html += '</div>';
  return html;
}

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    const select = document.getElementById('sessionSelect');
    select.innerHTML = '<option value="">Select a session...</option>';
    for (const s of sessions) {
      const opt = document.createElement('option');
      opt.value = s.sessionId;
      const date = new Date(s.mtime).toLocaleString();
      const sizeKb = (s.size / 1024).toFixed(0);
      opt.textContent = date + ' — ' + s.projectDir + ' (' + sizeKb + 'KB)';
      select.appendChild(opt);
    }
  } catch (err) {
    document.getElementById('content').innerHTML = '<div class="warning">Failed to load sessions: ' + err + '</div>';
  }
}

async function loadSession(sessionId) {
  if (!sessionId) return;
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Analyzing session...</div>';
  try {
    const res = await fetch('/api/session/' + sessionId);
    const report = await res.json();

    let html = '';

    // Session summary
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title">Session Overview</div>';
    html += '<div class="summary-stats">';
    html += '<div class="stat"><div class="stat-value">' + report.totalToolCalls + '</div><div class="stat-label">Tool Calls</div></div>';
    html += '<div class="stat"><div class="stat-value">' + report.totalHumanActions + '</div><div class="stat-label">Human Actions</div></div>';
    const durMin = (report.duration / 60000).toFixed(1);
    html += '<div class="stat"><div class="stat-value">' + durMin + '</div><div class="stat-label">Minutes</div></div>';
    const ratio = report.totalToolCalls > 0 ? (report.totalHumanActions / report.totalToolCalls).toFixed(2) : '0';
    html += '<div class="stat"><div class="stat-value">' + ratio + '</div><div class="stat-label">Human/Agent Ratio</div></div>';
    html += '</div></div>';

    // Risk distribution
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title">Risk Distribution</div>';
    html += riskChart(report.riskDistribution);
    html += '</div>';

    // Six metrics
    html += '<h2>Control Metrics</h2>';
    html += '<div class="grid grid-3">';
    for (const metric of report.metrics) {
      html += metricCard(metric);
    }
    html += '</div>';

    // Timeline
    html += '<h2>Event Timeline (last 100 events)</h2>';
    html += '<div class="card">';
    html += timelineView(report.timeline);
    html += '</div>';

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<div class="warning">Failed to analyze session: ' + err + '</div>';
  }
}

async function loadSummary() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Computing summary across recent sessions...</div>';
  try {
    const res = await fetch('/api/recent');
    const reports = await res.json();

    let html = '<h2>Recent Sessions Summary</h2>';
    html += '<div class="card"><table>';
    html += '<tr><th>Session</th><th>Time</th><th>Tools</th><th>Human</th><th>Delegation</th><th>RAE</th><th>Oversight</th><th>IVR</th><th>Residual</th></tr>';
    for (const r of reports) {
      const getMetric = (name) => {
        const m = r.metrics.find(m => m.name.includes(name));
        if (!m) return '-';
        if (typeof m.value === 'number') return m.value <= 1 ? (m.value * 100).toFixed(0) + '%' : m.value.toFixed(1);
        if (m.value && m.value.normalized !== undefined) return m.value.normalized.toFixed(0);
        return '-';
      };
      const time = new Date(r.startTime).toLocaleString();
      html += '<tr style="cursor:pointer;" onclick="loadSession(\\'' + r.sessionId + '\\')">';
      html += '<td style="font-family:monospace; font-size:0.75rem;">' + r.sessionId.substring(0, 12) + '...</td>';
      html += '<td>' + time + '</td>';
      html += '<td>' + r.toolCalls + '</td>';
      html += '<td>' + r.humanActions + '</td>';
      html += '<td>' + getMetric('Delegation') + '</td>';
      html += '<td>' + getMetric('Risk-Weighted') + '</td>';
      html += '<td>' + getMetric('Oversight') + '</td>';
      html += '<td>' + getMetric('Independent') + '</td>';
      html += '<td>' + getMetric('Residual') + '</td>';
      html += '</tr>';
    }
    html += '</table></div>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<div class="warning">Failed to load summary: ' + err + '</div>';
  }
}

// Load sessions on startup
loadSessions();
</script>
</body>
</html>`;
