// Display initial server info from page load if available
if (window.initialServerInfo) {
    displayServerInfo(window.initialServerInfo, 'html-headers-content');
}

// Auto-run the load balancer test on page load
runLoadBalancerTest();

// Start WebSocket and SSE connections
wsManager.connect();
sseManager.connect();
