# 📲 Make it a *real* installable app on Android

Apps Script alone can't be "Installed" on Android (no manifest/service worker
allowed at `script.google.com`). This tiny **PWA shell** wraps your app so Chrome
shows **"Install app"** → standalone icon in your app drawer.

Your data stays private — the shell just loads your existing **"Only myself"** app
inside it. (iPhone already installs fine without this.)

## Files in this folder
- `index.html` — the shell (loads your app in a full-screen iframe)
- `manifest.webmanifest` — app name, colors, icons
- `sw.js` — service worker (what unlocks "Install app")
- `icon-192.png`, `icon-512.png` — app icons (white ₹ on indigo)
- `icon.svg` — source for the icons (not needed at runtime)

---

## Step 1 — Put your app URL in the shell
1. Open Apps Script editor → **Deploy ▸ Manage deployments** → copy the **Web app**
   URL (ends in **`/exec`**).
2. Open `index.html` here → find `PASTE_YOUR_EXEC_URL_HERE` → replace it with your
   `/exec` URL (keep the quotes). Save.

## Step 2 — Host the folder for free (HTTPS required)
Pick **one**:

### Option A — Netlify Drop (easiest, no coding)
1. Go to **app.netlify.com/drop**
2. Drag this entire **`pwa`** folder onto the page.
3. You instantly get a URL like `https://random-name.netlify.app`.
4. (Optional) Make a free account to keep the URL permanent + rename it.

### Option B — GitHub Pages
1. Create a free GitHub repo, upload the **contents** of this `pwa` folder.
2. Repo **Settings ▸ Pages ▸** Deploy from branch → `main` / root → Save.
3. Your URL: `https://<username>.github.io/<repo>/`.

## Step 3 — Install on your Pixel
1. Open the hosted URL in **Chrome** (make sure you're **signed into Google**).
2. Chrome menu **⋮ ▸ Install app** (or an "Install" prompt appears).
3. It lands in your app drawer as **Expenses**, opens **standalone** (no address bar). ✅

---

## Notes
- **Both hosts serve HTTPS** — required for the service worker / install.
- Stay **signed into Google in Chrome**; the embedded "Only myself" app needs it.
  (Google's login page can't be embedded, but you won't see it when already signed in.)
- Updating your app's code (in Apps Script) needs **no change here** — the shell
  always loads your latest `/exec`.
- To change the icon: edit `icon.svg`, then regenerate:
  `qlmanage -t -s 512 -o . icon.svg && mv icon.svg.png icon-512.png && sips -z 192 192 icon-512.png --out icon-192.png`
