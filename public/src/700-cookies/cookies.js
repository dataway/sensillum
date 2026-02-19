function parseCookieString(raw) {
    const map = new Map();
    if (!raw) return map;
    for (const pair of raw.split(';').map(s => s.trim()).filter(Boolean)) {
        const eqIdx = pair.indexOf('=');
        const name  = (eqIdx >= 0 ? pair.slice(0, eqIdx) : pair).trim();
        const value = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
        if (name) map.set(name, value);
    }
    return map;
}

// Mutable cache of server-visible cookies (includes HttpOnly).
// Populated from window.initialServerInfo on first render; updated locally
// after server-side deletions so we don't need a full page reload.
let serverCookiesCache = null;

function renderCookies() {
    const content = document.getElementById('cookie-viewer-content');
    const deleteAllBtn = document.getElementById('cookie-delete-all-btn');

    if (serverCookiesCache === null) {
        serverCookiesCache = parseCookieString(
            window.initialServerInfo?.headers?.cookie || ''
        );
    }

    // Live JS-accessible cookies (excludes HttpOnly)
    const jsCookies = parseCookieString(document.cookie);

    // Merge both sources; cookies in server set but not JS set are HttpOnly
    const allNames = new Set([...serverCookiesCache.keys(), ...jsCookies.keys()]);

    if (allNames.size === 0) {
        content.innerHTML = '<p style="color: #95a5a6; text-align: center;">No cookies set</p>';
        deleteAllBtn.style.display = 'none';
        return;
    }

    deleteAllBtn.style.display = '';

    let html = '';
    for (const name of allNames) {
        const isHttpOnly = serverCookiesCache.has(name) && !jsCookies.has(name);
        const value = jsCookies.get(name) ?? serverCookiesCache.get(name) ?? '';
        const badge = isHttpOnly
            ? `<span class="cookie-httponly-badge">HttpOnly</span>`
            : '';
        const deleteBtn = isHttpOnly
            ? `<button class="cookie-delete-btn" title="Delete HttpOnly cookie via server" onclick="deleteHttpOnlyCookie(${escapeHtml(JSON.stringify(name))})">✕</button>`
            : `<button class="cookie-delete-btn" title="Delete cookie" onclick="deleteCookie(${escapeHtml(JSON.stringify(name))})">✕</button>`;
        html += `<div class="cookie-row">` +
            `<span class="cookie-name">${escapeHtml(name)}</span>` +
            badge +
            `<span class="cookie-equals">=</span>` +
            `<span class="cookie-value">${escapeHtml(value)}</span>` +
            deleteBtn +
            `</div>`;
    }
    content.innerHTML = html;
}

function deleteCookie(name) {
    const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${name}=; ${expired}; path=/`;
    document.cookie = `${name}=; ${expired}; path=${location.pathname}`;
    if (serverCookiesCache) serverCookiesCache.delete(name);
    renderCookies();
}

async function deleteHttpOnlyCookie(name) {
    try {
        await fetch(`${urlPrefix}/delete-cookie?name=${encodeURIComponent(name)}`, { method: 'POST' });
    } catch (_) { /* best effort */ }
    if (serverCookiesCache) serverCookiesCache.delete(name);
    renderCookies();
}

function deleteAllCookies() {
    // JS-accessible cookies
    for (const pair of document.cookie.split(';').map(s => s.trim()).filter(Boolean)) {
        deleteCookie(pair.split('=')[0]);
    }
    // HttpOnly cookies via server
    const httpOnlyNames = serverCookiesCache
        ? [...serverCookiesCache.keys()].filter(n => !parseCookieString(document.cookie).has(n))
        : [];
    Promise.all(httpOnlyNames.map(name =>
        fetch(`${urlPrefix}/delete-cookie?name=${encodeURIComponent(name)}`, { method: 'POST' }).catch(() => {})
    )).then(() => {
        if (serverCookiesCache) httpOnlyNames.forEach(n => serverCookiesCache.delete(n));
        renderCookies();
    });
}

document.addEventListener('DOMContentLoaded', renderCookies);
