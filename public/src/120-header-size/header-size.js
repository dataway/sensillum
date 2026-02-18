function displayHeaderSizeResult(resultsDiv, maxSize, testType, totalTests, rejectionStatus) {
    let recommendation;
    if (maxSize < 4096)        recommendation = '❌ Very restrictive. Will likely break modern authentication (OIDC/OAuth2 with JWTs).';
    else if (maxSize < 16384)  recommendation = '⚠️ Minimal limit. May work for simple apps but insufficient for complex OIDC scenarios.';
    else if (maxSize < 65536)  recommendation = '✅ Good for most applications. Handles typical OIDC/OAuth2 authentication flows.';
    else if (maxSize < 131072) recommendation = '✅ Generous limit. Accommodates complex OIDC scenarios with multiple tokens.';
    else if (maxSize < 524288) recommendation = '⚠️ Very large limit (common for complex OIDC setups). Monitor for potential abuse.';
    else                       recommendation = '⚠️ Extremely large limit. May indicate misconfiguration or potential DoS risk. Review if necessary.';

    const nearSensillumLimit = maxSize >= SENSILLUM_MAX_HEADER_BYTES * 0.98;
    const sensillumNote = nearSensillumLimit
        ? `<div class="result-detail" style="margin-top:8px; color:#e17055;">
                        ⚠️ This limit comes from Sensillum itself, not the proxy under test.
                        Sensillum's HTTP/1.1 read buffer is capped at ${formatBytes(SENSILLUM_MAX_HEADER_BYTES)} by Hyper.
                        The proxy may actually allow larger headers.
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
                    <div class="result-detail" style="margin-top: 10px;">${recommendation}</div>
                    ${rejectionNote}
                    ${sensillumNote}
                </div>
            `;
}

// Single Header Size Limit Test
async function runSingleHeaderSizeTest() {
    const button = document.getElementById('single-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';

    // Returns { ok: bool, status: HTTP status code or null on network error }
    async function testSize(size) {
        const headerValue = 'x'.repeat(size);
        try {
            const response = await fetch(`${urlPrefix}/echo`, {
                headers: { 'X-Test-Header': headerValue }
            });
            if (!response.ok) return { ok: false, status: response.status };
            const data = await response.json();
            const ok = data.headers && data.headers['x-test-header'] === headerValue;
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null }; // connection reset / network error
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'single header value');
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Single Header Value', result.totalTests, result.rejectionStatus);
    }

    button.disabled = false;
    button.textContent = 'Single Header';
}

// Total Header Size Limit Test
async function runTotalHeaderSizeTest() {
    const button = document.getElementById('total-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';

    // Returns { ok: bool, status: HTTP status code or null on network error }
    async function testSize(totalSize) {
        const numHeaders = 10;
        const sizePerHeader = Math.floor(totalSize / numHeaders);
        const headerValue = 'x'.repeat(sizePerHeader);
        const headers = {};
        for (let i = 0; i < numHeaders; i++) {
            headers[`X-Test-Header-${i}`] = headerValue;
        }
        try {
            const response = await fetch(`${urlPrefix}/echo`, { headers });
            if (!response.ok) return { ok: false, status: response.status };
            const data = await response.json();
            const ok = data.headers && data.headers['x-test-header-0'] === headerValue;
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'total headers size');
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Total Headers Size', result.totalTests, result.rejectionStatus);
    }

    button.disabled = false;
    button.textContent = 'Total Headers';
}
