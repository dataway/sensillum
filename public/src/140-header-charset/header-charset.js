// Header character tests — request (high-ASCII only) and response directions.
// Control characters (\x00, \r, \n, CRLF, etc.) are blocked by the browser's
// fetch API before leaving the machine; test those with curl (see CURL.md).

let charTestRunning = false;

function charOutcomeMeta(outcome) {
    switch (outcome) {
        case 'passed': return { icon: '⚠️', cls: 'warning', text: 'Not filtered' };
        case 'stripped': return { icon: '✅', cls: 'success', text: 'Stripped' };
        case 'modified': return { icon: '❓', cls: 'warning', text: 'Modified' };
        case 'browser-blocked': return { icon: '🌐', cls: '', text: 'Browser blocked' };
        case 'server-rejected': return { icon: 'ℹ️', cls: '', text: 'Not sendable by Hyper' };
        case 'error': return { icon: '❌', cls: 'fail', text: 'Error' };
        default: return { icon: '?', cls: '', text: outcome };
    }
}

function renderCharResults(title, rows) {
    let html = `<div class="result-card"><div style="font-weight:600;color:#2d3436;margin-bottom:10px;">${escapeHtml(title)}</div>`;
    for (const { label, outcome, detail } of rows) {
        const { icon, cls, text } = charOutcomeMeta(outcome);
        const clsAttr = cls ? ` class="${cls}"` : ' style="color:#636e72;"';
        html += `<div class="result-detail" style="margin-bottom:4px;">
            <span${clsAttr}>${icon} ${escapeHtml(text)}</span>
            — <strong>${escapeHtml(label)}</strong>: ${detail}
        </div>`;
    }
    html += '</div>';
    return html;
}

async function runCharTest() {
    if (charTestRunning) return;
    charTestRunning = true;
    const btn = document.getElementById('char-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
    const resultsDiv = document.getElementById('char-test-results');
    resultsDiv.innerHTML = '<div class="result-detail">Testing request headers…</div>';

    const reqBytes = [
        { hex: '09', label: '0x09 (HTAB)' },
        { hex: '80', label: '0x80 (first high-ASCII)' },
        { hex: 'a0', label: '0xA0 (Latin-1 non-breaking space)' },
        { hex: 'ff', label: '0xFF (highest byte)' },
    ];

    const reqRows = [];
    for (const { hex, label } of reqBytes) {
        const byte = parseInt(hex, 16);
        const value = 'probe' + String.fromCharCode(byte) + 'probe';
        let outcome, detail;
        try {
            const response = await fetch(`${urlPrefix}/echo`, {
                headers: { 'X-Test-Char': value }
            });
            const data = await response.json();
            const hdr = data.headers?.['x-test-char'];
            if (hdr === undefined || hdr === null) {
                outcome = 'stripped';
                detail = 'Header absent in echo — proxy stripped it before reaching Sensillum';
            } else if (typeof hdr === 'object' && hdr.binary) {
                // Non-UTF-8 bytes: short headers include a data array for per-byte inspection.
                const receivedByte = Array.isArray(hdr.data) ? hdr.data[5] : undefined;
                if (receivedByte === parseInt(hex, 16)) {
                    outcome = 'passed';
                    detail = 'Byte arrived at Sensillum intact.';
                } else if (receivedByte !== undefined) {
                    outcome = 'modified';
                    const gotCode = byteHex(receivedByte);
                    detail = `Proxy forwarded the header but altered the byte: expected 0x${hex.toUpperCase()}, got ${gotCode}.`;
                } else {
                    // data array absent means the header exceeded 16 bytes.
                    // Our probe is 11 bytes, so the proxy must have grown it.
                    outcome = 'modified';
                    detail = 'Header arrived but is longer than expected — the proxy may have appended data. Use curl for per-byte inspection.';
                }
            } else if (typeof hdr === 'string' && hdr.length > 5 && hdr.charCodeAt(5) === byte) {
                outcome = 'passed';
                detail = 'Byte arrived at Sensillum intact.';
            } else {
                outcome = 'modified';
                const gotCode = typeof hdr === 'string' && hdr.length > 5
                    ? byteHex(hdr.charCodeAt(5))
                    : `(unexpected value: ${escapeHtml(JSON.stringify(hdr))})`;
                detail = `Proxy forwarded the header but altered the byte: expected ${byteHex(byte)}, got ${gotCode}.`;
            }
        } catch (err) {
            outcome = 'browser-blocked';
            detail = `Browser refused to send: ${escapeHtml(err.message)}`;
        }
        reqRows.push({ label, outcome, detail });
    }

    resultsDiv.innerHTML =
        renderCharResults('Request Header — High-ASCII bytes', reqRows);

    const respBytes = [
        { hex: '09', label: '0x09 (HTAB)' },
        { hex: '80', label: '0x80 (first high-ASCII)' },
        { hex: 'a0', label: '0xA0 (Latin-1 non-breaking space)' },
        { hex: 'e9', label: '0xE9 (Latin-1 é)' },
        { hex: 'fe', label: '0xFE' },
        { hex: 'ff', label: '0xFF (highest byte)' },
    ];

    const respRows = [];
    for (const { hex, label } of respBytes) {
        const expectedByte = parseInt(hex, 16);
        let outcome, detail;
        try {
            const response = await fetch(`${urlPrefix}/hdr?byte=${hex}`);
            const data = await response.json();
            if (!data.ok) {
                outcome = 'server-rejected';
                detail = `Hyper cannot place this byte in a header (${escapeHtml(data.reason)}). Only bytes 0x09 and 0x20–0xFF are valid in HTTP response headers per RFC 9110.`;
            } else {
                const hv = response.headers.get('x-charset-test');
                if (hv === null) {
                    outcome = 'stripped';
                    detail = 'Proxy stripped the <code>x-charset-test</code> response header entirely.';
                } else if (hv.length === 11 && hv.charCodeAt(5) === expectedByte) {
                    outcome = 'passed';
                    detail = `Byte ${byteHex(expectedByte)} arrived in the response header intact.`;
                } else {
                    const gotCode = hv.length > 5 ? byteHex(hv.charCodeAt(5)) : '(header too short)';
                    outcome = 'modified';
                    detail = `Header present but byte was altered: expected ${byteHex(expectedByte)}, got ${escapeHtml(gotCode)} (header length: ${hv.length}).`;
                }
            }
        } catch (err) {
            outcome = 'error';
            detail = `Fetch failed — proxy may have blocked the response entirely: ${escapeHtml(err.message)}`;
        }
        respRows.push({ label, outcome, detail });
    }

    const placeholder = resultsDiv.querySelector('.result-detail:last-child');
    if (placeholder) placeholder.remove();
    resultsDiv.insertAdjacentHTML('beforeend', renderCharResults('Response Header — High-ASCII bytes', respRows));

    charTestRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Run Test'; }
}
