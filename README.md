# Pinterest Pin Downloader

A Chrome extension for bulk downloading images from any Pinterest board or profile page. No account required, no external services — everything runs locally in your browser.

---

## Features

- **Quick Scan** — grabs all visible pin images instantly
- **Full Scroll mode** — auto-scrolls the page to lazy-load every pin, then collects them all
- **Upgrades image resolution** — rewrites Pinterest CDN URLs to fetch originals instead of thumbnails
- **No memory crashes** — downloads images one-by-one directly to disk via the Chrome Downloads API instead of buffering everything into a ZIP in memory
- **Organized output** — saves to anywhere in the downloads folder 
- **Preview strip** — shows a thumbnail preview of found images before downloading

---

## Installation

This extension is not on the Chrome Web Store. Load it manually as an unpacked extension:

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `pinterest-downloader` folder (the one containing `manifest.json`)

---

## Usage

1. Navigate to any Pinterest board, profile, or search results page
2. Click the extension icon in your toolbar
3. Choose a scan mode:
   - **Quick Scan** — fast, only picks up currently visible pins
   - **Full Scroll** — scrolls the page automatically to load all pins (slower but thorough)
4. Click **Scan for Pins**
5. Once images are found, click **Download All Images**
6. Files are saved to `Downloads/pintrestpin/` or any chosen directory in the downloads folder 

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the current Pinterest tab |
| `scripting` | Inject the content script to scan for pin images |
| `downloads` | Save images to disk |
| `storage` | Reserved for future settings |
| `https://www.pinterest.com/*` | Access Pinterest pages |
| `https://i.pinimg.com/*` | Fetch pin images directly from Pinterest's CDN |

No data is collected, transmitted, or stored outside your browser.

---

## How It Works

A content script (`content.js`) is injected into Pinterest pages. When you trigger a scan, it queries all `<img>` tags sourced from `pinimg.com`, deduplicates them, and rewrites CDN paths from thumbnail sizes (e.g. `/236x/`) to `/originals/` for maximum resolution. The popup then uses `chrome.downloads` to save each URL directly to disk — no fetching into memory, no ZIP building, no crashes.

---

## Limitations

- Only works on `pinterest.com` — does not support `pinterest.co.uk` or other regional domains
- Pinterest's infinite scroll means Quick Scan only captures what's currently rendered in the DOM; use Full Scroll for complete boards
- Some pins may fail to download if Pinterest rate-limits the requests — the extension will report how many succeeded vs failed

---
