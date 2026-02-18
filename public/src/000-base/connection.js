function createConnectionManager(config) {
    let connectionId = 0;
    let currentConnectionEntry = null;
    let failureAttempts = 0;
    let everConnected = false;

    function connect() {
        const currentId = ++connectionId;
        const connection = config.createConnection();
        let start = Date.now();
        let timerInterval;
        let connectionOpened = false;

        const timer = document.getElementById(config.timerId);
        const statusBadge = document.getElementById(config.statusId);
        const statusText = statusBadge.querySelector('.status-text');
        const msg = document.getElementById(config.msgId);

        // Show connecting state
        statusText.innerText = "CONNECTING...";
        statusBadge.className = "status-badge dead";
        msg.innerText = `Attempting ${config.typeLabel} connection #${currentId}...`;

        const onOpen = () => {
            connectionOpened = true;
            everConnected = true;
            failureAttempts = 0;

            statusText.innerText = "CONNECTED";
            statusBadge.className = "status-badge live";
            msg.innerText = `${config.typeLabel} connected successfully`;

            currentConnectionEntry = {
                id: currentId,
                timestamp: start,
                duration: 0,
                active: true,
                type: config.type
            };
            config.updateHistory();

            timerInterval = setInterval(() => {
                const duration = Math.floor((Date.now() - start) / 1000);
                timer.innerText = duration + "s";
                if (currentConnectionEntry) {
                    currentConnectionEntry.duration = duration;
                    config.updateHistory();
                }
            }, 1000);
        };

        const onHeaders = (data) => {
            displayServerInfo(data, config.headersContentId);
            msg.innerText = "Headers received";
        };

        const onMessage = (text) => {
            msg.innerText = `Last: ${text}`;
        };

        const onError = () => {
            clearInterval(timerInterval);
            const duration = Math.floor((Date.now() - start) / 1000);

            if (connectionOpened) {
                // Connection was established and then closed
                statusText.innerText = "DISCONNECTED";
                statusBadge.className = "status-badge dead";
                msg.innerText = `Connection closed after ${formatDuration(duration)}. Reconnecting in 2s...`;

                if (currentConnectionEntry) {
                    currentConnectionEntry.duration = duration;
                    currentConnectionEntry.active = false;
                    history.unshift(currentConnectionEntry);
                    if (history.length > 20) history.pop();
                    currentConnectionEntry = null;
                    config.updateHistory();
                }
            } else {
                // Connection never opened
                if (everConnected) {
                    failureAttempts++;
                    statusText.innerText = "FAILED";
                    statusBadge.className = "status-badge dead";
                    msg.innerText = `Failed to reconnect (attempt #${currentId}). Retrying in 2s...`;

                    addOrUpdateHistory({
                        id: currentId,
                        timestamp: start,
                        duration: duration,
                        error: 'Failed to connect',
                        attempts: failureAttempts,
                        type: config.type
                    });
                } else {
                    statusText.innerText = "FAILED";
                    statusBadge.className = "status-badge dead";
                    msg.innerText = `Connection attempt #${currentId} failed. Retrying in 2s...`;
                }
            }

            timer.innerText = "0s";
            config.closeConnection(connection);
            setTimeout(connect, 2000);
        };

        config.setupHandlers(connection, { onOpen, onHeaders, onMessage, onError });
    }

    return { connect, getCurrentEntry: () => currentConnectionEntry };
}

// WebSocket manager
const wsManager = createConnectionManager({
    type: 'WebSocket',
    typeLabel: 'WebSocket',
    timerId: 'ws-timer',
    statusId: 'ws-status',
    msgId: 'ws-msg',
    headersContentId: 'ws-headers-content',
    createConnection: () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return new WebSocket(`${protocol}//${window.location.host}${urlPrefix}/ws`);
    },
    closeConnection: (ws) => { },  // WebSocket closes automatically
    updateHistory: () => renderHistory([wsManager.getCurrentEntry(), sseManager.getCurrentEntry()]),
    setupHandlers: (ws, callbacks) => {
        ws.onopen = callbacks.onOpen;
        ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'headers') {
                    callbacks.onHeaders(data);
                } else {
                    callbacks.onMessage(e.data);
                }
            } catch (err) {
                callbacks.onMessage(e.data);
            }
        };
        ws.onerror = () => { };
        ws.onclose = callbacks.onError;
    }
});

// SSE manager
const sseManager = createConnectionManager({
    type: 'SSE',
    typeLabel: 'SSE',
    timerId: 'sse-timer',
    statusId: 'sse-status',
    msgId: 'sse-msg',
    headersContentId: 'sse-headers-content',
    createConnection: () => {
        return new EventSource(`${urlPrefix}/sse`);
    },
    closeConnection: (es) => es.close(),
    updateHistory: () => renderHistory([wsManager.getCurrentEntry(), sseManager.getCurrentEntry()]),
    setupHandlers: (es, callbacks) => {
        es.onopen = callbacks.onOpen;
        es.addEventListener('headers', (e) => {
            try {
                const data = JSON.parse(e.data);
                callbacks.onHeaders(data);
            } catch (err) {
                console.error('SSE parse error:', err);
            }
        });
        es.onmessage = (e) => callbacks.onMessage(e.data);
        es.onerror = callbacks.onError;
    }
});
