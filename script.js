const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";
let chart1, chart2, refreshInterval;
let fullData = { ThreatMetadata: [], RemediationLog: [] };

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dateRange").addEventListener("change", fetchData);
  document.getElementById("threatFilter").addEventListener("input", renderCharts);
  document.getElementById("autoRefresh").addEventListener("change", toggleAutoRefresh);
  document.getElementById("downloadThreats").addEventListener("click", () => downloadCSV(fullData.ThreatMetadata, "ThreatMetadata"));
  document.getElementById("downloadRemediations").addEventListener("click", () => downloadCSV(fullData.RemediationLog, "RemediationLog"));

  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.addEventListener("click", e => switchTab(e.target.getAttribute("data-tab")))
  );

  fetchData();
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add("active");
  renderCharts();
}

function toggleAutoRefresh() {
  clearInterval(refreshInterval);
  if (document.getElementById("autoRefresh").checked) {
    refreshInterval = setInterval(fetchData, 60000);
  }
}

function fetchData() {
  const days = document.getElementById("dateRange").value;
  fetch(`${apiUrl}?days=${days}`)
    .then(res => res.json())
    .then(data => {
      fullData = data;
      renderCharts();
    })
    .catch(console.error);
}

function renderCharts() {
  const filter = document.getElementById("threatFilter").value.toLowerCase();

  const threats = fullData.ThreatMetadata.filter(item =>
    JSON.stringify(item).toLowerCase().includes(filter)
  );
  const remediations = fullData.RemediationLog.filter(item =>
    JSON.stringify(item).toLowerCase().includes(filter)
  );

  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();

  const ctx1 = document.getElementById("barChart").getContext("2d");
  const ctx2 = document.getElementById("pieChart").getContext("2d");

  if (currentTab === "incident") {
    // Chart 1: Stacked Bar - Severity & Automation
    const severityGroups = { Low: {}, Medium: {}, High: {}, Critical: {} };
    remediations.forEach(item => {
      const sev = item.severity || "Unknown";
      const auto = item.review_required === false ? "Automated" : "Manual";
      severityGroups[sev] = severityGroups[sev] || {};
      severityGroups[sev][auto] = (severityGroups[sev][auto] || 0) + 1;
    });

    const labels = Object.keys(severityGroups);
    const autoData = labels.map(s => severityGroups[s].Automated || 0);
    const manualData = labels.map(s => severityGroups[s].Manual || 0);

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Automated", data: autoData, backgroundColor: "green" },
          { label: "Manual", data: manualData, backgroundColor: "gold" }
        ]
      },
      options: {
        plugins: { title: { display: true, text: "Findings by Severity & Automation" } },
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });

    // Chart 2: Gauge-like Doughnut - Success Rate
    const success = remediations.filter(i => i.action_status === "completed").length;
    const total = remediations.length;
    const remaining = total - success;

    chart2 = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Success", "Remaining"],
        datasets: [{
          data: [success, remaining],
          backgroundColor: ["green", "#ddd"]
        }]
      },
      options: {
        plugins: { title: { display: true, text: "Remediation Success Rate" } },
        cutout: "80%",
        circumference: 180,
        rotation: 270
      }
    });

  } else if (currentTab === "performance") {
    // Chart 1: Top GuardDuty Findings
    const typeCounts = {};
    threats.forEach(item => {
      const type = item.finding_type || "Unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const labels = Object.keys(typeCounts);
    const values = Object.values(typeCounts);
    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Count", data: values, backgroundColor: "deepskyblue" }]
      },
      options: {
        plugins: { title: { display: true, text: "Top GuardDuty Finding Types" } },
        responsive: true
      }
    });

    // Chart 2: Mean Response Time
    const group = {};
    remediations.forEach(r => {
      const day = r.timestamp?.substring(0, 10);
      group[day] = group[day] || [];
      group[day].push(Number(r.latency_seconds || 0));
    });

    const timeLabels = Object.keys(group).sort();
    const avgTimes = timeLabels.map(d => {
      const vals = group[d];
      return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
    });

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: timeLabels,
        datasets: [{ label: "Avg Response Time (s)", data: avgTimes, borderColor: "orange", tension: 0.3 }]
      },
      options: {
        plugins: { title: { display: true, text: "Mean Time to Response" } },
        responsive: true
      }
    });

  } else if (currentTab === "health") {
    // Chart 1: Daily Auto vs Manual Volume
    const volume = {};
    remediations.forEach(r => {
      const d = r.timestamp?.substring(0, 10);
      const key = r.review_required === false ? "auto" : "manual";
      volume[d] = volume[d] || { auto: 0, manual: 0 };
      volume[d][key]++;
    });
    const dates = Object.keys(volume).sort();
    const autoVals = dates.map(d => volume[d].auto);
    const manualVals = dates.map(d => volume[d].manual);

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: dates,
        datasets: [
          { label: "Automated", data: autoVals, backgroundColor: "green" },
          { label: "Manual", data: manualVals, backgroundColor: "gold" }
        ]
      },
      options: {
        plugins: { title: { display: true, text: "Auto vs Manual Remediation Volume" } },
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });

    // Chart 2: Manual Review (SNS)
    const snsCount = {};
    remediations.filter(r => r.review_required).forEach(r => {
      const day = r.timestamp?.substring(0, 10);
      snsCount[day] = (snsCount[day] || 0) + 1;
    });

    const snsLabels = Object.keys(snsCount).sort();
    const snsVals = snsLabels.map(l => snsCount[l]);

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: snsLabels,
        datasets: [{ label: "SNS Reviews", data: snsVals, borderColor: "red", fill: false }]
      },
      options: {
        plugins: { title: { display: true, text: "Manual Review Volume (SNS)" } },
        responsive: true
      }
    });
  }
}

function downloadCSV(rows, name) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(row => headers.map(h => `"${row[h] ?? ""}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${Date.now()}.csv`;
  a.click();
}
