// Shared infrastructure for size-limit tests (header-size, url-size, header-charset)

const SENSILLUM_MAX_HEADER_BYTES = 16 * 1024 * 1024;
const SENSILLUM_MAX_URI_BYTES = 65534;

// Binary search for maximum header/URL size.
// testFunction(size) must return { ok: bool, status: number|null }
async function binarySearchHeaderSize(testFunction, resultsDiv, testType) {
    let minSize = 0;
    let maxSize = SENSILLUM_MAX_HEADER_BYTES * 1.1;
    let maxWorkingSize = 0;
    let rejectionStatus = undefined; // HTTP status on first confirmed failure
    let iterations = 0;
    const maxIterations = 30;

    resultsDiv.innerHTML = `
                <div class="result-card">
                    <div style="font-weight: 600; color: #2d3436;">Searching for maximum ${testType}...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="size-progress" style="width: 0%"></div>
                    </div>
                    <div class="result-detail" id="size-status">Testing...</div>
                </div>
            `;

    const progressBar = document.getElementById('size-progress');
    const statusDiv = document.getElementById('size-status');

    try {
        let currentTestSize = 1024;
        statusDiv.textContent = 'Finding upper bound...';

        while (currentTestSize < maxSize) {
            const r = await testFunction(currentTestSize);
            if (!r.ok) {
                if (rejectionStatus === undefined) rejectionStatus = r.status;
                break;
            }
            maxWorkingSize = currentTestSize;
            currentTestSize *= 2;
            if (currentTestSize > maxSize) currentTestSize = maxSize;
            progressBar.style.width = '10%';
        }

        maxSize = currentTestSize;
        minSize = maxWorkingSize;

        while (minSize < maxSize - 1 && iterations < maxIterations) {
            const midSize = Math.floor((minSize + maxSize) / 2);
            iterations++;

            const progress = 10 + (iterations / maxIterations) * 90;
            progressBar.style.width = `${progress}%`;
            statusDiv.textContent = `Testing ${formatBytes(midSize)}... (iteration ${iterations}/${maxIterations})`;

            const r = await testFunction(midSize);
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
function formatRejectionStatus(status) {
    if (status === null) {
        return `<span style="color:#d63031;">🔌 Connection reset (no HTTP response)</span> — the server closed the connection without sending a status code.`;
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
    if (status >= 500) {
        return `<span style="color:#d63031;">❌ HTTP ${status}</span> — server error response rather than a proper rejection code.`;
    }
    return `<span style="color:#636e72;">HTTP ${status}</span>`;
}
