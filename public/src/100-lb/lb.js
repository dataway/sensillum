async function runLoadBalancerTest() {
    const button = document.getElementById('lb-test-btn');
    const resultsDiv = document.getElementById('lb-results');

    button.disabled = true;
    button.textContent = 'Running...';
    resultsDiv.innerHTML = '<p style="color: #95a5a6; text-align: center; grid-column: 1 / -1;">Making 15 requests...</p>';

    const results = [];

    // Make 15 requests with cache busting
    for (let i = 0; i < 15; i++) {
        try {
            const cachebust = Date.now() + Math.random();
            const response = await fetch(`${urlPrefix}/lb?cb=${cachebust}`);
            const data = await response.json();
            results.push({ number: i + 1, data });
        } catch (err) {
            results.push({ number: i + 1, error: err.message });
        }
    }

    // Display results
    let html = '';
    for (const result of results) {
        if (result.error) {
            html += `
                        <div class="lb-item">
                            <div class="lb-number">#${result.number}</div>
                            <div style="color: #d63031;">Error: ${escapeHtml(result.error)}</div>
                        </div>
                    `;
        } else {
            const nodeInsignia = result.data.node_name_hash ? generateInsignia(result.data.node_name_hash) : '';
            const hostnameInsignia = result.data.hostname_hash ? generateInsignia(result.data.hostname_hash) : '';

            html += `
                        <div class="lb-item">
                            ${result.data.node_name ? `<div class="lb-node">${nodeInsignia}${escapeHtml(result.data.node_name)}</div>` : ''}
                            ${result.data.hostname ? `<div class="lb-hostname">${hostnameInsignia}${escapeHtml(result.data.hostname)}</div>` : ''}
                        </div>
                    `;
        }
    }

    resultsDiv.innerHTML = html;
    button.disabled = false;
    button.textContent = 'Reload';
}
