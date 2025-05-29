const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";
let charts = {};
let rawData = { threats: [], remediations: [], blocked_ips: [] };
let refreshInterval = null;

document.getElementById("daysSelect").addEventListener("change", fetchData);
document.getElementById("autoRefresh").addEventListener("change", () => {
  if (document.getElementById("autoRefresh").checked) {
    refreshInterval = setInterval(fetchData, 60000);
  } else {
    clearInterval(refreshInterval);
  }
});
fetchData();

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  event.target.classList.add("active");
  renderCharts();
}

function fetchData() {
  const days = document.getElementById("daysSelect").value;
  fetch(`${apiUrl}?days=${days}`)
    .then(res => res.json())
    .then(data => {
      rawData = data;
      renderCharts();
    })
    .catch(err => console.error("Data fetch failed", err));
}

function renderCharts() {
  destroyCharts();
  if (currentTab === "incident") {
    drawSeverityAutomationChart();
    drawRemediationGauge();
  } else if (currentTab === "performance") {
    drawTopFindingsChart();
    drawMTTRChart();
  } else if (currentTab === "health") {
    drawRemediationVolumeBar();
    drawSNSLineChart();
  }
}

function destroyCharts() {
  Object.values(charts).forEach(chart => chart.destroy());
  charts = {};
}

function drawSeverityAutomationChart() {
  const ctx = document.getElementById("barChart").getContext("2d");
  const severityBuckets = { Low: [0, 0], Medium: [0, 0], High: [0, 0], Critical: [0, 0] };

  rawData.remediations.forEach(item => {
    const sev = (item.severity || "Unknown").toString().charAt(0).toUpperCase() + item.severity.slice(1).toLowerCase();
    if (severityBuckets[sev]) {
      const idx = item.sns_sent ? 0 : 1;
      severityBuckets[sev][idx]++;
    }
  });

  charts.severity = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(severityBuckets),
      datasets: [
        {
          label: "Automated",
          backgroundColor: "green",
          data: Object.values(severityBuckets).map(x => x[0])
        },
        {
          label: "Manual",
          backgroundColor: "gold",
          data: Object.values(severityBuckets).map(x => x[1])
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "Findings by Severity & Automation" } },
      responsive: true
    }
  });
}

function drawRemediationGauge() {
  const ctx = document.getElementById("pieChart").getContext("2d");
  const success = rawData.remediations.filter(r => r.action_status === "completed").length;
  const total = rawData.remediations.length;
  const remaining = total - success;

  charts.gauge = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Success", "Remaining"],
      datasets: [{
        data: [success, remaining],
        backgroundColor: ["green", "lightgray"]
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Remediation Success Rate" },
        legend: { position: "top" }
      }
    }
  });
}

function drawTopFindingsChart() {
  const ctx = document.getElementById("barChart").getContext("2d");
  const counts = {};

  rawData.remediations.forEach(item => {
    const type = item.finding_type || "Unknown";
    counts[type] = (counts[type] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);

  charts.topFindings = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Top Finding Types",
        data: values,
        backgroundColor: "#29b6f6"
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Top GuardDuty Finding Types Acted Upon" }
      }
    }
  });
}

function drawMTTRChart() {
  const ctx = document.getElementById("pieChart").getContext("2d");
  const times = {};

  rawData.remediations.forEach(item => {
    const type = item.finding_type || "Unknown";
    const latency = parseFloat(item.latency_seconds) || 0;
    if (!times[type]) times[type] = [];
    times[type].push(latency);
  });

  const labels = Object.keys(times);
  const values = labels.map(label =>
    (times[label].reduce((a, b) => a + b, 0) / times[label].length).toFixed(1)
  );

  charts.mttr = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Avg Response Time (s)",
        data: values,
        borderColor: "orange",
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Mean Time to Automated Response (MTTR)" }
      }
    }
  });
}

function drawRemediationVolumeBar() {
  const ctx = document.getElementById("barChart").getContext("2d");
  const daily = {};

  rawData.remediations.forEach(item => {
    const date = item.time_detected?.split("T")[0] || "unknown";
    const key = item.sns_sent ? "auto" : "manual";
    if (!daily[date]) daily[date] = { auto: 0, manual: 0 };
    daily[date][key]++;
  });

  const dates = Object.keys(daily);
  const auto = dates.map(d => daily[d].auto);
  const manual = dates.map(d => daily[d].manual);

  charts.volume = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dates,
      datasets: [
        { label: "Automated", backgroundColor: "green", data: auto },
        { label: "Manual", backgroundColor: "orange", data: manual }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: "Daily Auto vs Manual Remediation Volume" }
      }
    }
  });
}

function drawSNSLineChart() {
  const ctx = document.getElementById("pieChart").getContext("2d");
  const daily = {};

  rawData.remediations.forEach(item => {
    const date = item.time_detected?.split("T")[0] || "unknown";
    if (!daily[date]) daily[date] = 0;
    if (item.review_required) daily[date]++;
  });

  const dates = Object.keys(daily);
  const values = dates.map(d => daily[d]);

  charts.sns = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "SNS Reviews",
        data: values,
        borderColor: "red",
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Manual Review Volume (SNS Notifications)" }
      }
    }
  });
}

function downloadCSV() {
  const tab = currentTab;
  const rows = tab === "incident" || tab === "performance" || tab === "health"
    ? rawData.remediations
    : rawData.threats;

  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(",")]
    .concat(rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(",")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${tab}_${Date.now()}.csv`;
  a.click();
}
