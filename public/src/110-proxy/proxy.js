async function runProxySecurityTest() {
    const button = document.getElementById('proxy-test-btn');
    const resultsDiv = document.getElementById('proxy-test-results');

    button.disabled = true;
    button.textContent = 'Testing...';
    resultsDiv.innerHTML = '<p style="color: #95a5a6; text-align: center;">Running security tests...</p>';

    // Headers that should be stripped by a proper reverse proxy
    // Format: [spoofed value, category, shouldProxySet]
    // shouldProxySet: true = proxy should replace with real value, false = proxy should strip entirely
    const testHeaders = {
        // Critical - highest security impact
        'X-Forwarded-For': ['192.0.2.1, 198.51.100.1', 'critical', true],

        // Common - frequently used, important
        'X-Real-IP': ['192.0.2.2', 'common', true],
        'X-Forwarded-Host': ['evil.example.com', 'common', true],
        'X-Forwarded-Proto': ['fake-https', 'common', true],
        'Forwarded': ['for=192.0.2.60;proto=http;by=203.0.113.43', 'common', true],
        'CF-Connecting-IP': ['192.0.2.10', 'common', true],
        'True-Client-IP': ['192.0.2.11', 'common', true],
        'Fastly-Client-IP': ['192.0.2.20', 'common', true],
        'CloudFront-Viewer-Address': ['192.0.2.30:443', 'common', true],

        // Uncommon - less frequently used or CDN-specific
        'X-Client-IP': ['192.0.2.3', 'uncommon', true],
        'X-Forwarded-Server': ['evil-server', 'uncommon', true],
        'X-Forwarded-Port': ['65537', 'uncommon', true],
        'X-Forwarded-Scheme': ['fake-https', 'uncommon', true],
        'X-Original-URL': ['/admin/secret', 'uncommon', false],
        'X-Rewrite-URL': ['/admin/secret', 'uncommon', false],
        'X-Host': ['malicious.example.com', 'uncommon', true],
        'X-ProxyUser-Ip': ['192.0.2.4', 'uncommon', true],
        'Client-IP': ['192.0.2.5', 'uncommon', true],
        'X-Cluster-Client-IP': ['192.0.2.6', 'uncommon', true],
        'CF-IPCountry': ['XX', 'uncommon', true],
        'CF-Ray': ['fake-ray-id', 'uncommon', true],
        'CF-Visitor': ['{"scheme":"fake-https"}', 'uncommon', true],
        'CF-Pseudo-IPv4': ['192.0.2.12', 'uncommon', true],
        'Fastly-SSL': ['65537', 'uncommon', true],
        'Akamai-Origin-Hop': ['65537', 'uncommon', true],
        'CloudFront-Viewer-Country': ['XX', 'uncommon', true],
        'X-Azure-ClientIP': ['192.0.2.40', 'uncommon', true],
        'X-Azure-SocketIP': ['192.0.2.41', 'uncommon', true],
        'X-HTTP-Method-Override': ['DELETE', 'uncommon', false],
        'X-Original-Method': ['DELETE', 'uncommon', false]
    };

    try {
        // Make one request per header to avoid CDNs (e.g. CloudFlare) acting on
        // headers like X-Forwarded-Host and blocking the entire request.
        const perHeaderResults = {};
        let completed = 0;
        const total = Object.keys(testHeaders).length;

        for (const [name, [value, category, shouldProxySet]] of Object.entries(testHeaders)) {
            button.textContent = `Testing… (${completed}/${total})`;
            try {
                const response = await fetch(`${urlPrefix}/echo`, {
                    headers: { [name]: value }
                });
                const data = await response.json();
                perHeaderResults[name] = data.headers || {};
            } catch (_) {
                // Treat a blocked/failed request as if the header passed through
                perHeaderResults[name] = { [name.toLowerCase()]: value };
            }
            completed++;
        }

        // Analyze results
        const results = {
            critical: [],
            common: [],
            uncommon: []
        };

        for (const [headerName, [spoofedValue, category, shouldProxySet]] of Object.entries(testHeaders)) {
            const normalizedName = headerName.toLowerCase();
            const receivedValue = (perHeaderResults[headerName] || {})[normalizedName];

            let status, detail, emoji;

            if (!receivedValue) {
                // Header was stripped - GOOD
                status = 'pass';
                emoji = '✅';
                detail = shouldProxySet
                    ? 'Header stripped (proxy may set it elsewhere)'
                    : 'Header correctly stripped by proxy';
            } else if (receivedValue === spoofedValue) {
                // Spoofed value made it through - BAD
                status = 'fail';
                emoji = '❌';
                detail = `SECURITY ISSUE: Spoofed value passed through: ${escapeHtml(receivedValue)}`;
            } else {
                // Header present but with different value
                if (shouldProxySet) {
                    // This is GOOD - proxy set the real value
                    status = 'pass';
                    emoji = '✅';
                    detail = `Proxy correctly set value: ${escapeHtml(receivedValue)}`;
                } else {
                    // This is suspicious - why is this header here?
                    status = 'warning';
                    emoji = '⚠️';
                    detail = `Unexpected: Proxy set value: ${escapeHtml(receivedValue)}`;
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

        // Display detailed results
        let html = '';

        // Helper function to render a category section
        const renderCategory = (category, title) => {
            const categoryResults = results[category];
            if (categoryResults.length === 0) return '';

            let section = `<div style="margin-top: 20px; margin-bottom: 10px; padding: 8px 12px; background: #e0e0e0; border-radius: 4px; font-weight: 600; color: #2d3436;">${title}</div>`;

            for (const result of categoryResults) {
                section += `<div class="test-result ${result.status}"><span class="test-name">${result.emoji} ${escapeHtml(result.name)}</span><span class="test-detail">${result.detail}</span></div>`;
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
