function lbPlaceholderHTML(i) {
    return `<div class="lb-item lb-item--pending" id="lb-box-${i}">
        <div class="lb-number">#${i + 1}</div>
        <div class="lb-pending-label">pending…</div>
        <div class="lb-timer" id="lb-timer-${i}">0.0 s</div>
    </div>`;
}

function lbElapsed(ms) {
    return (ms / 1000).toFixed(1) + ' s';
}

function lbUpdateBox(i, result, elapsedMs) {
    const box = document.getElementById(`lb-box-${i}`);
    if (!box) return;

    const timerHTML = `<div class="lb-timer lb-timer--done">${lbElapsed(elapsedMs)}</div>`;

    const numHTML = `<div class="lb-number">#${i + 1}</div>`;

    if (result.error) {
        box.className = 'lb-item lb-item--error';
        box.innerHTML = `
            ${numHTML}
            <div class="lb-error">${escapeHtml(result.error)}</div>
            ${timerHTML}
        `;
    } else if (result.httpError) {
        box.className = 'lb-item lb-item--error';
        const bodyDetails = result.body
            ? `<details class="lb-proxy-body">
                <summary>Show response</summary>
                <div class="lb-shadow-host"></div>
               </details>`
            : '';
        box.innerHTML = `
            ${numHTML}
            <div class="lb-error">HTTP ${result.httpError}</div>
            ${bodyDetails}
            ${timerHTML}
        `;
        if (result.body) {
            const host = box.querySelector('.lb-shadow-host');
            if (host) {
                const shadow = host.attachShadow({ mode: 'open' });
                shadow.innerHTML = result.body;
            }
        }
    } else {
        const nodeInsignia = result.data.node_name_hash ? generateInsignia(result.data.node_name_hash) : '';
        const hostnameInsignia = result.data.hostname_hash ? generateInsignia(result.data.hostname_hash) : '';
        box.className = 'lb-item';
        box.innerHTML = `
            ${numHTML}
            ${result.data.node_name ? `<div class="lb-node">${nodeInsignia}${escapeHtml(result.data.node_name)}</div>` : ''}
            ${result.data.hostname ? `<div class="lb-hostname">${hostnameInsignia}${escapeHtml(result.data.hostname)}</div>` : ''}
            ${timerHTML}
        `;
    }
}

async function runLoadBalancerTest() {
    const button = document.getElementById('lb-test-btn');
    const resultsDiv = document.getElementById('lb-results');

    button.disabled = true;
    button.textContent = 'Running...';

    // Immediately render all 15 placeholder boxes
    resultsDiv.innerHTML = Array.from({length: 15}, (_, i) => lbPlaceholderHTML(i)).join('');

    // Make 15 sequential requests, updating each box as it completes
    for (let i = 0; i < 15; i++) {
        const t0 = Date.now();
        const timerEl = document.getElementById(`lb-timer-${i}`);
        const interval = setInterval(() => {
            if (timerEl) timerEl.textContent = lbElapsed(Date.now() - t0);
        }, 100);

        try {
            const cachebust = t0 + Math.random();
            const response = await fetch(`${urlPrefix}/lb?cb=${cachebust}`);
            const text = await response.text();
            clearInterval(interval);
            if (!response.ok) {
                lbUpdateBox(i, { httpError: response.status, body: text.trim() }, Date.now() - t0);
                continue;
            }
            let data;
            try {
                data = JSON.parse(text);
            } catch (_) {
                lbUpdateBox(i, { httpError: response.status + ' (bad JSON)', body: text.trim() }, Date.now() - t0);
                continue;
            }
            lbUpdateBox(i, { data }, Date.now() - t0);
        } catch (err) {
            clearInterval(interval);
            lbUpdateBox(i, { error: err.message }, Date.now() - t0);
        }
    }

    button.disabled = false;
    button.textContent = 'Reload';
}
