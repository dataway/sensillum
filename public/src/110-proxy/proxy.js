async function runProxySecurityTest() {
    const button = document.getElementById('proxy-test-btn');
    const resultsDiv = document.getElementById('proxy-test-results');
    const summaryDiv = document.getElementById('proxy-test-summary');
    const summaryContent = document.getElementById('test-summary');

    button.disabled = true;
    button.textContent = 'Testing...';
    resultsDiv.innerHTML = '<p style="color: #95a5a6; text-align: center;">Running security tests...</p>';
    summaryDiv.style.display = 'none';

    // Headers that should be stripped by a proper reverse proxy
    // Format: [spoofed value, category, shouldProxySet]
    // shouldProxySet: true = proxy should replace with real value, false = proxy should strip entirely
    const testHeaders = {
        // Critical - highest security impact
        'X-Forwarded-For': ['192.0.2.1, 198.51.100.1', 'critical', true],

        // Common - frequently used, important
        'X-Real-IP': ['192.0.2.2', 'common', true],
        'X-Forwarded-Host': ['evil.example.com', 'common', true],
        'X-Forwarded-Proto': ['https', 'common', true],
        'Forwarded': ['for=192.0.2.60;proto=http;by=203.0.113.43', 'common', true],
        'CF-Connecting-IP': ['192.0.2.10', 'common', true],
        'True-Client-IP': ['192.0.2.11', 'common', true],
        'Fastly-Client-IP': ['192.0.2.20', 'common', true],
        'CloudFront-Viewer-Address': ['192.0.2.30:443', 'common', true],

        // Uncommon - less frequently used or CDN-specific
        'X-Client-IP': ['192.0.2.3', 'uncommon', true],
        'X-Forwarded-Server': ['evil-server', 'uncommon', true],
        'X-Forwarded-Port': ['8443', 'uncommon', true],
        'X-Forwarded-Scheme': ['https', 'uncommon', true],
        'X-Original-URL': ['/admin/secret', 'uncommon', false],
        'X-Rewrite-URL': ['/admin/secret', 'uncommon', false],
        'X-Host': ['malicious.example.com', 'uncommon', true],
        'X-ProxyUser-Ip': ['192.0.2.4', 'uncommon', true],
        'Client-IP': ['192.0.2.5', 'uncommon', true],
        'X-Cluster-Client-IP': ['192.0.2.6', 'uncommon', true],
        'CF-IPCountry': ['XX', 'uncommon', true],
        'CF-Ray': ['fake-ray-id', 'uncommon', true],
        'CF-Visitor': ['{"scheme":"https"}', 'uncommon', true],
        'CF-Pseudo-IPv4': ['192.0.2.12', 'uncommon', true],
        'Fastly-SSL': ['1', 'uncommon', true],
        'Akamai-Origin-Hop': ['1', 'uncommon', true],
        'CloudFront-Viewer-Country': ['XX', 'uncommon', true],
        'X-Azure-ClientIP': ['192.0.2.40', 'uncommon', true],
        'X-Azure-SocketIP': ['192.0.2.41', 'uncommon', true],
        'X-HTTP-Method-Override': ['DELETE', 'uncommon', false],
        'X-Original-Method': ['DELETE', 'uncommon', false]
    };

    try {
        // Make request with test headers
        const headersToSend = {};
        for (const [name, [value, _, __]] of Object.entries(testHeaders)) {
            headersToSend[name] = value;
        }

        const response = await fetch(`${urlPrefix}/echo`, {
            headers: headersToSend
        });

        const data = await response.json();
        const receivedHeaders = data.headers || {};

        // Analyze results
        const results = {
            critical: [],
            common: [],
            uncommon: []
        };

        const counts = {
            critical: { pass: 0, warning: 0, fail: 0 },
            common: { pass: 0, warning: 0, fail: 0 },
            uncommon: { pass: 0, warning: 0, fail: 0 }
        };

        for (const [headerName, [spoofedValue, category, shouldProxySet]] of Object.entries(testHeaders)) {
            const normalizedName = headerName.toLowerCase();
            const receivedValue = receivedHeaders[normalizedName];

            let status, detail, emoji;

            if (!receivedValue) {
                // Header was stripped - GOOD
                status = 'pass';
                emoji = '✅';
                detail = shouldProxySet
                    ? 'Header stripped (proxy may set it elsewhere)'
                    : 'Header correctly stripped by proxy';
                counts[category].pass++;
            } else if (receivedValue === spoofedValue) {
                // Spoofed value made it through - BAD
                status = 'fail';
                emoji = '❌';
                detail = `SECURITY ISSUE: Spoofed value passed through: ${escapeHtml(receivedValue)}`;
                counts[category].fail++;
            } else {
                // Header present but with different value
                if (shouldProxySet) {
                    // This is GOOD - proxy set the real value
                    status = 'pass';
                    emoji = '✅';
                    detail = `Proxy correctly set value: ${escapeHtml(receivedValue)}`;
                    counts[category].pass++;
                } else {
                    // This is suspicious - why is this header here?
                    status = 'warning';
                    emoji = '⚠️';
                    detail = `Unexpected: Proxy set value: ${escapeHtml(receivedValue)}`;
                    counts[category].warning++;
                }
            }

            results[category].push({
                name: headerName,
                status,
                emoji,
                detail
            });
        }

        // Sort results within each category alphabetically
        for (const category of ['critical', 'common', 'uncommon']) {
            results[category].sort((a, b) => a.name.localeCompare(b.name));
        }

        // Calculate totals
        const totalPass = counts.critical.pass + counts.common.pass + counts.uncommon.pass;
        const totalWarning = counts.critical.warning + counts.common.warning + counts.uncommon.warning;
        const totalFail = counts.critical.fail + counts.common.fail + counts.uncommon.fail;

        // Display summary
        summaryContent.innerHTML = `
                    <div class="test-stat pass">
                        <div class="count">${totalPass}</div>
                        <div class="label">Passed</div>
                    </div>
                    <div class="test-stat warning">
                        <div class="count">${totalWarning}</div>
                        <div class="label">Warnings</div>
                    </div>
                    <div class="test-stat fail">
                        <div class="count">${totalFail}</div>
                        <div class="label">Failed</div>
                    </div>
                `;
        summaryDiv.style.display = 'block';

        // Display detailed results
        let html = '';

        // Helper function to render a category section
        const renderCategory = (category, title) => {
            const categoryResults = results[category];
            if (categoryResults.length === 0) return '';

            const categoryTotal = counts[category].pass + counts[category].warning + counts[category].fail;
            const categorySummary = `${counts[category].pass}✅ ${counts[category].warning}⚠️ ${counts[category].fail}❌`;

            let section = `
                        <div style="margin-top: 20px; margin-bottom: 10px; padding: 8px 12px; background: #e0e0e0; border-radius: 4px; font-weight: 600; color: #2d3436;">
                            ${title} (${categoryTotal} headers) — ${categorySummary}
                        </div>
                    `;

            for (const result of categoryResults) {
                section += `
                            <div class="test-result ${result.status}">
                                <div class="test-name">${result.emoji} ${escapeHtml(result.name)}</div>
                                <div class="test-detail">${result.detail}</div>
                            </div>
                        `;
            }

            return section;
        };

        html += renderCategory('critical', '🔴 Critical Headers');
        html += renderCategory('common', '🟡 Common Headers');
        html += renderCategory('uncommon', '🟢 Uncommon Headers');

        resultsDiv.innerHTML = html;

    } catch (err) {
        resultsDiv.innerHTML = `<p style="color: #d63031; text-align: center;">Test failed: ${escapeHtml(err.message)}</p>`;
    }

    button.disabled = false;
    button.textContent = 'Run Test';
}
