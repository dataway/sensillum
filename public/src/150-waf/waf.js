// WAF_KEY and WAF_PAYLOADS are injected by build.rs.
// Payloads are XOR-encoded so the raw attack strings never appear in the served source.
// To add or change payloads, edit public/src/waf-payloads.json.

// Decode a WAF payload entry at runtime.
function wafPayload(entry) {
    return String.fromCharCode(...entry.data.map(b => b ^ WAF_KEY));
}

// Ingress test: send the payload TO the server via header/path/query and check
// whether it arrives intact at /echo (unblocked) or is rejected (blocked).
async function runWafIngressTest() {
    const button = document.getElementById('waf-ingress-btn');
    const resultsDiv = document.getElementById('waf-ingress-results');

    button.disabled = true;
    button.textContent = 'Testing...';
    resultsDiv.innerHTML = '<div class="result-detail">Running ingress WAF tests...</div>';

    const channels = [
        {
            label: 'Header',
            async send(payload) {
                try {
                    const response = await fetch(`${urlPrefix}/echo`, {
                        headers: { 'X-Waf-Test': payload }
                    });
                    if (!response.ok) return { sent: true, blocked: true, status: response.status };
                    const data = await response.json();
                    const echoed = data.headers && data.headers['x-waf-test'] === payload;
                    return { sent: true, blocked: !echoed, status: response.status };
                } catch {
                    return { sent: true, blocked: true, status: null };
                }
            },
        },
        {
            label: 'URL path',
            async send(payload) {
                try {
                    const encoded = encodeURIComponent(payload);
                    const response = await fetch(`${urlPrefix}/echo/${encoded}`);
                    if (!response.ok) return { sent: true, blocked: true, status: response.status };
                    const data = await response.json();
                    // The server echoes the raw (percent-encoded) path
                    const expectedPath = '/echo/' + encoded;
                    const echoed = typeof data.path === 'string' && data.path === expectedPath;
                    return { sent: true, blocked: !echoed, status: response.status };
                } catch {
                    return { sent: true, blocked: true, status: null };
                }
            },
        },
        {
            label: 'Query string',
            async send(payload) {
                try {
                    const response = await fetch(`${urlPrefix}/echo?waf=${encodeURIComponent(payload)}`);
                    if (!response.ok) return { sent: true, blocked: true, status: response.status };
                    const data = await response.json();
                    // The server echoes the raw (percent-encoded) query string
                    const echoed = typeof data.query === 'string' && data.query.includes(encodeURIComponent(payload));
                    return { sent: true, blocked: !echoed, status: response.status };
                } catch {
                    return { sent: true, blocked: true, status: null };
                }
            },
        },
    ];

    let html = '';
    let totalBlocked = 0;
    let totalTests = 0;

    for (const entry of WAF_PAYLOADS) {
        const payload = wafPayload(entry);
        html += `<div class="result-category">${entry.name}</div>`;
        html += `<div class="result-detail" style="font-family:monospace; background:#f4f4f4; padding:4px 8px; border-radius:4px; margin-bottom:6px; word-break:break-all;">${payload}</div>`;

        for (const channel of channels) {
            const result = await channel.send(payload);
            totalTests++;
            const blocked = result.blocked;
            if (blocked) totalBlocked++;

            const statusStr = result.status !== null ? ` (HTTP ${result.status})` : ' (connection reset)';
            const icon  = blocked ? '✅' : '❌';
            const label = blocked ? 'Blocked' : 'NOT blocked — payload passed through!';
            const cls   = blocked ? 'success' : 'fail';

            html += `
                <div class="result-detail">
                    <span class="${cls}">${icon} ${channel.label}:</span> ${label}${statusStr}
                </div>`;
        }
    }

    const summaryClass = totalBlocked === totalTests ? 'success' : (totalBlocked > 0 ? 'warning' : 'fail');
    const summaryIcon  = totalBlocked === totalTests ? '✅' : (totalBlocked > 0 ? '⚠️' : '❌');

    resultsDiv.innerHTML =
        `<div class="result-card">
            <div class="result-summary">
                <span class="${summaryClass}">${summaryIcon} Blocked ${totalBlocked} / ${totalTests} channels</span>
            </div>
            ${html}
        </div>`;

    button.disabled = false;
    button.textContent = 'Run Test';
}

// Egress test: ask the server (/waf endpoint) to send the payload back TO the
// browser, either in the response body or in a response header, and check
// whether it arrives intact (unblocked) or is stripped/rejected (blocked).
async function runWafEgressTest() {
    const button = document.getElementById('waf-egress-btn');
    const resultsDiv = document.getElementById('waf-egress-results');

    button.disabled = true;
    button.textContent = 'Testing...';
    resultsDiv.innerHTML = '<div class="result-detail">Running egress WAF tests...</div>';

    const channels = [
        {
            label: 'Response body',
            async send(entry, payload) {
                try {
                    const url = `${urlPrefix}/waf?name=${encodeURIComponent(entry.name)}`;
                    const response = await fetch(url);
                    if (!response.ok) return { blocked: true, status: response.status };
                    const body = await response.text();
                    return { blocked: body !== payload, status: response.status };
                } catch {
                    return { blocked: true, status: null };
                }
            },
        },
        {
            label: 'Response header',
            async send(entry, payload) {
                try {
                    const url = `${urlPrefix}/waf?name=${encodeURIComponent(entry.name)}&method=header`;
                    const response = await fetch(url);
                    if (!response.ok) return { blocked: true, status: response.status };
                    const headerValue = response.headers.get('X-Waf-Payload');
                    return { blocked: headerValue !== payload, status: response.status };
                } catch {
                    return { blocked: true, status: null };
                }
            },
        },
    ];

    let html = '';
    let totalBlocked = 0;
    let totalTests = 0;

    for (const entry of WAF_PAYLOADS) {
        const payload = wafPayload(entry);
        html += `<div class="result-category">${entry.name}</div>`;
        html += `<div class="result-detail" style="font-family:monospace; background:#f4f4f4; padding:4px 8px; border-radius:4px; margin-bottom:6px; word-break:break-all;">${payload}</div>`;

        for (const channel of channels) {
            const result = await channel.send(entry, payload);
            totalTests++;
            const blocked = result.blocked;
            if (blocked) totalBlocked++;

            const statusStr = result.status !== null ? ` (HTTP ${result.status})` : ' (connection reset)';
            const icon  = blocked ? '✅' : '❌';
            const label = blocked ? 'Blocked' : 'NOT blocked — payload reached browser!';
            const cls   = blocked ? 'success' : 'fail';

            html += `
                <div class="result-detail">
                    <span class="${cls}">${icon} ${channel.label}:</span> ${label}${statusStr}
                </div>`;
        }
    }

    const summaryClass = totalBlocked === totalTests ? 'success' : (totalBlocked > 0 ? 'warning' : 'fail');
    const summaryIcon  = totalBlocked === totalTests ? '✅' : (totalBlocked > 0 ? '⚠️' : '❌');

    resultsDiv.innerHTML =
        `<div class="result-card">
            <div class="result-summary">
                <span class="${summaryClass}">${summaryIcon} Blocked ${totalBlocked} / ${totalTests} channels</span>
            </div>
            ${html}
        </div>`;

    button.disabled = false;
    button.textContent = 'Run Test';
}
