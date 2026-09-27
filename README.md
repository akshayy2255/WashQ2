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

## v9: scan-first entry and accounts

**Scan QR (UPI-style).**
- A large "Scan QR" tile sits at the top of the dashboard. On phones there's also a floating scan button at the bottom-right that stays visible while you scroll.
- Both open the same full-screen jsQR scanner, with the same camera-permission, Retry and manual-ID handling as the unlock flow.
- What happens after a scan depends on the machine:
  - **Free:** Reserve → checklist → unlock code.
  - **Busy, finished or reserved:** its live status, plus "Notify me", which uses the existing queue.
  - **You have a booking on it:** the booking unlock (checklist → verify → PIN).
  - **Not a WashQ code:** "Unrecognized QR code" with Retry.
- A code from another block (e.g. `WM-A04`) switches to that block automatically.

**Accounts.** These use the existing `/api/login`, `/api/me`, `/api/logout` and `/api/bookings`; no new auth logic was added.
- The avatar sits at the far right of the header: your initials when signed in, a person icon when signed out.
- **Sign in:** Name, Room number, Class/Year (optional) and Password, sent as `{room, password, name}`.
  - A new room creates an account automatically, and you choose the password.
  - The session is a 30-day bearer token, re-checked with `/api/me` on every page load.
- **Account panel:** a dropdown on desktop, a bottom sheet on phones.
  - Name, room and class/year, plus washes this month, minutes washed and bookings this month.
  - My Bookings (from `/api/bookings`), with the PIN if the booking was made on this device.
  - Log out, which calls `/api/logout`.
- When you're signed in, your name and room are filled in automatically in Reserve and Book.
- Class/Year has no backend field, so it's saved on the device.

## v10: notification center

- **Bell.** The header order is now: … Settings → Theme → **Bell** → Avatar. A red badge on the bell shows the unread count.
- **Panel.** The bell opens a dropdown on desktop or a bottom sheet on phones.
  - Notifications are listed newest first. Each has a type icon (washer, clock, bell, calendar or wrench), a title, a description and a relative time.
  - Unread items are highlighted and have a dot. Clicking one marks it read; clicking a read one opens its machine.
  - The panel has "Mark all as read" and "Clear all".
- **Live events.** Every existing `notify()` also adds a typed entry to the panel: cycle complete (timer or sensor), queue turn, booking confirm window, and slot auto-released. A machine you used in the last 24h, are queued for or have booked also creates an entry when it's reported.
  - Toasts, the beep and system notifications work exactly as before.
  - Live entries play the existing beep and briefly shake the bell (about 0.4s).
- **Demo data.** The first load adds 5 demo notifications, 2 of them unread, so the badge shows "2". They play no sound.
- **Storage.** The list is saved on the device in `localStorage['washq.notes']`, capped at 60 items, and syncs between open tabs.
