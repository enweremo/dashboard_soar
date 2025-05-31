const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";
let chart1, chart2, refreshTimer;
let chartData = { threats: [], remediations: [], blocked_ips: [] };

document.addEventListener("DOMContentLoaded", () => {
  fetchData();
  document.getElementById("dateRange").addEventListener("change", fetchData);
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
    .catch(err => console.error("Fetch failed:", err));
}

function categorizeFindingType(type) {
  if (!type || type === "Unknown") return null;
  if (type.includes("SSHBruteForce")) return "SSHBruteForce";
  if (type.includes("PortProbe")) return "PortScanning";
  if (type.includes("AnomalousBehavior")) return "IAMUserAnomalousBehavior";
  if (type.includes("IAMUser/AccessKeyExfiltration")) return "IAMKeyExfiltration";
  if (type.includes("Tor")) return "TorAccess";
  if (type.includes("WebLoginAbuse")) return "WebLoginAbuse";
  if (type.includes("S3/AnonymousUser")) return "S3UnauthorizedAccess";
  if (type.includes("GeoLocation") || type.includes("HighRiskAccess")) return "GeoIPThreat";
  return null;
}

function updateCharts() {
  const canvas1 = document.getElementById("chart1");
  const canvas2 = document.getElementById("chart2");
  const ctx1 = canvas1.getContext("2d");
  const ctx2 = canvas2.getContext("2d");

  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();
  canvas1.className = "";
  canvas2.className = "";

  const remediations = chartData.remediations?.filter(r => r.finding_type !== "Unknown" && r.severity !== "Unknown") || [];

  if (currentTab === "incident") {
    const severities = ["Low", "Medium", "High", "Critical"];
    const autoCounts = [];
    const manualCounts = [];

    severities.forEach(sev => {
      const group = remediations.filter(r => (r.severity || "").toLowerCase() === sev.toLowerCase());
      autoCounts.push(group.filter(r => r.review_required === false).length);
      manualCounts.push(group.filter(r => r.review_required === true).length);
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: severities,
        datasets: [
          { label: "Automated", data: autoCounts, backgroundColor: "green" },
          { label: "Manual Review", data: manualCounts, backgroundColor: "orange" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Findings by Severity & Review Type", font: { weight: "bold", size: 16 } },
          legend: { position: "top" }
        },
        scales: {
          x: {
            title: { display: true, text: "Severity Category", font: { weight: "bold", size: 14 } }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Number of Events", font: { weight: "bold", size: 14 } }
          }
        }
      }
    });

    const total = remediations.length || 1;
    const completed = remediations.filter(r => r.action_status === "completed").length;
    const successRate = ((completed / total) * 100).toFixed(1);
    const remainingRate = (100 - successRate).toFixed(1);

    chart2 = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: [`% Remediation Success Rate = ${successRate}%`, `% Remaining = ${remainingRate}%`],
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: ["green", "#ccc"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Remediation Success Rate", font: { weight: "bold", size: 16 } },
          legend: { position: "top" }
        },
        cutout: "60%"
      }
    });

  } else if (currentTab === "performance") {
    const categories = ["SSHBruteForce", "PortScanning", "IAMUserAnomalousBehavior", "IAMKeyExfiltration", "TorAccess", "WebLoginAbuse", "S3UnauthorizedAccess", "GeoIPThreat"];
    const countMap = {};
    const latencyMap = {};

    categories.forEach(cat => {
      countMap[cat] = 0;
      latencyMap[cat] = [];
    });

    remediations.forEach(r => {
      const mapped = categorizeFindingType(r.finding_type);
      if (!mapped) return;
      countMap[mapped]++;
      if (!isNaN(r.latency_seconds)) latencyMap[mapped].push(parseFloat(r.latency_seconds));
    });

    const values = categories.map(cat => countMap[cat]);
    const avgLatencies = categories.map(cat => {
      const data = latencyMap[cat];
      const total = data.reduce((a, b) => a + b, 0);
      return data.length ? Number((total / data.length).toFixed(2)) : 0;
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: categories,
        datasets: [{
          label: "Top Finding Types",
          data: values,
          backgroundColor: categories.map((_, i) => `hsl(${i * 40}, 70%, 55%)`)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Top GuardDuty Finding Types", font: { weight: "bold", size: 16 } }
        },
        scales: {
          x: {
            ticks: { maxRotation: 90, minRotation: 90 },
            title: { display: true, text: "Threat Type", font: { weight: "bold", size: 14 } }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Count of Events", font: { weight: "bold", size: 14 } }
          }
        }
      }
    });

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: categories,
        datasets: [{
          label: "Avg Response Time (s)",
          data: avgLatencies,
          borderColor: "orange",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Mean Time to Automated Response (MTTR)", font: { weight: "bold", size: 16 } }
        },
        scales: {
          x: {
            ticks: { maxRotation: 90, minRotation: 90 },
            title: { display: true, text: "Threat Type", font: { weight: "bold", size: 14 } }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Response Time (s)", font: { weight: "bold", size: 14 } }
          }
        }
      }
    });

  } else if (currentTab === "health") {
    const sevDist = {};
    remediations.forEach(r => {
      const sev = r.severity;
      if (!sev || sev === "Unknown") return;
      sevDist[sev] = (sevDist[sev] || 0) + 1;
    });

    const sevLabels = Object.keys(sevDist);
    const sevValues = sevLabels.map(l => sevDist[l]);
    const sevColors = sevLabels.map((_, i) => `hsl(${i * 40}, 70%, 55%)`);
    const total = sevValues.reduce((a, b) => a + b, 0);

    chart1 = new Chart(ctx1, {
      type: "pie",
      data: {
        labels: sevLabels.map((s, i) => `${s} (${sevValues[i]}, ${(sevValues[i] / total * 100).toFixed(1)}%)`),
        datasets: [{
          data: sevValues,
          backgroundColor: sevColors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Severity Distribution (%)", font: { weight: "bold", size: 16 } },
          legend: { position: "right" }
        }
      }
    });

    const reviewMap = {};
    remediations.forEach(r => {
      if (!r.review_required) return;
      const d = (r.time_occurred || '').split("T")[0];
      reviewMap[d] = (reviewMap[d] || 0) + 1;
    });

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: Object.keys(reviewMap),
        datasets: [{
          label: "SNS Manual Reviews",
          data: Object.values(reviewMap),
          borderColor: "red",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Manual Reviews Over Time (SNS Sent)", font: { weight: "bold", size: 16 } }
        },
        scales: {
          x: {
            title: { display: true, text: "Date", font: { weight: "bold", size: 14 } }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Number of Events", font: { weight: "bold", size: 14 } }
          }
        }
      }
    });
  }
}

function downloadCSV(type) {
  const data = chartData[type];
  if (!data || !data.length) return alert("No data to download.");
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${type}_${Date.now()}.csv`;
  a.click();
}
