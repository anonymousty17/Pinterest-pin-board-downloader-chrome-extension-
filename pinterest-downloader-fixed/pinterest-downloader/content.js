// content.js — injected into pinterest.com pages

// Upgrades a Pinterest image URL to the highest available resolution
function upgradeToOriginal(url) {
  if (!url) return null;
  // Pinterest CDN pattern: .../236x/... or .../736x/... → .../originals/...
  return url.replace(/\/\d+x(\d+)?\//g, '/originals/');
}

// Collect all visible pin images on the page
function collectPinImages() {
  const results = [];
  const seen = new Set();

  // Primary: <img> tags inside pin containers
  const imgs = document.querySelectorAll('img[src*="pinimg.com"]');
  imgs.forEach(img => {
    const src = upgradeToOriginal(img.src || img.dataset.src);
    if (src && !seen.has(src)) {
      seen.add(src);
      const alt = img.alt || '';
      results.push({ url: src, alt });
    }
  });

  // Secondary: srcset attributes for higher-res versions
  document.querySelectorAll('img[srcset*="pinimg.com"]').forEach(img => {
    const srcset = img.srcset;
    const parts = srcset.split(',').map(s => s.trim().split(' ')[0]);
    parts.forEach(src => {
      const upgraded = upgradeToOriginal(src);
      if (upgraded && !seen.has(upgraded)) {
        seen.add(upgraded);
        results.push({ url: upgraded, alt: img.alt || '' });
      }
    });
  });

  return results;
}

// Auto-scroll to bottom to lazy-load all pins, then collect
async function scrollAndCollect(onProgress) {
  return new Promise((resolve) => {
    let lastHeight = 0;
    let stableCount = 0;
    const maxStable = 5;
    let iteration = 0;

    const interval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const newHeight = document.body.scrollHeight;

      iteration++;
      onProgress && onProgress(iteration);

      if (newHeight === lastHeight) {
        stableCount++;
      } else {
        stableCount = 0;
        lastHeight = newHeight;
      }

      if (stableCount >= maxStable) {
        clearInterval(interval);
        // Scroll back to top and collect
        window.scrollTo(0, 0);
        setTimeout(() => {
          resolve(collectPinImages());
        }, 800);
      }
    }, 900);
  });
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping') {
    sendResponse({ ok: true, url: window.location.href });
    return true;
  }

  if (msg.action === 'quickScan') {
    const images = collectPinImages();
    sendResponse({ images });
    return true;
  }

  if (msg.action === 'fullScan') {
    scrollAndCollect((iter) => {
      chrome.runtime.sendMessage({ action: 'scrollProgress', iteration: iter });
    }).then(images => {
      sendResponse({ images });
    });
    return true; // async
  }
});
