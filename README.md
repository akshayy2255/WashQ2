# WashQ

Real-time washing machine availability for hostel students. A single self-contained web app (`index.html`); no backend is needed for the demo, and all data is stored in the browser's localStorage.

**Features:** live machine dashboard (pre-loaded with realistic demo activity), preset + custom wash durations (1–180 min), Reserve & Start with a 4-digit code (OTP unlock), slot booking with a 10-minute check-in window that releases no-shows, "Notify me when free" queue, a Machine Setup page for generating and downloading QR codes, usage analytics, dark mode, a glass-style theme whose background colour follows overall availability, and an optional Machine 1 sensor feed read from `sensor/machine1.json`.

## Demo features (v6)
* **Hostel block switcher** (Block A/B/C, default C) in the header. Each block has its own machines and mock data, and the last choice is remembered. QR IDs: Block C `WM-04`, other blocks `WM-A04`, `WM-B04`.
* **Report Issue** (wrench icon on each card) marks the machine "Reported" and adds an entry to the **Maintenance log** on the Setup page, where the warden can mark it resolved.
* **Predictive maintenance health score** (mock) on each card and as a sorted list on the Setup page. Heavy use this week, open or recent issues and a per-machine age factor lower the score; normal readings from the live sensor keep it high.
* **Pre-wash checklist** (detergent, pockets, load balanced) before the OTP step, cleared with one tap.
* **Green impact estimate**: ≈30% of washes avoid a wasted trip or idle run × 2.7 L water and 0.095 kWh each. Tap the card to see the calculation.
* **Share-a-load**: optional toggle when reserving; shows a non-blocking banner if someone else is open to sharing (simulated + across tabs).
* **Top users leaderboard**: collapsible section at the bottom of the dashboard (mock data).

## Run (with the unlock backend)
```
python3 server.py            # http://localhost:8080 (optional: --port 9000)
```
There are no dependencies (Python 3.9 or newer). Data is saved in `data/washq.json`, which git ignores.
Set `WASHQ_CONTROLLER_URL=http://<controller>/unlock` to send real unlock commands. The server POSTs `{"machine_id":"WM-04","action":"unlock","booking_id":...}` to it. Without that variable, unlocks are simulated and logged.

The camera needs HTTPS or localhost. GitHub Pages can only host the front end, so booking works there as before, but QR unlock needs `server.py`.

## QR unlock flow
Book Slot → Booking Confirmed → **Scan Machine QR** (full-screen camera, torch, manual ID entry) → Machine Verified → Enter Password → Unlocking → Machine Unlocked ✓

* Each QR code contains only the machine's public ID: `…/?machine_id=WM-04#/machine/4`. No secrets are stored in it.
* Booking a slot creates a one-time unlock credential tied to (user, booking, machine). Only its hash is stored, and it never leaves the server.
* `POST /api/verify` checks the session, that the booking belongs to this user, that the scanned machine matches, the time window (5 min before to 10 min after slot start) and that the credential is unused. It then issues a single-use ticket valid for 2 minutes.
* `POST /api/unlock` requires the ticket, the same session and the account password. It re-checks everything, sends the unlock command and burns the credential.
* Rate limits: 5 wrong passwords per booking locks unlocking for 5 minutes; 8 failed sign-ins per 10 minutes per room and IP.

## Develop
Edit the files in `src/`, then run `src/build.sh` to regenerate `index.html`.

## v8 fixes

**Block dropdown.** A custom listbox replaces the native `<select>`.
- Nearly solid frosted panel: `rgba(255,255,255,.97)` in light mode, `rgba(30,32,46,.98)` in dark.
- Shadow `0 8px 24px rgba(0,0,0,.15)`, 16px radius, z-index 100.
- Opens 8px below the nav bar.
- A `rgba(0,0,0,.2)` scrim appears while it's open. Clicking outside or pressing Esc closes it; arrow keys move between blocks.
- Each block shows its live free count.

**QR unlock flow.** Booking Confirmed → quick checklist → Scan Machine QR → Open Camera & Scan (getUserMedia + jsQR).
- The QR holds only the machine ID.
- Scanning another machine shows a red "Wrong Machine" and returns to the scanner.
- A 4-digit PIN is created at booking. The server stores only a salted HMAC of it, and it's shown in My bookings.
- 3 wrong PINs lock the booking; you can then generate a new code (up to 5 times) or re-book.
- Success shows "Machine Unlocked ✓" with an animated check and starts the timer.
- Missing the 10-minute check-in window shows "Booking Expired".
- If camera permission is denied, a message with Retry appears. You can always enter the machine ID manually instead.

**Dynamic background.** The share of free machines is recomputed on every render and theme change.
- The colour blends continuously: amber/red at 0%, blue/purple at 50%, green/teal at 100%, with separate light and dark palettes.
- It's written to `--bg-gradient-start/-mid/-end` on `:root`. These are registered with `@property`, so they fade over 1.5s.
- The percentage is logged to the console as `[WashQ] ambient: …`.
