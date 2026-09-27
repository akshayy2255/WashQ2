#!/usr/bin/env python3
"""
WashQ backend — serves the web app and provides the unlock-authorisation API.

Standard library only:  python3 server.py  [--port 8080]

Security model
  * Users sign in with room number + password (PBKDF2-SHA256, per-user salt).
  * Sessions are random bearer tokens (stored hashed on the server).
  * When a slot is booked the server creates a one-time unlock credential bound to
    (user, booking, machine). It never leaves the server; only its hash is stored.
  * QR codes carry only a public machine identifier (e.g. machine_id=WM-04).
  * /api/verify     session + booking owner + machine match + time window + unused
                    credential  → short-lived single-use "unlock ticket" (2 min)
  * /api/unlock     session + ticket + password, re-checks everything, then consumes
                    the credential and sends the unlock command to the controller.
  * Rate limits: sign-in 8 fails / 10 min per room+IP; unlock 5 wrong passwords per
    booking → 5 min lockout.
"""
import hashlib, hmac, json, os, re, secrets, sys, threading, time, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("WASHQ_DATA", os.path.join(ROOT, "data", "washq.json"))
CONTROLLER_URL = os.environ.get("WASHQ_CONTROLLER_URL")   # e.g. http://controller.local/unlock
EARLY_MIN = 5          # can unlock up to 5 min before slot start
LATE_MIN = 10          # …and until 10 min after slot start (matches the no-show window)
TICKET_TTL = 120
MAX_UNLOCK_FAILS, UNLOCK_LOCK_S = 5, 300
MAX_LOGIN_FAILS, LOGIN_WINDOW_S = 8, 600
LOCK = threading.Lock()

def now_ms(): return int(time.time() * 1000)
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def pw_hash(pw, salt): return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()

def load():
    try:
        with open(DATA) as f: return json.load(f)
    except Exception:
        return {"users": {}, "sessions": {}, "bookings": {}, "tickets": {}, "audit": []}
DB = load()
def persist():
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    tmp = DATA + ".tmp"
    with open(tmp, "w") as f: json.dump(DB, f)
    os.replace(tmp, DATA)
def audit(event, **kw):
    DB["audit"].append({"t": now_ms(), "event": event, **kw}); DB["audit"] = DB["audit"][-500:]

login_fails = {}   # key -> [timestamps]

class ApiError(Exception):
    def __init__(self, status, code, msg): super().__init__(msg); self.status, self.code, self.msg = status, code, msg

MACHINE_RE = re.compile(r"^WM-\d{2,4}$")
def norm_machine(v):
    v = str(v or "").strip().upper()
    if not MACHINE_RE.match(v): raise ApiError(400, "bad_machine", "That QR code isn't a WashQ machine code.")
    return v

def send_unlock_command(machine_id, booking_id):
    """Send the unlock command to the washing-machine controller.
    If WASHQ_CONTROLLER_URL is set, POSTs JSON to it; otherwise simulates success."""
    if not CONTROLLER_URL:
        print(f"[controller] SIMULATED unlock → {machine_id} (booking {booking_id})", flush=True); return True
    req = urllib.request.Request(CONTROLLER_URL, data=json.dumps({"machine_id": machine_id, "action": "unlock", "booking_id": booking_id}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return 200 <= r.status < 300
    except Exception as e:
        print("[controller] error:", e, flush=True); return False

def public_booking(b):
    return {k: b[k] for k in ("id", "machine_id", "machine_name", "start", "dur", "status", "created")} | {"used": b["used"]}

def check_booking_usable(b, user_id, machine_id):
    """All the rules from the spec. Raises ApiError with a user-facing message."""
    t = now_ms()
    if not b or b["status"] == "cancelled": raise ApiError(404, "no_booking", "You don't have an active booking for this machine.")
    if b["user"] != user_id: raise ApiError(403, "not_owner", "This booking belongs to another user.")
    if b["used"]: raise ApiError(409, "used", "This booking has already been used to unlock the machine.")
    if b["machine_id"] != machine_id:
        raise ApiError(409, "wrong_machine", f"Wrong machine. You scanned {machine_id}, but your booking is for {b['machine_id']} ({b['machine_name']}).")
    if t > b["start"] + LATE_MIN * 60000: raise ApiError(410, "expired", "Your booking has expired. Please book a new slot.")
    if t < b["start"] - EARLY_MIN * 60000:
        mins = int((b["start"] - EARLY_MIN * 60000 - t) / 60000) + 1
        raise ApiError(425, "too_early", f"Too early — you can unlock from {EARLY_MIN} minutes before your slot (in about {mins} min).")
    if b.get("locked_until", 0) > t:
        raise ApiError(429, "locked", f"Too many incorrect attempts. Try again in {int((b['locked_until'] - t) / 1000) + 1} seconds.")

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, fmt, *a):
        if a and "/api/" in str(a[0]): sys.stderr.write("%s\n" % (fmt % a))

    # --- static: block private files, SPA fallback for /machine/N ---
    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/api/"): return self.api("GET")
        if p.startswith(("/data", "/.git", "/server.py", "/src")): return self.send_error(404)
        if re.match(r"^/machine/\d+/?$", p): self.path = "/index.html"
        return super().do_GET()
    def do_POST(self): self.api("POST")
    def do_DELETE(self): self.api("DELETE")
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Permissions-Policy", "camera=(self)")
        super().end_headers()

    def json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 10000: raise ApiError(413, "too_large", "Request too large")
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: raise ApiError(400, "bad_json", "Invalid request")

    def user(self):
        tok = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        s = DB["sessions"].get(sha(tok)) if tok else None
        if not s or s["exp"] < now_ms(): raise ApiError(401, "auth", "Please sign in again.")
        return DB["users"][s["user"]], sha(tok)

    def api(self, method):
        path = self.path.split("?")[0]
        try:
            with LOCK:
                res = self.route(method, path)
                persist()
            self.json(200, res)
        except ApiError as e:
            with LOCK: persist()
            self.json(e.status, {"error": e.code, "message": e.msg})
        except Exception as e:
            import traceback; traceback.print_exc()
            self.json(500, {"error": "server", "message": "Server error"})

    def route(self, method, path):
        ip = self.client_address[0]
        if path == "/api/health": return {"ok": True, "time": now_ms()}

        if path == "/api/login" and method == "POST":
            d = self.body()
            room = re.sub(r"\s+", "", str(d.get("room", ""))).upper()[:10]
            pw, name = str(d.get("password", "")), str(d.get("name", "")).strip()[:24]
            if not re.match(r"^[A-Z0-9\-]{2,10}$", room): raise ApiError(400, "room", "Enter a valid room number, e.g. B-204.")
            if len(pw) < 4: raise ApiError(400, "pw", "Password must be at least 4 characters.")
            key = room + "|" + ip; t = time.time()
            fails = [x for x in login_fails.get(key, []) if t - x < LOGIN_WINDOW_S]; login_fails[key] = fails
            if len(fails) >= MAX_LOGIN_FAILS: raise ApiError(429, "rate", "Too many sign-in attempts. Please wait a few minutes.")
            u = next((u for u in DB["users"].values() if u["room"] == room), None)
            created = False
            if not u:
                salt = secrets.token_hex(16)
                u = {"id": "u_" + secrets.token_hex(6), "room": room, "name": name, "salt": salt, "pw": pw_hash(pw, salt), "created": now_ms()}
                DB["users"][u["id"]] = u; created = True; audit("register", user=u["id"])
            elif not hmac.compare_digest(u["pw"], pw_hash(pw, u["salt"])):
                fails.append(t); raise ApiError(401, "bad_login", "Incorrect password for this room.")
            if name and name != u["name"]: u["name"] = name
            tok = secrets.token_urlsafe(32)
            DB["sessions"][sha(tok)] = {"user": u["id"], "exp": now_ms() + 30 * 86400000}
            return {"token": tok, "user": {"id": u["id"], "room": u["room"], "name": u["name"]}, "created": created}

        u, sid = self.user()

        if path == "/api/me": return {"user": {"id": u["id"], "room": u["room"], "name": u["name"]}}
        if path == "/api/logout" and method == "POST":
            DB["sessions"].pop(sid, None); return {"ok": True}

        if path == "/api/bookings" and method == "GET":
            mine = [public_booking(b) for b in DB["bookings"].values() if b["user"] == u["id"] and b["status"] != "cancelled"]
            return {"bookings": sorted(mine, key=lambda b: b["start"])}

        if path == "/api/bookings" and method == "POST":
            d = self.body()
            mid = norm_machine(d.get("machine_id"))
            start, dur = int(d.get("start", 0)), int(d.get("dur", 0))
            if not (1 <= dur <= 180): raise ApiError(400, "dur", "Duration must be between 1 and 180 minutes.")
            if start < now_ms() - 60000: raise ApiError(400, "past", "That time has already passed.")
            end = start + dur * 60000
            for b in DB["bookings"].values():
                if b["machine_id"] == mid and b["status"] == "confirmed" and not b["used"] and start < b["start"] + b["dur"] * 60000 and b["start"] < end:
                    raise ApiError(409, "overlap", "That slot overlaps an existing booking.")
            cred = secrets.token_urlsafe(24)          # one-time unlock credential — server-side only
            b = {"id": "bk_" + secrets.token_hex(8), "user": u["id"], "machine_id": mid, "machine_name": str(d.get("machine_name", mid))[:40],
                 "start": start, "dur": dur, "status": "confirmed", "created": now_ms(), "cred": sha(cred), "used": False, "fails": 0, "locked_until": 0}
            DB["bookings"][b["id"]] = b; audit("book", user=u["id"], booking=b["id"], machine=mid)
            return {"booking": public_booking(b)}

        m = re.match(r"^/api/bookings/(bk_[0-9a-f]+)$", path)
        if m and method == "DELETE":
            b = DB["bookings"].get(m.group(1))
            if not b or b["user"] != u["id"]: raise ApiError(404, "no_booking", "Booking not found")
            b["status"] = "cancelled"; audit("cancel", user=u["id"], booking=b["id"]); return {"ok": True}

        if path == "/api/verify" and method == "POST":
            d = self.body()
            mid = norm_machine(d.get("machine_id"))
            b = DB["bookings"].get(str(d.get("booking_id", "")))
            if not b:  # fall back to the user's current booking on that machine
                cands = [x for x in DB["bookings"].values() if x["user"] == u["id"] and x["status"] == "confirmed" and not x["used"]]
                b = min(cands, key=lambda x: abs(x["start"] - now_ms()), default=None)
            check_booking_usable(b, u["id"], mid)
            # invalidate older tickets for this booking, then issue a fresh one
            DB["tickets"] = {k: v for k, v in DB["tickets"].items() if v["booking"] != b["id"] and v["exp"] > now_ms()}
            t = secrets.token_urlsafe(24)
            DB["tickets"][sha(t)] = {"booking": b["id"], "user": u["id"], "session": sid, "machine": mid, "cred": b["cred"], "exp": now_ms() + TICKET_TTL * 1000}
            audit("verify", user=u["id"], booking=b["id"], machine=mid)
            return {"ticket": t, "expires_in": TICKET_TTL, "booking": public_booking(b)}

        if path == "/api/unlock" and method == "POST":
            d = self.body()
            tk = DB["tickets"].get(sha(str(d.get("ticket", ""))))
            if not tk or tk["exp"] < now_ms() or tk["user"] != u["id"] or tk["session"] != sid:
                raise ApiError(401, "ticket", "Verification expired. Please scan the machine QR again.")
            b = DB["bookings"].get(tk["booking"])
            check_booking_usable(b, u["id"], tk["machine"])            # re-check everything at unlock time
            if not hmac.compare_digest(tk["cred"], b["cred"]): raise ApiError(401, "cred", "Unlock credential is invalid.")
            if not hmac.compare_digest(u["pw"], pw_hash(str(d.get("password", "")), u["salt"])):
                b["fails"] += 1
                left = MAX_UNLOCK_FAILS - b["fails"]
                audit("unlock_fail", user=u["id"], booking=b["id"])
                if left <= 0:
                    b["fails"] = 0; b["locked_until"] = now_ms() + UNLOCK_LOCK_S * 1000
                    raise ApiError(429, "locked", f"Too many incorrect attempts. Unlocking is blocked for {UNLOCK_LOCK_S // 60} minutes.")
                raise ApiError(401, "bad_password", f"Incorrect password. Please try again. ({left} attempt{'s' if left != 1 else ''} left)")
            if not send_unlock_command(b["machine_id"], b["id"]):
                raise ApiError(502, "controller", "Couldn't reach the machine controller. Please try again.")
            b["used"] = True; b["status"] = "used"; b["cred"] = sha(secrets.token_hex(16)); b["fails"] = 0   # one-time: burn credential
            DB["tickets"].pop(sha(str(d.get("ticket", ""))), None)
            audit("unlock", user=u["id"], booking=b["id"], machine=b["machine_id"])
            return {"ok": True, "machine_id": b["machine_id"], "booking": public_booking(b)}

        raise ApiError(404, "not_found", "Not found")

if __name__ == "__main__":
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else int(os.environ.get("PORT", 8080))
    print(f"WashQ running on http://0.0.0.0:{port}  (controller: {CONTROLLER_URL or 'simulated'})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
