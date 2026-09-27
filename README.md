# WashQ

Real-time washing machine availability for hostel students. A single self-contained web app (`index.html`); no backend is needed for the demo, and all data is stored in the browser's localStorage.

**Features:** live machine dashboard, Reserve & Start with a 4-digit code (OTP unlock), slot booking with a 10-minute check-in window that releases no-shows, "Notify me when free" queue, a Machine Setup page for generating and downloading QR codes, usage analytics, dark mode, a glass-style theme whose background colour follows overall availability, and an optional Machine 1 sensor feed read from `sensor/machine1.json`.

## Run
```
python3 -m http.server 8080
```
Then open http://localhost:8080. Browser notifications need http(s), not file://.

## Develop
Edit the files in `src/`, then run `src/build.sh` to regenerate `index.html`.
