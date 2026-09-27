# WashQ

Real-time washing machine availability for hostel students. A single self-contained web app (`index.html`); no backend is needed for the demo, and all data is stored in the browser's localStorage.

**Features:** live machine dashboard, Reserve & Start with a 4-digit code (OTP unlock), slot booking with a 10-minute check-in window that releases no-shows, "Notify me when free" queue, a Machine Setup page for generating and downloading QR codes, usage analytics, dark mode, a glass-style theme whose background colour follows overall availability, and an optional Machine 1 sensor feed read from `sensor/machine1.json`.

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
