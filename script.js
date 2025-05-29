const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";
let chart1, chart2, refreshTimer;
let chartData = { threats: [], remediations: [], blocked_ips: [] };

document.addEventListener("DOMContentLoaded", () => {
  fetchData();
  document.getElementById("dateRange").addEventListener("change", fetchData);
  document.getElementById("threatFilter").addEventListener("input", updateCharts);
  document.getElementById("autoRefresh").addEventListener("change", toggleAutoRefresh);
  toggleAutoRefresh();
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(`btn-${tab}`).classList.add("active");
  updateCharts();
}

function toggleAutoRefresh() {
  clearInterval(refreshTimer);
  if (document.getElementById("autoRefresh").checked) {
    refreshTimer = setInterval(fetchData, 60000);
  }
}

function fetchData() {
  const days = document.getElementById("dateRange").value;
  fetch(`${apiUrl}?days=${days}`)
    .then(res => res.json())
    .then(data => {
      chartData = data;
      updateCharts();
    })
    .catch(err => console.error("Failed to fetch data:", err));
}

function updateCharts() {
  const ctx1 = document.getElementById("chart1").getContext("2d");
  const ctx2 = document.getElementById("chart2").getContext("2d");
  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();

  const filter = document.getElementById("threatFilter").value.toLowerCase();
  const threats = chartData.threats.filter(t => JSON.stringify(t).toLowerCase().includes(filter));
  const remediations = chartData.remediations;
  const blockedIPs = chartData.blocked_ips;

  if (currentTab === "incident") {
    const severityMap = {};
    remediations.forEach(r => {
      const sev = r.severity || "Unknown";
      const type = r.sns_sent ? "Manual" : "Automated";
      if (!severityMap[sev]) severityMap[sev] = { Automated: 0, Manual: 0 };
      severityMap[sev][type]++;
    });

    const severities = Object.keys(severityMap);
    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: severities,
        datasets: [
          {
            label: "Automated",
            data: severities.map(s => severityMap[s].Automated),
            backgroundColor: "green"
          },
          {
            label: "Manual",
            data: severities.map(s => severityMap[s].Manual),
            backgroundColor: "orange"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Findings by Severity & Review Type" },
        },
        scales: { x: { stacked: false }, y: { beginAtZero: true } }
      }
    });

    const completed = remediations.filter(r => r.action_status === "completed").length;
    const total = remediations.length;
    chart2 = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Success", "Remaining"],
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: ["green", "#ccc"]
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Remediation Success Rate" },
          legend: { position: "top" }
        },
        cutout: "70%",
        responsive: true
      }
    });

  } else if (currentTab === "performance") {
    const countMap = {};
    remediations.forEach(r => {
      const type = r.finding_type || "Unknown";
      countMap[type] = (countMap[type] || 0) + 1;
    });

    const labels = Object.keys(countMap);
    const values = Object.values(countMap);
    const colors = labels.map((_, i) => `hsl(${i * 40}, 70%, 55%)`);

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Top Finding Types",
          data: values,
          backgroundColor: colors
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Top GuardDuty Finding Types Acted Upon" }
        },
        responsive: true,
        indexAxis: "x"
      }
    });

    const latencyMap = {};
    remediations.forEach(r => {
      const f = r.finding_type || "Unknown";
      if (!latencyMap[f]) latencyMap[f] = [];
      if (!isNaN(r.latency_seconds)) latencyMap[f].push(parseFloat(r.latency_seconds));
    });

    const mttrLabels = Object.keys(latencyMap);
    const mttrValues = mttrLabels.map(k => {
      const total = latencyMap[k].reduce((a, b) => a + b, 0);
      return (total / latencyMap[k].length).toFixed(2);
    });

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: mttrLabels,
        datasets: [{
          label: "Avg Response Time (s)",
          data: mttrValues,
          borderColor: "orange",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Mean Time to Automated Response (MTTR)" }
        }
      }
    });

  } else if (currentTab === "health") {
    const sevDist = {};
    remediations.forEach(r => {
      const sev = r.severity || "Unknown";
      sevDist[sev] = (sevDist[sev] || 0) + 1;
    });

    const sevLabels = Object.keys(sevDist);
    const sevValues = Object.values(sevDist);
    const sevColors = sevLabels.map((_, i) => `hsl(${i * 40}, 70%, 55%)`);

    chart1 = new Chart(ctx1, {
      type: "pie",
      data: {
        labels: sevLabels.map((s, i) => `${s} (${sevValues[i]}, ${(sevValues[i] / sevValues.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)`),
        datasets: [{
          data: sevValues,
          backgroundColor: sevColors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Severity Distribution (%)" },
          legend: { position: "right" }
        }
      }
    });

    const reviewMap = {};
    remediations.forEach(r => {
      if (!r.sns_sent) return;
      const d = (r.time_occurred || '').split("T")[0];
      reviewMap[d] = (reviewMap[d] || 0) + 1;
    });

    const dates = Object.keys(reviewMap);
    const counts = Object.values(reviewMap);

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: dates,
        datasets: [{
          label: "SNS Manual Reviews",
          data: counts,
          borderColor: "red",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Manual Reviews Over Time (SNS Sent)" }
        }
      }
    });
  }
}

function downloadCSV(type) {
  const data = chartData[type];
  if (!data || data.length === 0) return alert("No data to download.");

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(","))
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${type}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
