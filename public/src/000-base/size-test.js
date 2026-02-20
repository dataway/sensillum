// Shared infrastructure for size-limit tests (header-size, url-size, header-charset)

const SENSILLUM_MAX_HEADER_BYTES = 16 * 1024 * 1024;
const SENSILLUM_MAX_URI_BYTES = 65534;

// Binary search for maximum header/URL size.
// testFunction(size) must return { ok: bool, status: number|null }
async function binarySearchHeaderSize(testFunction, resultsDiv, testType, maxBytes) {
    let minSize = 0;
    let maxSize = (maxBytes || SENSILLUM_MAX_HEADER_BYTES) * 1.1;
    let maxWorkingSize = 0;
    let rejectionStatus = undefined; // HTTP status on first confirmed failure
    let iterations = 0;
    const maxIterations = 30;

    resultsDiv.innerHTML = `
                <div class="result-card">
                    <div style="font-weight: 600; color: #2d3436;">Searching for maximum ${testType}...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="result-detail">Testing...</div>
                </div>
            `;

    const progressBar = resultsDiv.querySelector('.progress-fill');
    const statusDiv = resultsDiv.querySelector('.result-detail');

    // EMA bandwidth estimate in bytes/s. Seeded at 1 MB/s so the first timeout
    // is a reasonable ~5 s for a 1 MB initial probe, and at most 30 s.
    let bwEstimate = 1 * 1024 * 1024;
    const BW_ALPHA = 0.4; // EMA smoothing factor

    // Returns timeout in ms: 4× the expected round-trip, clamped to [2 s, 30 s].
    function adaptiveTimeout(size) {
        return Math.max(2000, Math.min(30000, Math.round(4000 * size / bwEstimate)));
    }

    // Update the EMA with a new measurement. Ignore sub-50 ms samples (noise / tiny sizes).
    function updateBandwidth(size, durationMs) {
        if (durationMs < 50) return;
        const sample = size / (durationMs / 1000);
        bwEstimate = BW_ALPHA * sample + (1 - BW_ALPHA) * bwEstimate;
    }

    function formatBandwidth(bps) {
        if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
        if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
        return `${bps.toFixed(0)} B/s`;
    }

    // Wraps a testFunction call: measures elapsed time, updates the bandwidth EMA,
    // and warns in statusDiv if the request stalls beyond the adaptive threshold.
    async function timedTest(size) {
        const timeout = adaptiveTimeout(size);
        let stalled = false;
        let stallTimer = setTimeout(() => {
            stalled = true;
            if (statusDiv) {
                statusDiv.innerHTML = `Testing ${formatBytes(size)}… <span style="color:#e17055;">⚠️ No response for ${(timeout / 1000).toFixed(0)} s — the connection may be stalled. Reload the page to cancel.</span>`;
            }
        }, timeout);
        const t0 = performance.now();
        try {
            const r = await testFunction(size);
            const elapsed = performance.now() - t0;
            clearTimeout(stallTimer);
            updateBandwidth(size, elapsed);
            return r;
        } catch (err) {
            clearTimeout(stallTimer);
            throw err;
        }
    }

    try {
        let currentTestSize = 1024;
        statusDiv.textContent = 'Finding upper bound...';

        while (currentTestSize < maxSize) {
            const r = await timedTest(currentTestSize);
            if (!r.ok) {
                if (rejectionStatus === undefined) rejectionStatus = r.status;
                break;
            }
            maxWorkingSize = currentTestSize;
            currentTestSize *= 2;
            if (currentTestSize > maxSize) currentTestSize = maxSize;
            progressBar.style.width = '10%';
            statusDiv.textContent = `Finding upper bound… estimated bandwidth: ${formatBandwidth(bwEstimate)}`;
        }

        maxSize = currentTestSize;
        minSize = maxWorkingSize;

        while (minSize < maxSize - 1 && iterations < maxIterations) {
            const midSize = Math.floor((minSize + maxSize) / 2);
            iterations++;

            const progress = 10 + (iterations / maxIterations) * 90;
            progressBar.style.width = `${progress}%`;
            statusDiv.textContent = `Testing ${formatBytes(midSize)}… iteration ${iterations}/${maxIterations}, ~${formatBandwidth(bwEstimate)}`;

            const r = await timedTest(midSize);
            if (r.ok) {
                minSize = midSize;
                maxWorkingSize = midSize;
            } else {
                if (rejectionStatus === undefined) rejectionStatus = r.status;
                maxSize = midSize;
            }
        }

        return {
            maxSize: maxWorkingSize,
            totalTests: iterations + Math.log2(maxWorkingSize / 1024),
            rejectionStatus,
        };

    } catch (err) {
        resultsDiv.innerHTML = `<p style="color: #d63031; text-align: center;">Test failed: ${escapeHtml(err.message)}</p>`;
        return null;
    }
}

// Format a rejection status code as a human-readable verdict
// isResponseTest: true when the test measures response headers (not request headers/URL),
// because a 502 Bad Gateway is the correct proxy behaviour in that direction.
function formatRejectionStatus(status, isResponseTest = false) {
    if (status === null) {
        return `<span style="color:#d63031;">🔌 Connection reset (no HTTP response)</span> — the server closed the connection without sending a status code.`;
    }
    if (status === -1) {
        return `<span style="color:#e17055;">🌐 Browser blocked the response</span> — the browser rejected the response before it arrived (e.g. Chrome's ~256 KB response-header limit). This is a browser constraint, not the proxy.`;
    }
    if (status === 414) {
        return `<span style="color:#00b894;">✅ HTTP 414 URI Too Long</span> — correct RFC 9110 response for oversized URLs.`;
    }
    if (status === 431) {
        return `<span style="color:#00b894;">✅ HTTP 431 Request Header Fields Too Large</span> — correct RFC 6585 response for oversized headers.`;
    }
    if (status >= 400 && status < 500) {
        return `<span style="color:#e17055;">⚠️ HTTP ${status}</span> — rejection with a non-standard 4xx code (expected 414 or 431).`;
    }
    if (status === 502 && isResponseTest) {
        return `<span style="color:#00b894;">✅ HTTP 502 Bad Gateway</span> — correct response per RFC 9110 §15.6.3; the proxy received an oversized (invalid) response from the upstream and could not relay it.`;
    }
    if (status === 503 && isResponseTest) {
        return `<span style="color:#e17055;">⚠️ HTTP 503 Service Unavailable</span> — seen in practice, but semantically imprecise per RFC 9110 §15.6.4 (503 means the proxy itself is overloaded, not that the upstream response was bad). 502 would be more accurate.`;
    }
    if (status >= 500) {
        return `<span style="color:#d63031;">❌ HTTP ${status}</span> — server error response rather than a proper rejection code.`;
    }
    return `<span style="color:#636e72;">HTTP ${status}</span>`;
}
