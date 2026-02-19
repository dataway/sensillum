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

// Mutual exclusion — only one header-size test runs at a time.
let _headerTestRunning = false;

function _setHeaderTestButtons(disabled, activeId) {
    const ids = ['single-header-test-btn', 'total-header-test-btn',
                 'resp-single-header-test-btn', 'resp-total-header-test-btn'];
    const labels = {
        'single-header-test-btn':      'Request: Single',
        'total-header-test-btn':       'Request: Multi',
        'resp-single-header-test-btn': 'Response: Single',
        'resp-total-header-test-btn':  'Response: Multi',
    };
    for (const id of ids) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.disabled = disabled;
        if (!disabled || id !== activeId) btn.textContent = labels[id];
    }
}

// Single Header Size Limit Test
async function runSingleHeaderSizeTest() {
    if (_headerTestRunning) return;
    _headerTestRunning = true;
    _setHeaderTestButtons(true, 'single-header-test-btn');
    const button = document.getElementById('single-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');
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
            const ok = !!data.headers; // request reached Sensillum; proxy may strip the header
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null }; // connection reset / network error
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'single header value');
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Single Header Value', result.totalTests, result.rejectionStatus);
    }

    _headerTestRunning = false;
    _setHeaderTestButtons(false);
}

// Total Header Size Limit Test
async function runTotalHeaderSizeTest() {
    if (_headerTestRunning) return;
    _headerTestRunning = true;
    _setHeaderTestButtons(true, 'total-header-test-btn');
    const button = document.getElementById('total-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');
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
            const ok = !!data.headers; // request reached Sensillum; proxy may strip headers
            return { ok, status: response.status };
        } catch {
            return { ok: false, status: null };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'total headers size');
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Total Headers Size', result.totalTests, result.rejectionStatus);
    }

    _headerTestRunning = false;
    _setHeaderTestButtons(false);
}

// Response Single Header Size Limit Test
async function runResponseSingleHeaderSizeTest() {
    if (_headerTestRunning) return;
    _headerTestRunning = true;
    _setHeaderTestButtons(true, 'resp-single-header-test-btn');
    const button = document.getElementById('resp-single-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');
    button.textContent = 'Testing...';

    const MAX_RESP = 2 * 1024 * 1024; // matches server-side cap

    async function testSize(size) {
        try {
            const response = await fetch(`${urlPrefix}/hdr?size=${size}&mode=single`);
            return { ok: response.ok, status: response.status };
        } catch {
            // fetch() throw on a response-header test almost always means the browser
            // rejected the response (e.g. Chrome ERR_RESPONSE_HEADERS_TOO_BIG ~256 KB).
            return { ok: false, status: -1 };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'response single header value', MAX_RESP);
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Response Single Header Value', result.totalTests, result.rejectionStatus);
    }

    _headerTestRunning = false;
    _setHeaderTestButtons(false);
}

// Response Total Header Size Limit Test
async function runResponseTotalHeaderSizeTest() {
    if (_headerTestRunning) return;
    _headerTestRunning = true;
    _setHeaderTestButtons(true, 'resp-total-header-test-btn');
    const button = document.getElementById('resp-total-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');
    button.textContent = 'Testing...';

    const MAX_RESP = 2 * 1024 * 1024; // matches server-side cap

    async function testSize(totalSize) {
        try {
            const response = await fetch(`${urlPrefix}/hdr?size=${totalSize}&mode=multi`);
            return { ok: response.ok, status: response.status };
        } catch {
            return { ok: false, status: -1 };
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'response total headers size', MAX_RESP);
    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Response Total Headers Size', result.totalTests, result.rejectionStatus);
    }

    _headerTestRunning = false;
    _setHeaderTestButtons(false);
}
