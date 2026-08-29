/* ============================================================
   BLOCK PLANNING CONSOLE — app.js
   Organized so each piece can be edited independently:
     1. Data fetching   (swap ONE line here when backend is ready)
     2. State/config
     3. Render functions (one per dashboard section)
     4. Event handlers
     5. Init
   ============================================================ */

/* ---------- 1. DATA FETCHING ---------------------------------
   This is the ONLY function that knows where data comes from.
   Nothing else in this file calls fetch() directly.
   TODAY: reads the local mock file.
   LATER: replace the URL below with your backend's real endpoint,
   e.g. fetch('https://your-backend-url/generate-schedule')
   — everything else in this file stays exactly the same.
----------------------------------------------------------------*/
async function getScheduleData() {
  const response = await fetch('./mock-data.json');
  if (!response.ok) throw new Error('Failed to load schedule data');
  return response.json();
}

/* ---------- 2. STATE / CONFIG --------------------------------*/

const DEPARTMENTS = {
  'Engineering':       { color: 'var(--dept-engineering)', className: 'block--engineering' },
  'Signal & Telecom':  { color: 'var(--dept-signal)',       className: 'block--signal' },
  'Traction':          { color: 'var(--dept-traction)',     className: 'block--traction' },
};

let currentView = 'week'; // 'week' | 'month'
let scheduleData = null;

/* ---------- 3. RENDER FUNCTIONS ------------------------------*/

function renderLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = Object.entries(DEPARTMENTS).map(([name, cfg]) => `
    <div class="legend__item">
      <span class="legend__swatch" style="background:${cfg.color}"></span>
      ${name}
    </div>
  `).join('');
}

function renderSummary(summary) {
  const el = document.getElementById('summaryStats');
  el.innerHTML = `
    <div class="stat">
      <span class="stat__label">Total blocks</span>
      <span class="stat__value">${summary.total_blocks}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Train-hours saved</span>
      <span class="stat__value">${summary.train_hours_saved}h</span>
    </div>
    <div class="stat">
      <span class="stat__label">Critical defects addressed</span>
      <span class="stat__value">${summary.critical_defects_addressed_pct}%</span>
    </div>
  `;
}

function renderUnscheduled(tasks) {
  const el = document.getElementById('unscheduledList');
  if (!tasks.length) {
    el.innerHTML = `<li class="task-item"><span class="task-item__dept">Nothing pending</span></li>`;
    return;
  }
  el.innerHTML = tasks.map(t => `
    <li class="task-item">
      <div class="task-item__top">
        <span class="task-item__section">${t.section}</span>
        <span class="task-item__score">${t.criticality_score}</span>
      </div>
      <span class="task-item__dept">${t.department}</span>
    </li>
  `).join('');
}

function renderTimeline(blocks) {
  // Group blocks by section -> one row per section
  const sections = [...new Set(blocks.map(b => b.section))];

  // Compute the overall time range so bars can be positioned proportionally
  const starts = blocks.map(b => new Date(b.start_time).getTime());
  const ends = blocks.map(b => new Date(b.end_time).getTime());
  const rangeStart = Math.min(...starts);
  const rangeEnd = Math.max(...ends);
  const totalRange = rangeEnd - rangeStart;

  // --- Axis ---
  const axisEl = document.getElementById('timelineAxis');
  const dayCount = currentView === 'week' ? 7 : 30;
  const dayMs = 24 * 60 * 60 * 1000;
  const axisTicks = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(rangeStart + i * dayMs);
    axisTicks.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
  }
  axisEl.innerHTML = axisTicks.map(label => `<div class="timeline-axis__tick">${label}</div>`).join('');

  // --- Rows ---
  const timelineEl = document.getElementById('timeline');
  timelineEl.innerHTML = sections.map(section => {
    const rowBlocks = blocks.filter(b => b.section === section);
    const barsHtml = rowBlocks.map(b => {
      const startMs = new Date(b.start_time).getTime();
      const endMs = new Date(b.end_time).getTime();
      const leftPct = ((startMs - rangeStart) / totalRange) * 100;
      const widthPct = ((endMs - startMs) / totalRange) * 100;
      const deptCfg = DEPARTMENTS[b.department] || DEPARTMENTS['Engineering'];
      const isColocated = b.co_located_with && b.co_located_with.length > 0;
      return `
        <div class="block ${deptCfg.className}"
             style="left:${leftPct}%; width:${Math.max(widthPct, 2)}%;"
             data-block-id="${b.id}"
             title="${b.department} · ${section}">
          ${isColocated ? '<span class="block__colocation-badge"></span>' : ''}
          <span>${b.department.split(' ')[0]}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="timeline-row">
        <div class="timeline-row__label">${section}</div>
        <div class="timeline-row__track">${barsHtml}</div>
      </div>
    `;
  }).join('');

  // Wire up click handlers on the bars just rendered
  timelineEl.querySelectorAll('.block').forEach(el => {
    el.addEventListener('click', () => {
      const block = blocks.find(b => b.id === el.dataset.blockId);
      openDrawer(block);
    });
  });
}

function openDrawer(block) {
  const content = document.getElementById('drawerContent');
  const reason = block.reason || { severity: 0, days_overdue: 0, traffic_impact: 0 };
  const maxScore = Math.max(reason.severity, reason.days_overdue, reason.traffic_impact, 1);

  content.innerHTML = `
    <div class="drawer__section">
      <div class="drawer__label">Section</div>
      <div class="drawer__value">${block.section}</div>
    </div>
    <div class="drawer__section">
      <div class="drawer__label">Department</div>
      <div class="drawer__value">${block.department}</div>
    </div>
    <div class="drawer__section">
      <div class="drawer__label">Window</div>
      <div class="drawer__value">
        ${new Date(block.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        →
        ${new Date(block.end_time).toLocaleString('en-IN', { timeStyle: 'short' })}
      </div>
    </div>
    <div class="drawer__section">
      <div class="drawer__label">Criticality score</div>
      <div class="drawer__score">${block.criticality_score}</div>
    </div>
    <div class="drawer__section">
      <div class="drawer__label">Why this schedule</div>
      ${['severity', 'days_overdue', 'traffic_impact'].map(key => `
        <div class="score-bar-row">
          <span class="score-bar-row__label">${key.replace('_', ' ')}</span>
          <span class="score-bar-track">
            <span class="score-bar-fill" style="width:${(reason[key] / maxScore) * 100}%"></span>
          </span>
          <span class="score-bar-row__num">${reason[key]}</span>
        </div>
      `).join('')}
    </div>
    ${block.co_located_with && block.co_located_with.length ? `
      <div class="drawer__section">
        <div class="drawer__label">Sharing this window with</div>
        <div class="drawer__value">${block.co_located_with.join(', ')}</div>
      </div>
    ` : ''}
  `;

  document.getElementById('drawer').classList.add('is-open');
  document.getElementById('drawerOverlay').classList.add('is-open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('is-open');
  document.getElementById('drawerOverlay').classList.remove('is-open');
}

/* ---------- 4. EVENT HANDLERS --------------------------------*/

function wireViewToggle() {
  document.querySelectorAll('.view-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentView = btn.dataset.view;
      renderTimeline(scheduleData.blocks);
    });
  });
}

function wireDrawerClose() {
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
}

/* ---------- 5. INIT --------------------------------------------*/

async function init() {
  scheduleData = await getScheduleData();
  renderLegend();
  renderSummary(scheduleData.summary);
  renderUnscheduled(scheduleData.unscheduled_tasks);
  renderTimeline(scheduleData.blocks);
  wireViewToggle();
  wireDrawerClose();
}

init();
