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
  const threats = chartData.threats || [];

  if (currentTab === "incident") {
    const severityMap = {
      Low: "#4caf50", Medium: "#ff9800", High: "#f44336", Critical: "#9c27b0", Unknown: "#607d8b"
    };
    const severities = ["Low", "Medium", "High", "Critical", "Unknown"];

    const autoData = [], manualData = [], barColors = [];
    severities.forEach(sev => {
      const group = remediations.filter(r => (r.severity || "Unknown").toLowerCase() === sev.toLowerCase());
      autoData.push(group.filter(r => r.review_required === false).length);
      manualData.push(group.filter(r => r.review_required === true).length);
      barColors.push(severityMap[sev] || "#999");
    });

    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: severities,
        datasets: [
          {
            label: "Automated",
            data: autoData,
            backgroundColor: barColors
          },
          {
            label: "Manual Review",
            data: manualData,
            backgroundColor: "gold"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: "Findings by Severity & Review Type"
          },
          legend: {
            position: "top"
          }
        },
        scales: {
          x: {
            stacked: true
          },
          y: {
            stacked: true,
            beginAtZero: true
          }
        }
      }
    });

    const total = remediations.length || 1;
    const completed = remediations.filter(r => r.action_status === "completed").length;

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
        cutout: "60%",
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  // (No change to performance and health tabs unless needed — let me know)
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
