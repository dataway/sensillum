function displayUrlSizeResult(resultsDiv, maxSize, testType, totalTests, rejectionStatus, sensillumLimitBytes) {
    const nearSensillumLimit = maxSize >= sensillumLimitBytes * 0.98;
    const sensillumNote = nearSensillumLimit
        ? `<div class="result-detail" style="margin-top:8px; color:#e17055;">
                        ⚠️ This limit comes from Sensillum itself, not the proxy under test.
                        Hyper hardcodes a ${formatBytes(sensillumLimitBytes)} maximum URL length.
                        The proxy may actually allow longer URLs.
                    </div>`
        : '';

    const rejectionNote = rejectionStatus !== undefined
        ? `<div class="result-detail" style="margin-top:8px;">
                        🚫 Rejection: ${formatRejectionStatus(rejectionStatus)}
                    </div>`
        : '';

    resultsDiv.innerHTML = `
                <div class="result-card">
                    <div style="font-weight: 600; color: #2d3436; margin-bottom: 10px;">Maximum ${testType}</div>
                    <div class="result-value">${formatBytes(maxSize)}</div>
                    <div class="result-detail">
                        📊 ${maxSize.toLocaleString()} bytes (tested in ${Math.ceil(totalTests)} requests)
                    </div>
                    ${rejectionNote}
                    ${sensillumNote}
                </div>
            `;
}

// URL Path Size Limit Test
async function runPathSizeTest() {
    const button = document.getElementById('url-path-test-btn');
    const resultsDiv = document.getElementById('url-size-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';

    async function testSize(size) {
        // Build a path of the desired length: /echo/ + repeated 'a'
        const segment = 'a'.repeat(size);
        try {
            const response = await fetch(`${urlPrefix}/echo/${segment}`);
            if (!response.ok) return { ok: false, status: response.status };
            const data = await response.json();
            const ok = typeof data.path === 'string' && data.path.length === size + '/echo/'.length;
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'URL path length');
    if (result) {
        displayUrlSizeResult(resultsDiv, result.maxSize, 'URL Path Length', result.totalTests, result.rejectionStatus, SENSILLUM_MAX_URI_BYTES);
    }

    button.disabled = false;
    button.textContent = 'Path';
}

// URL Query String Size Limit Test
async function runQuerySizeTest() {
    const button = document.getElementById('url-query-test-btn');
    const resultsDiv = document.getElementById('url-size-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';

    async function testSize(size) {
        const value = 'a'.repeat(size);
        try {
            const response = await fetch(`${urlPrefix}/echo?q=${value}`);
            if (!response.ok) return { ok: false, status: response.status };
            const data = await response.json();
            const ok = typeof data.query === 'string' && data.query.length === size + 'q='.length;
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'query string length');
    if (result) {
        displayUrlSizeResult(resultsDiv, result.maxSize, 'Query String Length', result.totalTests, result.rejectionStatus, SENSILLUM_MAX_URI_BYTES);
    }

    button.disabled = false;
    button.textContent = 'Query String';
}
