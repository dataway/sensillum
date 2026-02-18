// Run invalid character test
async function runInvalidCharacterTest() {
    const resultsDiv = document.getElementById('invalid-char-test-results');
    resultsDiv.innerHTML = '<div class="result-detail">Testing invalid characters in headers...</div>';

    // Test various invalid/control characters
    const testCases = [
        { name: 'Null byte (\\x00)', value: 'test\x00value', critical: true },
        { name: 'Carriage Return (\\r)', value: 'test\rvalue', critical: true },
        { name: 'Line Feed (\\n)', value: 'test\nvalue', critical: true },
        { name: 'CRLF injection', value: 'test\r\nInjected-Header: malicious', critical: true },
        { name: 'Vertical Tab (\\v)', value: 'test\vvalue', critical: false },
        { name: 'Form Feed (\\f)', value: 'test\fvalue', critical: false },
        { name: 'Bell (\\x07)', value: 'test\x07value', critical: false },
        { name: 'Backspace (\\x08)', value: 'test\x08value', critical: false },
        { name: 'DEL (\\x7F)', value: 'test\x7Fvalue', critical: false },
        { name: 'High ASCII (\\xFF)', value: 'test\xFFvalue', critical: false }
    ];

    const results = [];

    for (const testCase of testCases) {
        try {
            const response = await fetch(`${urlPrefix}/echo`, {
                headers: {
                    'X-Test-Invalid-Char': testCase.value
                }
            });

            const data = await response.json();
            const headerFound = data.headers['x-test-invalid-char'] !== undefined;

            results.push({
                name: testCase.name,
                allowed: headerFound,
                critical: testCase.critical,
                value: headerFound ? data.headers['x-test-invalid-char'] : null
            });
        } catch (error) {
            // Fetch API likely blocked this at the browser level
            results.push({
                name: testCase.name,
                allowed: false,
                critical: testCase.critical,
                blocked: true
            });
        }
    }

    // Display results
    const criticalResults = results.filter(r => r.critical);
    const otherResults = results.filter(r => !r.critical);

    const passCount = results.filter(r => !r.allowed).length;
    const warnCount = otherResults.filter(r => r.allowed).length;
    const failCount = criticalResults.filter(r => r.allowed).length;

    let resultHtml = '<div class="result-summary">';
    resultHtml += `✅ Blocked: ${passCount} | ⚠️ Warnings: ${warnCount} | ❌ Critical: ${failCount}`;
    resultHtml += '</div>';

    // Critical characters
    resultHtml += '<div class="result-category">Critical Characters (Header Injection Risk)</div>';
    criticalResults.forEach(result => {
        const status = result.allowed ? '❌ FAIL' : '✅ PASS';
        const statusClass = result.allowed ? 'fail' : 'success';
        resultHtml += `
                    <div class="result-detail">
                        <span class="${statusClass}">${status}</span> ${result.name}: 
                        ${result.allowed ? 'ALLOWED (Security Risk!)' : 'Blocked'}
                        ${result.blocked ? ' (by browser/fetch API)' : ''}
                    </div>
                `;
    });

    // Other control characters
    resultHtml += '<div class="result-category">Other Control Characters</div>';
    otherResults.forEach(result => {
        const status = result.allowed ? '⚠️ WARNING' : '✅ PASS';
        const statusClass = result.allowed ? 'warning' : 'success';
        resultHtml += `
                    <div class="result-detail">
                        <span class="${statusClass}">${status}</span> ${result.name}: 
                        ${result.allowed ? 'Allowed' : 'Blocked'}
                        ${result.blocked ? ' (by browser/fetch API)' : ''}
                    </div>
                `;
    });

    resultsDiv.innerHTML = resultHtml;
}
