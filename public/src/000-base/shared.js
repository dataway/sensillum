const urlPrefix = window.initialServerInfo?.url_prefix || '';

let history = [];

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 1024) return bytes + ' Bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function displayServerInfo(data, containerId) {
    const headersContent = document.getElementById(containerId);
    const headers = data.headers;

    let html = '';

    // Add protocol info if available
    if (data.protocol) {
        html += `<div class="client-ip"><strong>Protocol:</strong><span class="ip-value">${escapeHtml(data.protocol)}</span></div>`;
    }

    // Add client address if available
    if (data.client_addr) {
        html += `<div class="client-ip"><strong>Client Address:</strong><span class="ip-value">${escapeHtml(data.client_addr)}</span></div>`;
    }

    // Build server info section
    let serverInfoHtml = '';
    if (data.server_addr || data.hostname || data.node_name) {
        serverInfoHtml += '<div class="server-info">';
        if (data.server_addr) {
            serverInfoHtml += `<div><strong>Server Address:</strong><span class="info-value">${escapeHtml(data.server_addr)}</span></div>`;
        }
        if (data.hostname) {
            const insignia = data.hostname_hash ? generateInsignia(data.hostname_hash) : '';
            serverInfoHtml += `<div style="display: flex; align-items: center;"><strong>Hostname:</strong><span class="info-value" style="display: flex; align-items: center;">${insignia}${escapeHtml(data.hostname)}</span></div>`;
        }
        if (data.node_name) {
            const insignia = data.node_name_hash ? generateInsignia(data.node_name_hash) : '';
            serverInfoHtml += `<div style="display: flex; align-items: center;"><strong>Node Name:</strong><span class="info-value" style="display: flex; align-items: center;">${insignia}${escapeHtml(data.node_name)}</span></div>`;
        }
        serverInfoHtml += '</div>';
    }

    let tableHtml = '<table class="headers-table"><thead><tr><th>Header Name</th><th>Value</th></tr></thead><tbody>';
    for (const [name, value] of Object.entries(headers)) {
        tableHtml += `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(value)}</td></tr>`;
    }
    tableHtml += '</tbody></table>';

    headersContent.innerHTML = html + serverInfoHtml + tableHtml;
}
