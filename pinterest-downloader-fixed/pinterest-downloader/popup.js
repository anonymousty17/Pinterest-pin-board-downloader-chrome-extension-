// popup.js

let foundImages = [];
let scanMode = 'quick';
let activeTabId = null;

const $ = id => document.getElementById(id);

// ── UI helpers ──────────────────────────────────────────────
function setDot(state) {
  const dot = $('statusDot');
  dot.className = 'status-dot ' + (state || '');
}

function showMsg(text, type = 'warn') {
  const box = $('msgBox');
  box.textContent = text;
  box.className = 'msg visible ' + type;
}

function hideMsg() { $('msgBox').className = 'msg'; }

function setProgress(visible, label = 'Scanning…', count = '—', pct = null) {
  const wrap = $('progressWrap');
  wrap.className = 'progress-wrap' + (visible ? ' visible' : '');
  $('progressLabel').textContent = label;
  $('progressCount').textContent = count;
  const fill = $('progressFill');
  if (pct !== null) {
    fill.className = 'progress-fill';
    fill.style.width = pct + '%';
  } else {
    fill.className = 'progress-fill indeterminate';
    fill.style.width = '';
  }
}

function showResults(images) {
  foundImages = images;
  $('resultsCount').textContent = images.length;
  const strip = $('previewStrip');
  strip.innerHTML = '';

  const preview = images.slice(0, 5);
  preview.forEach(img => {
    const el = document.createElement('img');
    el.className = 'preview-thumb';
    el.src = img.url;
    el.alt = img.alt || '';
    el.onerror = () => { el.style.display = 'none'; };
    strip.appendChild(el);
  });

  if (images.length > 5) {
    const more = document.createElement('div');
    more.className = 'preview-more';
    more.textContent = '+' + (images.length - 5);
    strip.appendChild(more);
  }

  $('resultsPanel').className = 'results visible';
}

// ── Init ────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  if (!tabs[0]) return;
  const tab = tabs[0];
  activeTabId = tab.id;
  const url = tab.url || '';

  if (!url.includes('pinterest.com')) {
    setDot('error');
    $('pageInfo').innerHTML = '⚠ Not on Pinterest';
    $('scanBtn').disabled = true;
    showMsg('Navigate to a Pinterest board or profile page first.', 'warn');
    return;
  }

  setDot('active');
  $('pageInfo').innerHTML = 'On Pinterest · <span>' + url.replace('https://www.pinterest.com', '') + '</span>';
});

// ── Mode toggle ─────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    scanMode = btn.dataset.mode;
  });
});

// ── Scroll progress from content script ─────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === 'scrollProgress') {
    setProgress(true, 'Scrolling page…', 'pass ' + msg.iteration);
  }
});

// ── Scan button ─────────────────────────────────────────────
$('scanBtn').addEventListener('click', () => {
  if (!activeTabId) return;
  hideMsg();
  $('resultsPanel').className = 'results';
  $('scanBtn').disabled = true;

  setProgress(true, scanMode === 'full' ? 'Scrolling to load pins…' : 'Scanning visible pins…');

  const action = scanMode === 'full' ? 'fullScan' : 'quickScan';

  chrome.tabs.sendMessage(activeTabId, { action }, response => {
    $('scanBtn').disabled = false;
    setProgress(false);

    if (chrome.runtime.lastError) {
      showMsg('Could not reach the page. Try refreshing Pinterest.', 'warn');
      return;
    }

    if (!response || !response.images) {
      showMsg('No response from page. Refresh and try again.', 'warn');
      return;
    }

    const images = response.images;
    if (images.length === 0) {
      showMsg('No pin images found on this page. Try scrolling down a bit first, or use Full Scroll mode.', 'warn');
      return;
    }

    showMsg(`Found ${images.length} images!`, 'info');
    showResults(images);
  });
});

// ── Download as ZIP ──────────────────────────────────────────
$('downloadBtn').addEventListener('click', async () => {
  if (!foundImages.length) return;

  const btn = $('downloadBtn');
  btn.disabled = true;
  hideMsg();

  const total = foundImages.length;
  let done = 0;
  let failed = 0;

  setProgress(true, 'Loading JSZip…', '—', null);

  // Load JSZip from bundled local file (MV3 blocks remote script injection)
  await new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(); return; }
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('jszip.min.js');
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const zip = new JSZip();
  const folder = zip.folder('pintrestpin');

  setProgress(true, 'Fetching images…', '0 / ' + total, 0);

  // Fetch images in batches of 8
  const BATCH = 8;
  for (let i = 0; i < total; i += BATCH) {
    const batch = foundImages.slice(i, i + BATCH);

    await Promise.all(batch.map(async (img, batchIdx) => {
      const idx = i + batchIdx + 1;
      const ext = img.url.split('?')[0].split('.').pop().replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const filename = `pin_${String(idx).padStart(4, '0')}.${ext}`;
      try {
        const res = await fetch(img.url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        folder.file(filename, blob);
      } catch {
        failed++;
      }
      done++;
      setProgress(true, 'Fetching images…', done + ' / ' + total, Math.round((done / total) * 100));
    }));
  }

  setProgress(true, 'Building ZIP…', '—', null);

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    meta => setProgress(true, 'Building ZIP…', Math.round(meta.percent) + '%', Math.round(meta.percent))
  );

  // Single save-as dialog
  const url = URL.createObjectURL(zipBlob);
  chrome.downloads.download({ url, filename: 'pintrestpin.zip', saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  setProgress(false);
  btn.disabled = false;
  btn.textContent = '✓ ZIP READY';
  showMsg(
    failed > 0
      ? `Zipped ${total - failed} images (${failed} failed to fetch).`
      : `All ${total} images packed into pintrestpin.zip`,
    'info'
  );
});
