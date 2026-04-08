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
      showMsg('No pin images found. Try scrolling down first, or use Full Scroll mode.', 'warn');
      return;
    }

    showMsg('Found ' + images.length + ' images!', 'info');
    showResults(images);
  });
});

// ── Download images one-by-one (no ZIP = no memory crash) ────
$('downloadBtn').addEventListener('click', async () => {
  if (!foundImages.length) return;

  const btn = $('downloadBtn');
  btn.disabled = true;
  hideMsg();

  const total = foundImages.length;
  let done = 0;
  let failed = 0;

  setProgress(true, 'Downloading…', '0 / ' + total, 0);

  for (let i = 0; i < total; i++) {
    const img = foundImages[i];
    const ext = img.url.split('?')[0].split('.').pop().replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const filename = 'pintrestpin/pin_' + String(i + 1).padStart(4, '0') + '.' + ext;

    await new Promise(resolve => {
      chrome.downloads.download({ url: img.url, filename: filename, saveAs: false }, dlId => {
        if (chrome.runtime.lastError || dlId === undefined) failed++;
        resolve();
      });
    });

    done++;
    setProgress(true, 'Downloading…', done + ' / ' + total, Math.round((done / total) * 100));
  }

  setProgress(false);
  btn.disabled = false;
  btn.textContent = '✓ DONE';
  showMsg(
    failed > 0
      ? 'Downloaded ' + (total - failed) + ' images (' + failed + ' failed). Check Downloads/pintrestpin/'
      : 'All ' + total + ' images saved to Downloads/pintrestpin/',
    'info'
  );
});
