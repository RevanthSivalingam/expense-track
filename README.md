# 💸 Expense Tracker — Setup Guide

A simple, free mobile expense tracker. Your **Google Sheet is the database**;
Google Apps Script serves the app. No hosting, no servers, no cost.

- **Today** screen — today's expenses + total; tap **"+ Add Expense"** (slide-up
  sheet, phone keyboard for the amount)
- **History** screen — browse older days with a ◀ month ▶ picker, grouped by day
- **Report** — Month & Year pie + bar charts (₹ INR)
- **Categories** — add / delete anytime
- Add to your phone's home screen → feels like an app

---

## What you'll paste

| This file (here in VS Code) | → Apps Script editor file |
|---|---|
| `Code.gs`          | `Code.gs`          |
| `Index.html`       | `Index.html`       |
| `Styles.html`      | `Styles.html`      |
| `JavaScript.html`  | `JavaScript.html`  |
| `appsscript.json`  | `appsscript.json` (via Project Settings) |

---

## Step-by-step

### 1. Create the Sheet + script
1. Go to **[sheets.new](https://sheets.new)** → name it e.g. *"My Expenses"*.
2. Menu: **Extensions ▸ Apps Script**. A code editor opens (this is your project).

### 2. Add the 4 code files
In the Apps Script editor, left sidebar has a **Files** list with one file (`Code.gs`).

1. **`Code.gs`** — click it, select all (Cmd+A), delete, then paste the full contents of `Code.gs` from this folder.
2. Click **＋ (Add a file) ▸ HTML**, name it exactly **`Index`** → paste `Index.html` contents.
3. Add HTML file **`Styles`** → paste `Styles.html` contents.
4. Add HTML file **`JavaScript`** → paste `JavaScript.html` contents.

> ⚠️ Name the HTML files **without** `.html` (the editor adds it). They must be `Index`, `Styles`, `JavaScript` — the code references those names.

### 3. Set the manifest
1. Left sidebar: **⚙ Project Settings**.
2. Check **"Show 'appsscript.json' manifest file in editor"**.
3. Back in the editor, open **`appsscript.json`** → replace its contents with `appsscript.json` from this folder. **Save** (Cmd+S).

### 4. First run = authorize + build the Sheet tabs
1. In the editor toolbar, pick the function **`doGet`** in the dropdown → click **Run**.
2. Google asks for permission → **Review permissions** → choose your account → **Allow**.
   *(It only asks for access to this one spreadsheet.)*
3. Switch to your Sheet tab — you'll now see 3 tabs auto-created: **Expenses**, **Categories**, **Config**, with default categories seeded. ✅

### 5. Open the app (test URL)
1. Editor: **Deploy ▸ Test deployments**.
2. Copy the **Web app** URL (ends in `/dev`). Open it — the app loads.
   *Use this `/dev` URL while testing; it always runs your latest code.*

### 6. Make it a "real" app URL (for your phone)
1. **Deploy ▸ New deployment ▸** gear ▸ **Web app**.
2. Set **Execute as: Me**, **Who has access: Only myself** → **Deploy**.
3. Copy the **`/exec`** URL. This is your permanent app link.

### 7. Add to home screen 📱
- **iPhone (Safari):** open the `/exec` URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the `/exec` URL → ⋮ menu → **Add to Home screen**.

Launch it from the icon — it opens full-screen, dark mode follows your phone.

---

## Updating the app later
Edit a file in the Apps Script editor → save. The `/dev` URL updates instantly.
For the `/exec` (home-screen) URL to update: **Deploy ▸ Manage deployments ▸**
edit your deployment ▸ **Version: New version** ▸ Deploy.

---

## Verify it works
- Log an expense → open the **Expenses** sheet tab → row appears with a real date,
  amount as a **number** (₹ is just the cell format), category/payment/note correct.
- Cross-check a report total: in any empty cell run `=SUM(Expenses!C2:C)`.
- Report charts should render at a fixed height (they're sized in CSS so they don't
  collapse inside Apps Script's iframe — the #1 thing that breaks elsewhere).

---

## Known limitation (by design)
Apps Script serves from `script.google.com`, so this is **not** a true installable
PWA (no offline mode, no custom install banner). "Add to Home Screen" still gives a
full-screen, app-like launcher. This is the trade-off for *zero cost + data in your
own Sheet + no hosting*.

## Ideas for v1.1 (easy to add later)
- Monthly **budget per category** with progress bars (the `Config` tab is ready for it)
- Quick-preset buttons ("Petrol ₹300")
- Search / filter past expenses
