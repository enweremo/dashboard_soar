const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";
let chart1, chart2;
let autoRefreshId;

document.addEventListener("DOMContentLoaded", () => {
  fetchAndRenderCharts();
  document.getElementById("dateRange").addEventListener("change", fetchAndRenderCharts);
  document.getElementById("threatFilter").addEventListener("input", fetchAndRenderCharts);
  document.getElementById("autoRefresh").addEventListener("change", toggleAutoRefresh);

  toggleAutoRefresh();
});

function toggleAutoRefresh() {
  clearInterval(autoRefreshId);
  if (document.getElementById("autoRefresh").checked) {
    autoRefreshId = setInterval(fetchAndRenderCharts, 60000);
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(`btn-${tab}`).classList.add("active");
  fetchAndRenderCharts();
}

function fetchAndRenderCharts() {
  const days = document.getElementById("dateRange").value;
  const filter = document.getElementById("threatFilter").value.toLowerCase();
  fetch(`${apiUrl}?days=${days}`)
    .then(res => res.json())
    .then(data => renderCharts(data, filter))
    .catch(err => console.error("Data fetch failed:", err));
}

function renderCharts(data, filter) {
  const ctx1 = document.getElementById("chart1").getContext("2d");
  const ctx2 = document.getElementById("chart2").getContext("2d");
  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();

  const threats = data.threats || [];
  const remediations = data.remediations || [];

  if (currentTab === "incident") {
    // Chart 1: Stacked Bar - Severity & Automation
    const severityGroups = {};
    remediations.forEach(r => {
      if (!r.severity) return;
      const sev = r.severity;
      const type = r.sns_sent ? "Manual" : "Automated";
      severityGroups[sev] = severityGroups[sev] || { Automated: 0, Manual: 0 };
      severityGroups[sev][type]++;
    });

    const severities = Object.keys(severityGroups);
    chart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: severities,
        datasets: [
          {
            label: 'Automated',
            data: severities.map(s => severityGroups[s].Automated),
            backgroundColor: 'green'
          },
          {
            label: 'Manual',
            data: severities.map(s => severityGroups[s].Manual),
            backgroundColor: 'gold'
          }
        ]
      },
      options: {
        plugins: { title: { display: true, text: 'Findings by Severity & Automation Status' } },
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });

    // Chart 2: Gauge (Doughnut) - Remediation Success
    const total = remediations.length;
    const completed = remediations.filter(r => r.action_status === "completed").length;

    chart2 = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Success', 'Remaining'],
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: ['green', '#ccc']
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: 'Remediation Success Rate' },
          legend: { position: 'top' }
        },
        cutout: '70%'
      }
    });

  } else if (currentTab === "performance") {
    // Chart 1: Horizontal Bar - Top Findings
    const countByFinding = {};
    remediations.forEach(r => {
      const f = r.finding_type || 'Unknown';
      countByFinding[f] = (countByFinding[f] || 0) + 1;
    });
    const findings = Object.keys(countByFinding);
    const counts = Object.values(countByFinding);

    chart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: findings,
        datasets: [{
          label: 'Top Finding Types',
          data: counts,
          backgroundColor: '#3ec1d3'
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { title: { display: true, text: 'Top GuardDuty Finding Types Acted Upon' } },
        responsive: true
      }
    });

    // Chart 2: Line - Mean Time to Respond
    const latencyData = {};
    remediations.forEach(r => {
      if (!r.latency_seconds || isNaN(r.latency_seconds)) return;
      const f = r.finding_type || "Unknown";
      latencyData[f] = latencyData[f] || [];
      latencyData[f].push(parseFloat(r.latency_seconds));
    });

    const labels = Object.keys(latencyData);
    const averages = labels.map(k => {
      const total = latencyData[k].reduce((a, b) => a + b, 0);
      return (total / latencyData[k].length).toFixed(2);
    });

    chart2 = new Chart(ctx2, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Avg Response Time (s)',
          data: averages,
          borderColor: 'orange',
          backgroundColor: 'transparent',
          tension: 0.2
        }]
      },
      options: {
        plugins: { title: { display: true, text: 'Mean Time to Automated Response (MTTR)' } },
        responsive: true
      }
    });

  } else if (currentTab === "health") {
    // Chart 1: Bar - Auto vs Manual Daily
    const dateMap = {};
    remediations.forEach(r => {
      const day = (r.time_occurred || '').split("T")[0] || "unknown";
      dateMap[day] = dateMap[day] || { auto: 0, manual: 0 };
      if (r.sns_sent) dateMap[day].manual++;
      else dateMap[day].auto++;
    });

    const dates = Object.keys(dateMap);
    chart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: "Automated",
            data: dates.map(d => dateMap[d].auto),
            backgroundColor: "green"
          },
          {
            label: "Manual",
            data: dates.map(d => dateMap[d].manual),
            backgroundColor: "orange"
          }
        ]
      },
      options: {
        plugins: { title: { display: true, text: 'Daily Auto vs Manual Remediation Volume' } },
        responsive: true
      }
    });

    // Chart 2: Line - Manual Reviews
    const reviewMap = {};
    remediations.forEach(r => {
      if (!r.sns_sent) return;
      const d = (r.time_occurred || '').split("T")[0];
      reviewMap[d] = (reviewMap[d] || 0) + 1;
    });

    const rLabels = Object.keys(reviewMap);
    const rCounts = Object.values(reviewMap);

    chart2 = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: rLabels,
        datasets: [{
          label: 'SNS Reviews',
          data: rCounts,
          borderColor: 'red',
          tension: 0.2,
          backgroundColor: 'transparent'
        }]
      },
      options: {
        plugins: { title: { display: true, text: 'Manual Review Volume (SNS Notifications)' } },
        responsive: true
      }
    });
  }
}
