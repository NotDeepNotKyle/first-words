# First Words

A tiny, private, offline-capable web app (PWA) for recording the words your little one says,
so years from now you can hear exactly how she said “dada”, “elephant”, “bottle”…

- Tap the big button, she says the word, save it with the word, date/time (editable) and an optional note.
- Each recording shows her age at the time (e.g. `1y 3m`) based on the birthday in Settings.
- Record as many takes of a word as you like; the **Words** tab groups them oldest to newest so you can hear it change.
- The **Timeline** tab shows everything by month. Both tabs can be searched/filtered.
- Everything is stored **only on the device** (IndexedDB). Nothing is uploaded anywhere.

## Backups (important!)
Settings (gear icon) → **Back up now** makes one `.zip` containing:
- `audio/0001_2025-12-28_dada.m4a` … every recording as a normal audio file
- `data.json` with words, dates, ages, notes (used for restore)
- `README.txt`, a human-readable list

Save it to iCloud Drive / Google Drive / email. **Restore…** in Settings imports it again (duplicates are skipped).
The app shows a reminder banner when recordings haven't been backed up.

## Hosting
No build step and no backend: just static files. The microphone requires **HTTPS**, so host it on any
static HTTPS host, for example:

- **GitHub Pages**: push this folder to a repo → Settings → Pages → deploy from branch (root). Open `https://<user>.github.io/<repo>/`.
- Netlify / Cloudflare Pages / Vercel: drag-and-drop this folder.

Then on iPhone: open the URL in Safari → Share → **Add to Home Screen**. On Android: Chrome → **Install app**.

Local testing: `python3 -m http.server 8000` and open `http://localhost:8000` (localhost counts as secure).

When you change `index.html`, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Files
- `index.html`: the whole app (HTML + CSS + JS, no dependencies)
- `sw.js`: service worker (offline cache)
- `manifest.json` + `icons/`: install metadata and icons
