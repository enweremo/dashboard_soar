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

  if (currentTab === "incident") {
    const severities = ["Low", "Medium", "High", "Critical", "Unknown"];
    const autoCounts = [];
    const manualCounts = [];

    severities.forEach(sev => {
      const group = remediations.filter(r => (r.severity || "Unknown").toLowerCase() === sev.toLowerCase());
      autoCounts.push(group.filter(r => r.review_required === false).length);
      manualCounts.push(group.filter(r => r.review_required === true).length);
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: severities,
        datasets: [
          {
            label: "Automated",
            data: autoCounts,
            backgroundColor: "green"
          },
          {
            label: "Manual Review",
            data: manualCounts,
            backgroundColor: "orange"
          }
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

    const countMap = {};
    remediations.forEach(r => {
      const type = r.finding_type || "Unknown";
      countMap[type] = (countMap[type] || 0) + 1;
    });

    const rawLabels = Object.keys(countMap);
    const shortLabels = rawLabels.map(l => labelMap[l] || l);
    const values = Object.values(countMap);
    const colors = shortLabels.map((_, i) => `hsl(${i * 40}, 70%, 55%)`);

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: shortLabels,
        datasets: [{
          label: "Top Finding Types",
          data: values,
          backgroundColor: colors
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

    const latencyMap = {};
    remediations.forEach(r => {
      const type = r.finding_type || "Unknown";
      if (!latencyMap[type]) latencyMap[type] = [];
      if (!isNaN(r.latency_seconds)) latencyMap[type].push(parseFloat(r.latency_seconds));
    });

    const mttrLabels = Object.keys(latencyMap).map(l => labelMap[l] || l);
    const mttrValues = Object.values(latencyMap).map(list => {
      const total = list.reduce((a, b) => a + b, 0);
      return Number((total / list.length).toFixed(2));
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
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Mean Time to Automated Response (MTTR)", font: { weight: "bold", size: 16 } }
        },
        scales: {
          x: {
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
      const sev = r.severity || "Unknown";
      sevDist[sev] = (sevDist[sev] || 0) + 1;
    });

    const sevLabels = Object.keys(sevDist);
    const sevValues = Object.values(sevDist);
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
