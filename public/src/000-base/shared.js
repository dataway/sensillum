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

// Format a byte value as a two-digit uppercase hex string, e.g. 9 → "0x09"
function byteHex(n) {
    return '0x' + n.toString(16).padStart(2, '0').toUpperCase();
}

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 1024) return bytes + ' Bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Detect HTTP protocol version from Performance API (for page navigation)
function detectHttpProtocol() {
    try {
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming && navTiming.nextHopProtocol) {
            return navTiming.nextHopProtocol;
        }
    } catch (err) {
        console.error('Failed to detect HTTP protocol:', err);
    }
    return null;
}

function displayServerInfo(data, containerId) {
    const headersContent = document.getElementById(containerId);
    const headers = data.headers;

    let html = '';

    // Add protocol info in a combined box
    if (data.httpProtocol || data.protocol) {
        html += '<div class="client-ip">';
        if (data.httpProtocol) {
            html += `<div><strong>Client protocol:</strong><span class="ip-value">${escapeHtml(data.httpProtocol)}</span></div>`;
        }
        if (data.protocol) {
            html += `<div><strong>Server protocol:</strong><span class="ip-value">${escapeHtml(data.protocol)}</span></div>`;
        }
        html += '</div>';
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

    let tableHtml;
    if (data.origin_mismatch) {
        html = '<div class="origin-mismatch-warning">' +
            '<strong>&#9888; Cross-origin connection detected</strong>' +
            '<p>This WebSocket was opened from an origin that does not match the server\'s ' +
            '<code>Host</code> header. Request headers have been suppressed to prevent ' +
            'cross-origin credential exposure.</p>' +
            '</div>' + html;
        tableHtml = '';
    } else {
        tableHtml = '<table class="headers-table"><thead><tr><th>Header Name</th><th>Value</th></tr></thead><tbody>';
        for (const [name, value] of Object.entries(headers)) {
            let cell;
            if (value && typeof value === 'object') {
                if (value.redacted) {
                    cell = '<span class="header-redacted">🔒 redacted</span>';
                } else if (value.binary) {
                    if (Array.isArray(value.data)) {
                        const rendered = value.data.map(b => {
                            if (b === 0x09) return '\\t';
                            if (b >= 0x20 && b <= 0x7e) return String.fromCharCode(b);
                            return `\\x${b.toString(16).padStart(2, '0')}`;
                        }).join('');
                        cell = escapeHtml(rendered);
                    } else {
                        cell = '<span class="header-binary">binary</span>';
                    }
                } else {
                    cell = escapeHtml(JSON.stringify(value));
                }
            } else {
                cell = escapeHtml(value);
            }
            tableHtml += `<tr><td>${escapeHtml(name)}</td><td>${cell}</td></tr>`;
        }
        tableHtml += '</tbody></table>';
    }

    headersContent.innerHTML = html + serverInfoHtml + tableHtml;
}
