const apiUrl = "https://q2wy1am2oj.execute-api.us-east-1.amazonaws.com/prod/data";
let currentTab = "incident";

let chart1, chart2;
let chartData = { threats: [], remediations: [], blocked_ips: [] };
let autoRefreshId = null;

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
  clearInterval(autoRefreshId);
  if (document.getElementById("autoRefresh").checked) {
    autoRefreshId = setInterval(fetchData, 60000); // Refresh every 60 seconds
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
    // Chart 1: Stacked Bar (Severity & Automation)
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
        plugins: { title: { display: true, text: "Findings by Severity & Automation" } },
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });

    // Chart 2: Gauge-like Doughnut (Success Rate)
    const total = remediations.length;
    const completed = remediations.filter(r => r.action_status === "completed").length;
    chart2 = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Success", "Remaining"],
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: ["green", "#ddd"]
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Remediation Success Rate" },
          legend: { position: "top" }
        },
        cutout: "70%"
      }
    });

  } else if (currentTab === "performance") {
    // Chart 1: Horizontal Bar (Top Findings)
    const countMap = {};
    remediations.forEach(r => {
      const type = r.finding_type || "Unknown";
      countMap[type] = (countMap[type] || 0) + 1;
    });
    const labels = Object.keys(countMap);
    const values = Object.values(countMap);
    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Top Finding Types",
          data: values,
          backgroundColor: "#3ec1d3"
        }]
      },
      options: {
        indexAxis: "y",
        plugins: { title: { display: true, text: "Top GuardDuty Finding Types Acted Upon" } },
        responsive: true
      }
    });

    // Chart 2: Line Chart (MTTR)
    const latencyMap = {};
    remediations.forEach(r => {
      if (!r.latency_seconds || isNaN(r.latency_seconds)) return;
      const type = r.finding_type || "Unknown";
      latencyMap[type] = latencyMap[type] || [];
      latencyMap[type].push(parseFloat(r.latency_seconds));
    });
    const mttrLabels = Object.keys(latencyMap);
    const mttrValues = mttrLabels.map(k => {
      const list = latencyMap[k];
      return (list.reduce((a, b) => a + b, 0) / list.length).toFixed(2);
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
        plugins: { title: { display: true, text: "Mean Time to Automated Response" } },
        responsive: true
      }
    });

  } else if (currentTab === "health") {
    // Chart 1: Grouped Bar (Auto vs Manual Daily Volume)
    const dailyMap = {};
    remediations.forEach(r => {
      const date = (r.time_occurred || '').split("T")[0] || "Unknown";
      dailyMap[date] = dailyMap[date] || { auto: 0, manual: 0 };
      if (r.sns_sent) dailyMap[date].manual++;
      else dailyMap[date].auto++;
    });
    const days = Object.keys(dailyMap);
    chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: days,
        datasets: [
          {
            label: "Automated",
            data: days.map(d => dailyMap[d].auto),
            backgroundColor: "green"
          },
          {
            label: "Manual",
            data: days.map(d => dailyMap[d].manual),
            backgroundColor: "orange"
          }
        ]
      },
      options: {
        plugins: { title: { display: true, text: "Auto vs Manual Remediations (Daily)" } },
        responsive: true
      }
    });

    // Chart 2: Line Chart (Manual Reviews - SNS Sent)
    const snsMap = {};
    remediations.forEach(r => {
      if (!r.sns_sent) return;
      const date = (r.time_occurred || '').split("T")[0];
      snsMap[date] = (snsMap[date] || 0) + 1;
    });
    const snsDates = Object.keys(snsMap);
    const snsCounts = Object.values(snsMap);
    chart2 = new Chart(ctx2, {
      type: "line",
      data: {
        labels: snsDates,
        datasets: [{
          label: "SNS Manual Reviews",
          data: snsCounts,
          borderColor: "red",
          backgroundColor: "transparent",
          tension: 0.3
        }]
      },
      options: {
        plugins: { title: { display: true, text: "Manual Review Volume (SNS Sent)" } },
        responsive: true
      }
    });
  }
}
