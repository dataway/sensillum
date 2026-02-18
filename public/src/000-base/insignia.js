// Generate a visual insignia from hash bytes
function generateInsignia(hashArray) {
    // Determine number of bars (2-6) from first byte
    const numBars = 2 + (hashArray[0] % 5);

    const bars = [];
    let lastHue = -120; // Start offset to ensure first bar contrasts well

    for (let i = 0; i < numBars; i++) {
        const offset = i * 4;

        // Get base hue from hash
        const baseHue = (hashArray[offset] + (hashArray[offset + 1] << 8)) % 360;

        // Ensure at least 90 degrees separation from previous bar for good contrast
        let hue = baseHue;
        const diff = Math.abs((hue - lastHue + 360) % 360);
        if (diff < 90) {
            hue = (lastHue + 120 + (hashArray[offset + 2] % 90)) % 360;
        }
        lastHue = hue;

        const saturation = 65 + (hashArray[offset + 2] % 30);
        const lightness = 45 + (hashArray[offset + 3] % 25);

        // Width varies from 4px to 14px based on hash
        const width = 4 + (hashArray[numBars + i] % 11);

        bars.push({ color: `hsl(${hue}, ${saturation}%, ${lightness}%)`, width });
    }

    let html = '<div style="display: inline-flex; gap: 0px; margin-right: 10px; vertical-align: middle; height: 16px;">';
    bars.forEach(bar => {
        html += `<div style="width: ${bar.width}px; height: 16px; background: ${bar.color};"></div>`;
    });
    html += '</div>';

    return html;
}