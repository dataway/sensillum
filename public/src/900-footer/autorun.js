// Display initial server info from page load if available
if (window.initialServerInfo) {
    const protocol = detectHttpProtocol();
    if (protocol) {
        window.initialServerInfo.httpProtocol = protocol;
    }
    displayServerInfo(window.initialServerInfo, 'html-headers-content');
}

// Auto-run the load balancer test on page load
runLoadBalancerTest();

// Start WebSocket and SSE connections
wsManager.connect();
sseManager.connect();
