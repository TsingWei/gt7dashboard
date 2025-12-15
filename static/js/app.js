// Global variables
let socket;
let charts = {};
let updateInterval;

// Initialize Socket.IO connection
function initSocket() {
    socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        updateConnectionStatus(false);
    });

    socket.on('connection_update', (data) => {
        updateConnectionStatus(data.connected);
    });

    socket.on('session_update', (data) => {
        updateTuningInfo(data);
    });

    socket.on('laps_update', (data) => {
        console.log('Laps updated:', data.laps_count);
        updateDashboard();
    });
}

// Initialize all charts
function initCharts() {
    const chartConfigs = {
        'time-diff-chart': {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Time Diff (ms)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Time Diff (ms)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Distance (m)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        },
        'speed-chart': {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Last Lap',
                        data: [],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: 'Reference Lap',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: 'Median Lap',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        borderWidth: 2,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Speed (km/h)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Distance (m)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        },
        'race-line-chart': {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Last Lap',
                        data: [],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        showLine: true,
                        pointRadius: 1
                    },
                    {
                        label: 'Reference Lap',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        showLine: true,
                        pointRadius: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Z Position'
                        },
                        reverse: true
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'X Position'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        },
        'throttle-chart': createSimpleLineChart('Throttle (%)', 'Distance (m)'),
        'braking-chart': createSimpleLineChart('Braking (%)', 'Distance (m)'),
        'coasting-chart': createSimpleLineChart('Coasting (%)', 'Distance (m)'),
        'gear-chart': createSimpleLineChart('Gear', 'Distance (m)'),
        'rpm-chart': createSimpleLineChart('RPM', 'Distance (m)'),
        'boost-chart': createSimpleLineChart('Boost (x100 kPa)', 'Distance (m)'),
        'yaw-rate-chart': createSimpleLineChart('Yaw Rate / Second', 'Distance (m)'),
        'tire-speed-chart': createSimpleLineChart('Tire Speed / Car Speed', 'Distance (m)'),
        'speed-variance-chart': createSimpleLineChart('Speed Deviation', 'Distance (m)')
    };

    // Create all charts
    for (const [id, config] of Object.entries(chartConfigs)) {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            charts[id] = new Chart(ctx, config);
        }
    }
}

// Helper function to create simple line chart config
function createSimpleLineChart(yLabel, xLabel) {
    return {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: yLabel,
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: {
                        display: true,
                        text: yLabel
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: xLabel
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    };
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (connected) {
        statusEl.className = 'status-indicator status-connected';
        statusEl.textContent = '🟢';
        statusEl.title = 'Connected';
    } else {
        statusEl.className = 'status-indicator status-disconnected';
        statusEl.textContent = '🔴';
        statusEl.title = 'Disconnected';
    }
}

// Update tuning info
function updateTuningInfo(data) {
    document.getElementById('max-speed').textContent = data.max_speed || '-';
    document.getElementById('min-body-height').textContent = data.min_body_height || '-';
}

// Update dashboard with latest data
async function updateDashboard() {
    try {
        // Fetch lap data
        const response = await fetch('/api/lap_data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Update lap info header
        if (data.last_lap) {
            document.getElementById('last-lap-title').textContent = 
                `${data.last_lap.title || 'Last Lap'} (${data.last_lap.car_name || 'Unknown'})`;
        }

        if (data.reference_lap) {
            document.getElementById('reference-lap-title').textContent = 
                `${data.reference_lap.title || 'Reference Lap'} (${data.reference_lap.car_name || 'Unknown'})`;
        }

        // Update charts
        updateCharts(data);

        // Update tuning info
        const tuningResponse = await fetch('/api/tuning_info');
        if (!tuningResponse.ok) {
            throw new Error(`HTTP error! status: ${tuningResponse.status}`);
        }
        const tuningData = await tuningResponse.json();
        updateTuningInfo(tuningData);

        // Update fuel map
        const fuelResponse = await fetch('/api/fuel_map');
        if (!fuelResponse.ok) {
            throw new Error(`HTTP error! status: ${fuelResponse.status}`);
        }
        const fuelData = await fuelResponse.json();
        document.getElementById('fuel-map').innerHTML = fuelData.fuel_map || 'No fuel data available';
        document.getElementById('fuel-map-race').innerHTML = fuelData.fuel_map || 'No fuel data available';

        // Update laps table
        updateLapsTable();

    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

// Update all charts with new data
function updateCharts(data) {
    if (!data.last_lap) return;

    const lastLap = data.last_lap;
    const referenceLap = data.reference_lap;
    const medianLap = data.median_lap;

    // Update Speed Chart
    if (charts['speed-chart'] && lastLap.distance) {
        charts['speed-chart'].data.labels = lastLap.distance;
        charts['speed-chart'].data.datasets[0].data = lastLap.speed || [];
        charts['speed-chart'].data.datasets[1].data = referenceLap?.speed || [];
        charts['speed-chart'].data.datasets[2].data = medianLap?.speed || [];
        charts['speed-chart'].update('none');
    }

    // Update Time Diff Chart
    if (charts['time-diff-chart'] && data.time_diff) {
        charts['time-diff-chart'].data.labels = data.time_diff.distance || [];
        charts['time-diff-chart'].data.datasets[0].data = data.time_diff.timedelta || [];
        charts['time-diff-chart'].update('none');
    }

    // Update Race Line Chart
    if (charts['race-line-chart'] && lastLap.raceline_x && lastLap.raceline_z) {
        const lastLapPoints = lastLap.raceline_x.map((x, i) => ({ x, y: lastLap.raceline_z[i] }));
        const referenceLapPoints = referenceLap?.raceline_x?.map((x, i) => ({ x, y: referenceLap.raceline_z[i] })) || [];
        
        charts['race-line-chart'].data.datasets[0].data = lastLapPoints;
        charts['race-line-chart'].data.datasets[1].data = referenceLapPoints;
        charts['race-line-chart'].update('none');
    }

    // Update Throttle Chart
    if (charts['throttle-chart'] && lastLap.throttle) {
        charts['throttle-chart'].data.labels = lastLap.distance;
        charts['throttle-chart'].data.datasets[0].data = lastLap.throttle;
        charts['throttle-chart'].update('none');
    }

    // Update Braking Chart
    if (charts['braking-chart'] && lastLap.braking) {
        charts['braking-chart'].data.labels = lastLap.distance;
        charts['braking-chart'].data.datasets[0].data = lastLap.braking;
        charts['braking-chart'].update('none');
    }

    // Update Coasting Chart
    if (charts['coasting-chart'] && lastLap.coasting) {
        charts['coasting-chart'].data.labels = lastLap.distance;
        charts['coasting-chart'].data.datasets[0].data = lastLap.coasting;
        charts['coasting-chart'].update('none');
    }

    // Update Gear Chart
    if (charts['gear-chart'] && lastLap.gear) {
        charts['gear-chart'].data.labels = lastLap.distance;
        charts['gear-chart'].data.datasets[0].data = lastLap.gear;
        charts['gear-chart'].update('none');
    }

    // Update RPM Chart
    if (charts['rpm-chart'] && lastLap.rpm) {
        charts['rpm-chart'].data.labels = lastLap.distance;
        charts['rpm-chart'].data.datasets[0].data = lastLap.rpm;
        charts['rpm-chart'].update('none');
    }

    // Update Boost Chart
    if (charts['boost-chart'] && lastLap.boost) {
        charts['boost-chart'].data.labels = lastLap.distance;
        charts['boost-chart'].data.datasets[0].data = lastLap.boost;
        charts['boost-chart'].update('none');
    }

    // Update Yaw Rate Chart
    if (charts['yaw-rate-chart'] && lastLap.yaw_rate) {
        charts['yaw-rate-chart'].data.labels = lastLap.distance;
        charts['yaw-rate-chart'].data.datasets[0].data = lastLap.yaw_rate;
        charts['yaw-rate-chart'].update('none');
    }
}

// Update laps table
async function updateLapsTable() {
    try {
        const response = await fetch('/api/laps');
        const data = await response.json();

        const tbody = document.getElementById('laps-table-body');
        
        if (data.laps && data.laps.length > 0) {
            tbody.innerHTML = '';
            data.laps.forEach((lap, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${lap.number || index + 1}</td>
                    <td>${lap.title || 'Lap ' + (index + 1)}</td>
                    <td>${lap.car_name || 'Unknown'}</td>
                    <td>-</td>
                `;
                tbody.appendChild(row);
            });

            // Update reference lap select options
            const select = document.getElementById('reference-lap-select');
            const currentValue = select.value;
            select.innerHTML = '<option value="-1">Best Lap</option>';
            data.laps.forEach((lap, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = lap.title || `Lap ${index + 1}`;
                select.appendChild(option);
            });
            select.value = currentValue;
        } else {
            tbody.innerHTML = '<tr><td colspan="4">No laps recorded yet</td></tr>';
        }
    } catch (error) {
        console.error('Error updating laps table:', error);
    }
}

// Tab switching
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab
            button.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
}

// Event listeners for controls
function initControls() {
    // Reset button
    document.getElementById('reset-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all laps?')) {
            try {
                await fetch('/api/reset', { method: 'POST' });
                alert('Laps reset successfully');
                updateDashboard();
            } catch (error) {
                console.error('Error resetting laps:', error);
                alert('Error resetting laps');
            }
        }
    });

    // Save button
    document.getElementById('save-btn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/save', { method: 'POST' });
            const data = await response.json();
            if (data.status === 'success') {
                alert(`Laps saved to ${data.path}`);
            } else {
                alert(data.message || 'Error saving laps');
            }
        } catch (error) {
            console.error('Error saving laps:', error);
            alert('Error saving laps');
        }
    });

    // Load laps select
    document.getElementById('lap-files-select').addEventListener('change', async (e) => {
        const filename = e.target.value;
        if (filename) {
            try {
                const response = await fetch('/api/load', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ filename })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    alert('Laps loaded successfully');
                    updateDashboard();
                } else {
                    alert(data.message || 'Error loading laps');
                }
            } catch (error) {
                console.error('Error loading laps:', error);
                alert('Error loading laps');
            }
        }
    });

    // Reference lap select
    document.getElementById('reference-lap-select').addEventListener('change', async (e) => {
        const lapIndex = e.target.value;
        try {
            await fetch('/api/set_reference_lap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lap_index: lapIndex })
            });
            updateDashboard();
        } catch (error) {
            console.error('Error setting reference lap:', error);
        }
    });

    // Log lap button
    document.getElementById('log-lap-btn').addEventListener('click', async () => {
        try {
            await fetch('/api/log_lap', { method: 'POST' });
            alert('Lap logged manually');
            updateDashboard();
        } catch (error) {
            console.error('Error logging lap:', error);
            alert('Error logging lap');
        }
    });

    // Always record checkbox
    document.getElementById('always-record-checkbox').addEventListener('change', async (e) => {
        try {
            await fetch('/api/set_always_record', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ always_record: e.target.checked })
            });
        } catch (error) {
            console.error('Error setting always record:', error);
        }
    });

    // Race tab buttons
    document.getElementById('reset-btn-race').addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all laps?')) {
            try {
                await fetch('/api/reset', { method: 'POST' });
                alert('Laps reset successfully');
                updateDashboard();
            } catch (error) {
                console.error('Error resetting laps:', error);
                alert('Error resetting laps');
            }
        }
    });

    document.getElementById('save-btn-race').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/save', { method: 'POST' });
            const data = await response.json();
            if (data.status === 'success') {
                alert(`Laps saved to ${data.path}`);
            } else {
                alert(data.message || 'Error saving laps');
            }
        } catch (error) {
            console.error('Error saving laps:', error);
            alert('Error saving laps');
        }
    });
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initTabs();
    initCharts();
    initControls();

    // Initial dashboard update
    updateDashboard();

    // Check connection status periodically
    setInterval(async () => {
        try {
            const response = await fetch('/api/connection_status');
            const data = await response.json();
            updateConnectionStatus(data.connected);
        } catch (error) {
            console.error('Error checking connection:', error);
            updateConnectionStatus(false);
        }
    }, 1000);

    // Update dashboard periodically
    updateInterval = setInterval(updateDashboard, 2000);
});
