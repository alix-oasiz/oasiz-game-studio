const METRICS = [
  { key: "opsClients", label: "ops.clients", unit: "clients" },
  { key: "opsRooms", label: "ops.rooms", unit: "rooms" },
  { key: "opsLeftUnconsented", label: "ops.leftUnconsented", unit: "count" },
  { key: "pm2MemMb", label: "pm2.memMB", unit: "MB" },
  { key: "pm2CpuPct", label: "pm2.cpuPct", unit: "%" },
  { key: "pm2Restarts", label: "pm2.restarts", unit: "count" },
  { key: "hostMemUsedPct", label: "host.memUsedPct", unit: "%" },
  { key: "hostLoad1", label: "host.load1", unit: "load" },
  { key: "netRxBps", label: "net.rxBps", unit: "Bps" },
  { key: "netTxBps", label: "net.txBps", unit: "Bps" },
];

const INCIDENT_MARKER_TYPES = new Set([
  "leave1006_burst",
  "process_boot",
  "crash_signal",
  "mass_drop",
  "unconsented_jump",
  "restart_event",
]);

const RUN_COLORS = [
  "#59c4ff",
  "#ff8f59",
  "#8fff7a",
  "#f3bf4e",
  "#d88bff",
  "#ff6a6a",
  "#5de2be",
  "#9fb0ff",
];

const state = {
  indexData: null,
  selectedRunIds: new Set(),
  parsedCache: new Map(),
  hoverTsMs: null,
  chartSession: null,
};

const CHART_LAYOUT = {
  left: 52,
  right: 10,
  top: 10,
  bottom: 28,
};

function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return Math.round(value).toString();
}

function formatCompactNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(2) + "M";
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatIsoShort(iso) {
  if (!iso) return "n/a";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toISOString().replace(".000Z", "Z");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch " + url + " (" + response.status + ")");
  }
  return await response.json();
}

function findIndexEntry(runId) {
  const runs = Array.isArray(state.indexData?.runs) ? state.indexData.runs : [];
  return runs.find((run) => run.runId === runId) ?? null;
}

function colorForRun(runId) {
  const runs = Array.isArray(state.indexData?.runs) ? state.indexData.runs : [];
  const index = runs.findIndex((run) => run.runId === runId);
  if (index < 0) return RUN_COLORS[0];
  return RUN_COLORS[index % RUN_COLORS.length];
}

function buildRunLabel(run) {
  const start = run.startedAtIso ? formatIsoShort(run.startedAtIso) : "n/a";
  const runner = run.runner ?? "unknown";
  const joined = formatCount(run.summary?.joined);
  const expected = formatCount(run.summary?.expected);
  return (
    "runner=" +
    runner +
    " start=" +
    start +
    " joined=" +
    joined +
    "/" +
    expected
  );
}

function renderRunList() {
  const container = document.getElementById("run-list");
  const meta = document.getElementById("index-meta");
  container.innerHTML = "";

  const runs = Array.isArray(state.indexData?.runs) ? state.indexData.runs : [];
  meta.textContent =
    "index generated " +
    formatIsoShort(state.indexData?.generatedAtIso ?? null) +
    " | " +
    runs.length.toString() +
    " run(s)";

  if (runs.length <= 0) {
    container.innerHTML = "<div class='subtle'>No runs indexed yet.</div>";
    return;
  }

  for (const run of runs) {
    const wrapper = document.createElement("label");
    wrapper.className = "run-item";

    const checked = state.selectedRunIds.has(run.runId);
    const checkedAttr = checked ? "checked" : "";
    const joined = formatCount(run.summary?.joined);
    const expected = formatCount(run.summary?.expected);
    const failed = formatCount(run.summary?.failedJoins);
    const peakClients = formatCount(run.summary?.peakOpsClients);
    const unconsentedDelta = formatCount(run.summary?.opsLeftUnconsentedDelta);
    const abnormalDisconnects = formatCount(
      run.summary?.abnormalDisconnects ?? run.summary?.serverDisconnects,
    );
    const consentedLeaves = formatCount(run.summary?.consentedLeaves);
    const pm2Status =
      typeof run.summary?.peakPm2MemMb === "number" ? "ok" : "missing";

    wrapper.innerHTML =
      "<div class='run-head'>" +
      "<input type='checkbox' data-run-id='" +
      run.runId +
      "' " +
      checkedAttr +
      " />" +
      "<span class='run-id'>" +
      run.runId +
      "</span>" +
      "</div>" +
      "<div class='run-meta'>" +
      buildRunLabel(run) +
      "<br/>" +
      "failedJoins=" +
      failed +
      " peakClients=" +
      peakClients +
      " unconsentedDelta=" +
      unconsentedDelta +
      " disconnectsTotal=" +
      formatCount(run.summary?.disconnected) +
      " abnormal1005/1006=" +
      abnormalDisconnects +
      " consented4000=" +
      consentedLeaves +
      "<br/>" +
      "pm2=" +
      pm2Status +
      " " +
      "joined=" +
      joined +
      "/" +
      expected +
      "</div>";
    container.appendChild(wrapper);
  }

  for (const input of container.querySelectorAll("input[type='checkbox']")) {
    input.addEventListener("change", (event) => {
      const target = event.currentTarget;
      const runId = target?.getAttribute("data-run-id");
      if (!runId) return;
      if (target.checked) {
        state.selectedRunIds.add(runId);
      } else {
        state.selectedRunIds.delete(runId);
      }
      void refreshDashboard();
    });
  }
}

async function loadParsedForRun(runId) {
  if (state.parsedCache.has(runId)) {
    return state.parsedCache.get(runId);
  }
  const run = findIndexEntry(runId);
  if (!run || typeof run.parsedEventsPath !== "string") {
    throw new Error("Missing parsedEventsPath for run " + runId);
  }
  const payload = await fetchJson("../" + run.parsedEventsPath + "?t=" + Date.now());
  state.parsedCache.set(runId, payload);
  return payload;
}

function getSelectedRunIdsInOrder() {
  const runs = Array.isArray(state.indexData?.runs) ? state.indexData.runs : [];
  return runs
    .map((run) => run.runId)
    .filter((runId) => state.selectedRunIds.has(runId));
}

function renderLegend(selectedRunIds) {
  const container = document.getElementById("legend");
  container.innerHTML = "";
  for (const runId of selectedRunIds) {
    const run = findIndexEntry(runId);
    if (!run) continue;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML =
      "<span class='legend-color' style='background:" +
      colorForRun(runId) +
      "'></span>" +
      "<span>" +
      runId +
      " (" +
      (run.runner ?? "unknown") +
      ")</span>";
    container.appendChild(item);
  }
}

function renderComparisonTable(selectedRunIds) {
  const container = document.getElementById("comparison");
  if (selectedRunIds.length <= 0) {
    container.innerHTML = "<div class='subtle'>Select one or more runs.</div>";
    return;
  }

  let html =
    "<table class='compare-table'>" +
    "<thead><tr>" +
    "<th>Run</th><th>Start</th><th>Clients</th><th>Failed</th><th>Total Disconnects</th><th>Abnormal (1005/1006)</th><th>Consented (4000)</th><th>Peak Clients</th><th>Unconsented Delta</th><th>PM2 Status</th><th>PM2 Restarts</th>" +
    "</tr></thead><tbody>";

  for (const runId of selectedRunIds) {
    const run = findIndexEntry(runId);
    if (!run) continue;
    const clientsText =
      formatCount(run.summary?.joined) + "/" + formatCount(run.summary?.expected);
    const abnormalDisconnects = formatCount(
      run.summary?.abnormalDisconnects ?? run.summary?.serverDisconnects,
    );
    const consentedLeaves = formatCount(run.summary?.consentedLeaves);
    const pm2Status =
      typeof run.summary?.peakPm2MemMb === "number" ? "ok" : "missing";
    html +=
      "<tr>" +
      "<td>" +
      runId +
      "</td>" +
      "<td>" +
      formatIsoShort(run.startedAtIso) +
      "</td>" +
      "<td>" +
      clientsText +
      "</td>" +
      "<td>" +
      formatCount(run.summary?.failedJoins) +
      "</td>" +
      "<td>" +
      formatCount(run.summary?.disconnected) +
      "</td>" +
      "<td>" +
      abnormalDisconnects +
      "</td>" +
      "<td>" +
      consentedLeaves +
      "</td>" +
      "<td>" +
      formatCount(run.summary?.peakOpsClients) +
      "</td>" +
      "<td>" +
      formatCount(run.summary?.opsLeftUnconsentedDelta) +
      "</td>" +
      "<td>" +
      pm2Status +
      "</td>" +
      "<td>" +
      formatCount(run.summary?.peakPm2Restarts) +
      "</td>" +
      "</tr>";
  }

  html += "</tbody></table>";
  container.innerHTML = html;
}

function parseSampleTime(sample) {
  if (!sample || typeof sample.tsIso !== "string") return null;
  const parsed = Date.parse(sample.tsIso);
  return Number.isFinite(parsed) ? parsed : null;
}

function findNearestPoint(series, targetTs) {
  if (!Array.isArray(series) || series.length <= 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((series[mid]?.ts ?? 0) < targetTs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const current = series[lo] ?? null;
  const previous = lo > 0 ? (series[lo - 1] ?? null) : null;
  if (!current) return previous;
  if (!previous) return current;
  return Math.abs(current.ts - targetTs) < Math.abs(previous.ts - targetTs)
    ? current
    : previous;
}

function collectTimeRange(parsedRuns) {
  let min = null;
  let max = null;
  for (const parsed of parsedRuns) {
    const samples = Array.isArray(parsed?.timelines?.metrics)
      ? parsed.timelines.metrics
      : [];
    for (const sample of samples) {
      const ts = parseSampleTime(sample);
      if (ts === null) continue;
      if (min === null || ts < min) min = ts;
      if (max === null || ts > max) max = ts;
    }
  }
  return { min, max };
}

function drawMetricChart(
  canvas,
  metric,
  selectedRunIds,
  parsedRuns,
  minTime,
  maxTime,
  hoverTsMs,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(400, Math.floor(canvas.clientWidth));
  const height = Math.max(140, Math.floor(canvas.clientHeight));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = CHART_LAYOUT.left;
  const right = CHART_LAYOUT.right;
  const top = CHART_LAYOUT.top;
  const bottom = CHART_LAYOUT.bottom;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const seriesByRun = [];
  let minValue = null;
  let maxValue = null;
  for (let i = 0; i < selectedRunIds.length; i += 1) {
    const runId = selectedRunIds[i];
    const parsed = parsedRuns[i];
    const samples = Array.isArray(parsed?.timelines?.metrics)
      ? parsed.timelines.metrics
      : [];
    const series = [];
    for (const sample of samples) {
      const ts = parseSampleTime(sample);
      const value = sample?.[metric.key];
      if (ts === null) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      series.push({ ts, value });
      if (minValue === null || value < minValue) minValue = value;
      if (maxValue === null || value > maxValue) maxValue = value;
    }
    seriesByRun.push(series);
  }

  if (minValue === null || maxValue === null || minTime === null || maxTime === null) {
    ctx.fillStyle = "#9badc9";
    ctx.font = "12px Segoe UI";
    if (metric.key.startsWith("pm2")) {
      ctx.fillText("No PM2 samples (missing PM2 app context)", left, top + 16);
    } else {
      ctx.fillText("No samples available", left, top + 16);
    }
    return;
  }

  if (Math.abs(maxValue - minValue) < 0.0001) {
    minValue -= 1;
    maxValue += 1;
  }
  if (minTime === maxTime) {
    maxTime += 1000;
  }

  ctx.strokeStyle = "#2b3950";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + chartWidth, y);
    ctx.stroke();
  }

  for (let i = 0; i <= 6; i += 1) {
    const x = left + (chartWidth * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + chartHeight);
    ctx.stroke();
  }

  const xForTs = (ts) => left + ((ts - minTime) / (maxTime - minTime)) * chartWidth;
  const yForValue = (value) =>
    top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  for (let i = 0; i < selectedRunIds.length; i += 1) {
    const runId = selectedRunIds[i];
    const parsed = parsedRuns[i];
    const color = colorForRun(runId);
    const incidents = Array.isArray(parsed?.incidents) ? parsed.incidents : [];
    ctx.strokeStyle = color + "55";
    ctx.setLineDash([4, 4]);
    for (const incident of incidents) {
      if (!INCIDENT_MARKER_TYPES.has(incident.type)) continue;
      const ts = Date.parse(incident.tsIso ?? "");
      if (!Number.isFinite(ts) || ts < minTime || ts > maxTime) continue;
      const x = xForTs(ts);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + chartHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (let i = 0; i < selectedRunIds.length; i += 1) {
    const runId = selectedRunIds[i];
    const series = seriesByRun[i];
    if (!series || series.length <= 0) continue;
    ctx.strokeStyle = colorForRun(runId);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let pointIndex = 0; pointIndex < series.length; pointIndex += 1) {
      const point = series[pointIndex];
      const x = xForTs(point.ts);
      const y = yForValue(point.value);
      if (pointIndex === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  if (typeof hoverTsMs === "number" && Number.isFinite(hoverTsMs)) {
    const clampedTs = Math.max(minTime, Math.min(maxTime, hoverTsMs));
    const hoverX = xForTs(clampedTs);

    ctx.strokeStyle = "#c7d7f3aa";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hoverX, top);
    ctx.lineTo(hoverX, top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipRows = [
      {
        color: "#d9e7ff",
        text: formatIsoShort(new Date(clampedTs).toISOString()),
      },
    ];

    for (let i = 0; i < selectedRunIds.length; i += 1) {
      const runId = selectedRunIds[i];
      const series = seriesByRun[i];
      const nearest = findNearestPoint(series, clampedTs);
      if (!nearest) continue;
      const px = xForTs(nearest.ts);
      const py = yForValue(nearest.value);

      ctx.fillStyle = colorForRun(runId);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      tooltipRows.push({
        color: colorForRun(runId),
        text:
          runId +
          ": " +
          formatCompactNumber(nearest.value) +
          " " +
          metric.unit,
      });
    }

    if (tooltipRows.length > 0) {
      ctx.font = "11px Segoe UI";
      const rowHeight = 14;
      const padX = 8;
      const padY = 6;
      let maxRowWidth = 0;
      for (const row of tooltipRows) {
        maxRowWidth = Math.max(maxRowWidth, ctx.measureText(row.text).width);
      }
      const boxWidth = maxRowWidth + padX * 2;
      const boxHeight = tooltipRows.length * rowHeight + padY * 2 - 2;
      let boxX = hoverX + 8;
      if (boxX + boxWidth > left + chartWidth) {
        boxX = hoverX - boxWidth - 8;
      }
      if (boxX < left + 4) {
        boxX = left + 4;
      }
      const boxY = top + 6;

      ctx.fillStyle = "#0b1320dd";
      ctx.strokeStyle = "#365074";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxWidth, boxHeight);
      ctx.fill();
      ctx.stroke();

      for (let rowIndex = 0; rowIndex < tooltipRows.length; rowIndex += 1) {
        const row = tooltipRows[rowIndex];
        if (!row) continue;
        ctx.fillStyle = row.color;
        ctx.fillText(
          row.text,
          boxX + padX,
          boxY + padY + 11 + rowIndex * rowHeight,
        );
      }
    }
  }

  ctx.fillStyle = "#9badc9";
  ctx.font = "11px Segoe UI";
  ctx.fillText(formatCompactNumber(maxValue) + " " + metric.unit, 6, top + 10);
  ctx.fillText(
    formatCompactNumber(minValue) + " " + metric.unit,
    6,
    top + chartHeight - 2,
  );
  ctx.fillText(formatIsoShort(new Date(minTime).toISOString()), left, height - 8);
  const endText = formatIsoShort(new Date(maxTime).toISOString());
  const textWidth = ctx.measureText(endText).width;
  ctx.fillText(endText, left + chartWidth - textWidth, height - 8);
}

function renderCharts(selectedRunIds, parsedRuns) {
  const container = document.getElementById("charts");
  container.innerHTML = "";
  state.chartSession = null;
  state.hoverTsMs = null;
  if (selectedRunIds.length <= 0) {
    container.innerHTML = "<div class='subtle'>Select runs to render charts.</div>";
    return;
  }

  const range = collectTimeRange(parsedRuns);
  if (range.min === null || range.max === null) {
    container.innerHTML = "<div class='subtle'>No metric timeline data in selected runs.</div>";
    return;
  }

  const chartEntries = [];

  for (const metric of METRICS) {
    const card = document.createElement("div");
    card.className = "chart-card";
    const title = document.createElement("p");
    title.className = "chart-title";
    title.textContent = metric.label + " (" + metric.unit + ")";
    const canvas = document.createElement("canvas");
    canvas.className = "chart-canvas";
    card.appendChild(title);
    card.appendChild(canvas);
    container.appendChild(card);
    chartEntries.push({ canvas, metric });
  }

  const redrawCharts = () => {
    for (const chart of chartEntries) {
      drawMetricChart(
        chart.canvas,
        chart.metric,
        selectedRunIds,
        parsedRuns,
        range.min,
        range.max,
        state.hoverTsMs,
      );
    }
  };

  for (const chart of chartEntries) {
    chart.canvas.addEventListener("mousemove", (event) => {
      const rect = chart.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = chart.canvas.clientWidth;
      const chartWidth = width - CHART_LAYOUT.left - CHART_LAYOUT.right;
      if (chartWidth <= 0 || range.max <= range.min) return;
      const ratio = (x - CHART_LAYOUT.left) / chartWidth;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      state.hoverTsMs = range.min + clampedRatio * (range.max - range.min);
      redrawCharts();
    });

    chart.canvas.addEventListener("mouseleave", () => {
      state.hoverTsMs = null;
      redrawCharts();
    });
  }

  container.addEventListener("mouseleave", () => {
    if (state.hoverTsMs === null) return;
    state.hoverTsMs = null;
    redrawCharts();
  });

  state.chartSession = {
    selectedRunIds: [...selectedRunIds],
    parsedRuns,
    redrawCharts,
  };

  redrawCharts();
}

function renderIncidents(selectedRunIds, parsedRuns) {
  const container = document.getElementById("incidents");
  container.innerHTML = "";
  if (selectedRunIds.length <= 0) {
    container.innerHTML = "<div class='subtle'>Select runs to view incidents.</div>";
    return;
  }

  const merged = [];
  for (let i = 0; i < selectedRunIds.length; i += 1) {
    const runId = selectedRunIds[i];
    const parsed = parsedRuns[i];
    const incidents = Array.isArray(parsed?.incidents) ? parsed.incidents : [];
    for (const incident of incidents) {
      merged.push({ runId, incident });
    }
  }
  merged.sort((a, b) => {
    const aTs = Date.parse(a.incident.tsIso ?? "");
    const bTs = Date.parse(b.incident.tsIso ?? "");
    if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
    if (!Number.isFinite(aTs)) return 1;
    if (!Number.isFinite(bTs)) return -1;
    return bTs - aTs;
  });

  if (merged.length <= 0) {
    container.innerHTML = "<div class='subtle'>No incidents extracted for selected runs.</div>";
    return;
  }

  for (const item of merged.slice(0, 40)) {
    const runColor = colorForRun(item.runId);
    const severity = item.incident.severity ?? "info";
    const card = document.createElement("div");
    card.className = "incident " + severity;
    card.style.boxShadow = "inset 3px 0 0 " + runColor;
    card.innerHTML =
      "<p class='incident-title'>" +
      item.incident.title +
      "</p>" +
      "<div class='incident-meta'>" +
      item.runId +
      " | " +
      formatIsoShort(item.incident.tsIso) +
      " | " +
      item.incident.type +
      "</div>" +
      "<div class='incident-meta'>" +
      item.incident.details +
      "</div>";
    container.appendChild(card);
  }
}

async function refreshDashboard() {
  renderRunList();
  const selectedRunIds = getSelectedRunIdsInOrder();
  renderLegend(selectedRunIds);
  renderComparisonTable(selectedRunIds);

  if (selectedRunIds.length <= 0) {
    renderCharts([], []);
    renderIncidents([], []);
    return;
  }

  const loadedRunIds = [];
  const parsedRuns = [];
  for (const runId of selectedRunIds) {
    try {
      const parsed = await loadParsedForRun(runId);
      loadedRunIds.push(runId);
      parsedRuns.push(parsed);
    } catch (error) {
      console.error("[ObservedDashboard.refresh]", "Failed to load parsed run", runId, error);
    }
  }

  renderCharts(loadedRunIds, parsedRuns);
  renderIncidents(loadedRunIds, parsedRuns);
}

async function boot() {
  try {
    state.indexData = await fetchJson("../index.json?t=" + Date.now());
    const runs = Array.isArray(state.indexData?.runs) ? state.indexData.runs : [];
    if (runs.length > 0 && state.selectedRunIds.size <= 0) {
      state.selectedRunIds.add(runs[0].runId);
    }
    await refreshDashboard();
  } catch (error) {
    console.error("[ObservedDashboard.boot]", "Failed to initialize dashboard", error);
    const comparison = document.getElementById("comparison");
    comparison.innerHTML =
      "<div class='subtle'>Failed to load index.json. Run <code>npm run observed:index</code> first.</div>";
  }
}

window.addEventListener("resize", () => {
  if (state.chartSession) {
    renderCharts(state.chartSession.selectedRunIds, state.chartSession.parsedRuns);
    return;
  }
  const selectedRunIds = getSelectedRunIdsInOrder();
  const loadedRunIds = [];
  const parsedRuns = [];
  for (const runId of selectedRunIds) {
    const parsed = state.parsedCache.get(runId);
    if (!parsed) continue;
    loadedRunIds.push(runId);
    parsedRuns.push(parsed);
  }
  renderCharts(loadedRunIds, parsedRuns);
});

void boot();
