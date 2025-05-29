
let activeTab = 'incident';
let autoRefreshInterval;

document.addEventListener("DOMContentLoaded", () => {
    switchTab();
    setupEventHandlers();
    loadCharts();

    if (document.getElementById("autoRefresh").checked) {
        autoRefreshInterval = setInterval(loadCharts, 60000);
    }
});

function setTab(tab) {
    activeTab = tab;
    switchTab();
    loadCharts();
}

function switchTab() {
    document.querySelectorAll(".tab").forEach(tab => tab.style.display = "none");
    document.getElementById(`tab-${activeTab}`).style.display = "flex";
}

function setupEventHandlers() {
    document.getElementById("dateRange").addEventListener("change", loadCharts);
    document.getElementById("threatFilter").addEventListener("change", loadCharts);
    document.getElementById("downloadThreats").addEventListener("click", () => alert("Download ThreatMetadata CSV"));
    document.getElementById("downloadRemediations").addEventListener("click", () => alert("Download RemediationLog CSV"));

    document.getElementById("autoRefresh").addEventListener("change", function () {
        clearInterval(autoRefreshInterval);
        if (this.checked) {
            autoRefreshInterval = setInterval(loadCharts, 60000);
        }
    });
}

function getSelectedThreatType() {
    return document.getElementById("threatFilter").value;
}

function getSelectedDateRange() {
    return parseInt(document.getElementById("dateRange").value);
}

function loadCharts() {
    renderChart("severityAutomationChart");
    renderChart("remediationSuccessGauge");
    renderChart("topFindingsChart");
    renderChart("responseTimeChart");
    renderChart("remediationVolumeChart");
    renderChart("manualReviewChart");
}

function renderChart(id) {
    const ctx = document.getElementById(id).getContext('2d');
    if (window[id]) window[id].destroy();

    window[id] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Example 1", "Example 2"],
            datasets: [{
                label: "Sample",
                backgroundColor: "#42a5f5",
                data: [10, 15]
            }]
        }
    });
}
