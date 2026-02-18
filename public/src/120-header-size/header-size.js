// Single Header Size Limit Test
async function runSingleHeaderSizeTest() {
    const button = document.getElementById('single-header-test-btn');
    const resultsDiv = document.getElementById('size-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';

    // Helper function to test if a header of a given size works
    async function testSize(size) {
        const headerValue = 'x'.repeat(size);
        try {
            const response = await fetch(`${urlPrefix}/echo`, {
                headers: {
                    'X-Test-Header': headerValue
                }
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            // Verify the header was received
            return data.headers && data.headers['x-test-header'] === headerValue;
        } catch (err) {
            return false;
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'single header value');

    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Single Header Value', result.totalTests);
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

    // Helper function to test if headers totaling a given size work
    async function testSize(totalSize) {
        // Distribute the total size across multiple headers (10 headers)
        const numHeaders = 10;
        const sizePerHeader = Math.floor(totalSize / numHeaders);
        const headerValue = 'x'.repeat(sizePerHeader);

        const headers = {};
        for (let i = 0; i < numHeaders; i++) {
            headers[`X-Test-Header-${i}`] = headerValue;
        }

        try {
            const response = await fetch(`${urlPrefix}/echo`, { headers });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            // Verify at least one header was received
            return data.headers && data.headers['x-test-header-0'] === headerValue;
        } catch (err) {
            return false;
        }
    }

    const result = await binarySearchHeaderSize(testSize, resultsDiv, 'total headers size');

    if (result) {
        displayHeaderSizeResult(resultsDiv, result.maxSize, 'Total Headers Size', result.totalTests);
    }

    button.disabled = false;
    button.textContent = 'Total Headers';
}

// Binary search for maximum header size
async function binarySearchHeaderSize(testFunction, resultsDiv, testType) {
    let minSize = 0;
    let maxSize = 1024 * 1024; // Start with 1MB max
    let maxWorkingSize = 0;
    let iterations = 0;
    const maxIterations = 20;

    resultsDiv.innerHTML = `
                <div class="size-result">
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
        // First, quickly find the upper bound by exponential growth
        let currentTestSize = 1024; // Start with 1KB
        statusDiv.textContent = 'Finding upper bound...';

        while (await testFunction(currentTestSize) && currentTestSize < maxSize) {
            maxWorkingSize = currentTestSize;
            currentTestSize *= 2;
            progressBar.style.width = '10%';
        }

        maxSize = currentTestSize;
        minSize = maxWorkingSize;

        // Binary search for exact limit
        while (minSize < maxSize - 1 && iterations < maxIterations) {
            const midSize = Math.floor((minSize + maxSize) / 2);
            iterations++;

            const progress = 10 + (iterations / maxIterations) * 90;
            progressBar.style.width = `${progress}%`;
            statusDiv.textContent = `Testing ${formatBytes(midSize)}... (iteration ${iterations}/${maxIterations})`;

            const works = await testFunction(midSize);

            if (works) {
                minSize = midSize;
                maxWorkingSize = midSize;
            } else {
                maxSize = midSize;
            }
        }

        return { maxSize: maxWorkingSize, totalTests: iterations + Math.log2(maxWorkingSize / 1024) };

    } catch (err) {
        resultsDiv.innerHTML = `<p style="color: #d63031; text-align: center;">Test failed: ${escapeHtml(err.message)}</p>`;
        return null;
    }
}

// Display header size test result
function displayHeaderSizeResult(resultsDiv, maxSize, testType, totalTests) {
    let resultHtml = `
                <div class="size-result">
                    <div style="font-weight: 600; color: #2d3436; margin-bottom: 10px;">Maximum ${testType}</div>
                    <div class="result-value">${formatBytes(maxSize)}</div>
                    <div class="result-detail">
                        📊 ${maxSize.toLocaleString()} bytes (tested in ${Math.ceil(totalTests)} requests)
                    </div>
                    <div class="result-detail" style="margin-top: 10px;">
                        ${getHeaderSizeRecommendation(maxSize)}
                    </div>
                </div>
            `;

    resultsDiv.innerHTML = resultHtml;
}

// Helper function to provide recommendations based on header size
function getHeaderSizeRecommendation(size) {
    if (size < 4096) {
        return '❌ Very restrictive. Will likely break modern authentication (OIDC/OAuth2 with JWTs).';
    } else if (size < 16384) {
        return '⚠️ Minimal limit. May work for simple apps but insufficient for complex OIDC scenarios.';
    } else if (size < 65536) {
        return '✅ Good for most applications. Handles typical OIDC/OAuth2 authentication flows.';
    } else if (size < 131072) {
        return '✅ Generous limit. Accommodates complex OIDC scenarios with multiple tokens.';
    } else if (size < 524288) {
        return '⚠️ Very large limit (common for complex OIDC setups). Monitor for potential abuse.';
    } else {
        return '⚠️ Extremely large limit. May indicate misconfiguration or potential DoS risk. Review if necessary.';
    }
}
