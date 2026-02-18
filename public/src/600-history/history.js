function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
}

function addOrUpdateHistory(entry, isUpdate = false) {
    if (isUpdate && history.length > 0) {
        // Update the first entry
        history[0] = entry;
    } else if (entry.error) {
        // Find the first error entry of the same type (WS or SSE)
        const existingErrorIndex = history.findIndex(h => h.error && h.type === entry.type);
        if (existingErrorIndex !== -1) {
            // Replace the existing error of the same type
            history[existingErrorIndex] = entry;
        } else {
            // Add new error entry
            history.unshift(entry);
            if (history.length > 20) history.pop();
        }
    } else {
        history.unshift(entry);
        if (history.length > 20) history.pop(); // Keep last 20
    }
    renderHistory([wsManager.getCurrentEntry(), sseManager.getCurrentEntry()]);
}

function renderHistory(currentConnections) {
    const list = document.getElementById('history-list');
    if (history.length === 0 && currentConnections.every(c => !c)) {
        list.innerHTML = '<li style="color: #95a5a6; text-align: center;">No connections yet</li>';
        return;
    }

    const allEntries = [...currentConnections.filter(c => c), ...history];
    allEntries.sort((a, b) => b.timestamp - a.timestamp);

    list.innerHTML = allEntries.map(entry => {
        const className = entry.active ? 'success' : entry.error ? 'failure' : 'success';
        const statusClass = entry.active ? 'closed' : entry.error ? 'error' : 'closed';
        let statusText = entry.active ? 'Active' : entry.error ? `Error: ${entry.error}` : 'Closed normally';

        if (entry.error && entry.attempts > 1) {
            statusText += ` (${entry.attempts} attempts)`;
        }

        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const typeLabel = entry.type === 'SSE' ? 'SSE' : 'WS';
        const typeBadge = `<span style="background: ${entry.type === 'SSE' ? '#6c5ce7' : '#0984e3'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-left: 8px;">${typeLabel}</span>`;

        return `
                    <li class="history-item ${className}">
                        <div>
                            <span class="time">${timestamp}</span>
                            <span> - Connection #${entry.id}${typeBadge}</span>
                        </div>
                        <div>
                            <span class="duration">${formatDuration(entry.duration)}</span>
                            <span class="status ${statusClass}"> • ${statusText}</span>
                        </div>
                    </li>
                `;
    }).join('');
}
