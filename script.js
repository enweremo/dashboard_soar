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

function updateCharts() {
  const canvas1 = document.getElementById("chart1");
  const canvas2 = document.getElementById("chart2");
  const ctx1 = canvas1.getContext("2d");
  const ctx2 = canvas2.getContext("2d");

  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();
  canvas1.className = "";
  canvas2.className = "";

  const remediations = chartData.remediations || [];
  const labelMap = {
    "UnauthorizedAccess:EC2/SSHBruteForce": "SSHBruteForce",
    "Recon:EC2/PortProbeUnprotectedPort": "PortScanning",
    "Persistence:IAMUser/AnomalousBehavior": "IAMAnomalousBehavior",
    "UnauthorizedAccess:IAMUser/Exfiltration": "IAMExfiltration",
    "TorAccess": "TorAccess",
    "UnauthorizedAccess:EC2/WebLoginAbuse": "WebLoginAbuse",
    "UnauthorizedAccess:S3/AnonymousUser": "S3UnauthorizedAccess",
    "GeoLocation:HighRiskAccess": "GeoIPThreat"
  };

  if (currentTab === "incident") {
    const severityLabels = ["Low", "Medium", "High", "Critical", "Unknown"];
    const automatedCounts = [];
    const manualCounts = [];

    severityLabels.forEach(sev => {
      const group = remediations.filter(r => (r.severity || "Unknown").toLowerCase() === sev.toLowerCase());
      automatedCounts.push(group.filter(r => r.review_required === false).length);
      manualCounts.push(group.filter(r => r.review_required === true).length);
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: severityLabels,
        datasets: [
          { label: "Automated", data: automatedCounts, backgroundColor: "green" },
          { label: "Manual Review", data: manualCounts, backgroundColor: "gold" }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Findings by Severity & Review Type", font: { size: 16 } },
          legend: { position: "top", labels: { font: { size: 13 } } }
        },
        scales: {
          x: {
            title: { display: true, text: "Severity Category", font: { size: 14 } }
          },
          y: {
            title: { display: true, text: "Count of Events", font: { size: 14 } },
            beginAtZero: true
          }
        }
      }
    });

    const total = remediations.length || 1;
    const completed = remediations.filter(r => r.action_status === "completed").length;
    const successPercent = ((completed / total) * 100).toFixed(0);
    const remainingPercent = 100 - successPercent;

    chart2 = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: [
          `Remediation Success Rate = ${successPercent}%`,
          `Remaining = ${remainingPercent}%`
        ],
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: ["green", "#ccc"]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Remediation Success Rate", font: { size: 16 } },
          legend: { position: "top", labels: { font: { size: 13 } } }
        },
        cutout: "70%",
        maintainAspectRatio: false
      }
    });

  } else if (currentTab === "performance") {
    const countMap = {};
    remediations.forEach(r => {
      const type = labelMap[r.finding_type] || "Unknown";
      countMap[type] = (countMap[type] || 0) + 1;
    });

    const latencyMap = {};
    remediations.forEach(r => {
      const type = labelMap[r.finding_type] || "Unknown";
      if (!latencyMap[type]) latencyMap[type] = [];
      if (!isNaN(r.latency_seconds)) latencyMap[type].push(parseFloat(r.latency_seconds));
    });

    const types = Object.keys(countMap);
    const counts = Object.values(countMap);
    const latencyLabels = Object.keys(latencyMap);
    const latencyValues = latencyLabels.map(k => {
      const list = latencyMap[k];
      return Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2));
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: types,
        datasets: [{
          label: "Number of Events",
          data: counts,
          backgroundColor: "teal"
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Top GuardDuty Finding Types", font: { size: 16 } },
          legend: { display: false }
        },
        scales: {
          x: {
            title: { display: true, text: "Threat Type", font: { size: 14 } },
            ticks: { maxRotation: 90, minRotation: 90 }
          },
          y: {
            title: { display: true, text: "Count of Events", font: { size: 14 } },
            beginAtZero: true
          }
        }
      }
    });

    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: latencyLabels,
        datasets: [{
          label: "Avg Response Time (s)",
          data: latencyValues,
          borderColor: "orange",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: "Mean Time to Automated Response (MTTR)", font: { size: 16 } },
          legend: { labels: { font: { size: 13 } } }
        },
        scales: {
          x: { title: { display: true, text: "Threat Type", font: { size: 14 } } },
          y: { title: { display: true, text: "Time (Seconds)", font: { size: 14 } }, beginAtZero: true }
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
          title: { display: true, text: "Severity Distribution (%)", font: { size: 16 } },
          legend: { position: "right", labels: { font: { size: 13 } } }
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
        plugins: {
          title: { display: true, text: "Manual Reviews Over Time (SNS Sent)", font: { size: 16 } },
          legend: { labels: { font: { size: 13 } } }
        },
        scales: {
          x: { title: { display: true, text: "Date", font: { size: 14 } } },
          y: { title: { display: true, text: "Count of Events", font: { size: 14 } }, beginAtZero: true }
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
