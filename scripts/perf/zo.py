# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""Shared helpers for the energy harness: paths, launching and quitting apps, the quiet-machine
wait, a small Marionette client for building profile templates, and the measurement window."""
import json, os, plistlib, shutil, signal, socket, subprocess, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RESEARCH = os.path.realpath(os.path.join(ROOT, os.pardir, "Zen-Origin-research"))
TOOLS = os.path.join(RESEARCH, "tools", "perf")
PERF = os.path.join(RESEARCH, "perf")          # templates, run directories, raw data
TEMPLATES = os.path.join(PERF, "templates")
RUNS = os.path.join(PERF, "runs")
PORT = 8765
UID = 502  # the GUI session user (mrm)

# The standard window, in screen points with a top-left origin. 1440 by 900 is a common laptop size.
WINDOW = (120, 60, 1440, 900)
PARK = (1900, 1060)  # pointer parked outside the window, bottom right


def url(site, path="/"):
    return f"http://{site}.localhost:{PORT}{path}"


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def sh(cmd, check=True, timeout=None, quiet=False):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed ({r.returncode}): {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def ui(*args, check=True, timeout=180):
    return sh([os.path.join(TOOLS, "zo-ui"), *[str(a) for a in args]], check=check, timeout=timeout)


def now_ms():
    return time.time() * 1000


# ---- apps -------------------------------------------------------------------------------------

def app_pids(app):
    """PIDs of every running instance at this bundle path, oldest first."""
    out = sh([os.path.join(TOOLS, "zo-ui"), "pid", app, "0"], check=False)
    return [int(p) for p in out.split() if p.isdigit()]


def launch(app, args=(), env=None, urls=()):
    """Opens the app through LaunchServices inside the user's GUI session, so it gets its own
    coalition (launching the binary from this shell would put it in the shell's)."""
    cmd = ["sudo", "-n", "launchctl", "asuser", str(UID), "sudo", "-n", "-u", "mrm", "open", "-n", "-a", app]
    for k, v in (env or {}).items():
        cmd += ["--env", f"{k}={v}"]
    cmd += list(urls)
    if args:
        cmd += ["--args", *args]
    before = app_pids(app)
    t0 = now_ms()
    sh(cmd, timeout=60)
    pid = int(ui("pid", app, 60, ",".join(map(str, before)) or "0").split()[-1])
    return pid, t0


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def wait_exit(pid, timeout):
    end = time.time() + timeout
    while time.time() < end:
        if not alive(pid):
            return True
        time.sleep(0.2)
    return not alive(pid)


def quit_app(pid, timeout=30):
    """Cmd+Q first. Profiles are throwaway copies, so a kill is acceptable when the app hangs; only
    the pid this harness launched is ever signalled."""
    if not alive(pid):
        return "gone"
    try:
        ui("front", pid, check=False, timeout=10)
        ui("key", pid, "q", "cmd", check=False, timeout=10)
    except subprocess.TimeoutExpired:
        pass
    if wait_exit(pid, timeout):
        return "quit"
    os.kill(pid, signal.SIGTERM)
    if wait_exit(pid, 10):
        return "term"
    os.kill(pid, signal.SIGKILL)
    wait_exit(pid, 10)
    return "kill"


def wait_window(pid, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        out = sh([os.path.join(TOOLS, "zo-ui"), "frame", str(pid)], check=False)
        parts = out.split()
        if len(parts) == 4 and int(parts[3]) > 200:
            return [int(p) for p in parts]
        time.sleep(0.2)
    raise RuntimeError(f"pid {pid} showed no window in {timeout} s")


def place_window(pid):
    x, y, w, h = WINDOW
    for _ in range(5):
        got = [int(p) for p in ui("setframe", pid, x, y, w, h).split()]
        if got == [x, y, w, h]:
            return got
        time.sleep(0.5)
    raise RuntimeError(f"window of pid {pid} stayed at {got}")


# ---- quiet machine ----------------------------------------------------------------------------

BUSY = ("swift-frontend", "swift-build", "swiftc", "xcodebuild", "clang", "ld", "ld64", "xctest",
        "swiftpm-testing-helper", "rustc", "cargo", "cc1plus")


def busy_processes():
    names = [l.strip().split("/")[-1] for l in sh(["ps", "-axo", "comm="]).splitlines()]
    hits = sorted({n for n in names if n in BUSY})
    cmds = sh(["ps", "-axo", "command="])
    if "mach build" in cmds or "mach package" in cmds:
        hits.append("mach build")
    return hits


def load1():
    return float(sh(["sysctl", "-n", "vm.loadavg"]).strip("{} ").split()[0])


def quiet_wait(max_load=3.5, max_wait=900, settle=20):
    """CandyWrapper's quiet-machine rule: no compiler or build running and the 1-minute load
    average under max_load, held for `settle` seconds. Gives up after max_wait and says so."""
    start, quiet_since = time.time(), None
    while True:
        busy, load = busy_processes(), load1()
        if not busy and load < max_load:
            quiet_since = quiet_since or time.time()
            if time.time() - quiet_since >= settle:
                return {"waited_s": round(time.time() - start), "load": load, "noisy": False}
        else:
            quiet_since = None
        if time.time() - start > max_wait:
            return {"waited_s": round(time.time() - start), "load": load, "noisy": True, "busy": busy}
        time.sleep(5)


# ---- measurement window -----------------------------------------------------------------------

class Window:
    """Records powermetrics (sudo, whole system plus per coalition) and zo-stat (kernel counters
    for the app's coalition, its processes and WindowServer) over the same interval."""

    def __init__(self, pid, seconds, outdir, name, interval_ms=1000):
        self.pid, self.seconds, self.outdir, self.name = pid, seconds, outdir, name
        os.makedirs(outdir, exist_ok=True)
        n = max(1, int(round(seconds * 1000 / interval_ms)))
        self.pm_path = os.path.join(outdir, f"{name}.powermetrics.plist")
        self.st_path = os.path.join(outdir, f"{name}.zostat.jsonl")
        self.pm = subprocess.Popen(
            ["sudo", "-n", "/usr/bin/powermetrics", "-i", str(interval_ms), "-n", str(n),
             "--samplers", "tasks,cpu_power,gpu_power", "--show-process-coalition",
             "--show-process-energy", "--show-process-gpu", "-f", "plist"],
            stdout=open(self.pm_path, "wb"), stderr=subprocess.DEVNULL)
        self.st = None
        if pid:
            self.st = subprocess.Popen([os.path.join(TOOLS, "zo-stat"), "watch", str(pid), str(seconds), "1"],
                                       stdout=open(self.st_path, "w"), stderr=subprocess.DEVNULL)
        self.t0 = now_ms()

    def wait(self):
        if self.st:
            self.st.wait(timeout=self.seconds + 60)
        try:
            self.pm.wait(timeout=30)
        except subprocess.TimeoutExpired:
            # The sudo front end keeps our real uid, so we may signal it; it passes SIGINT on.
            self.pm.send_signal(signal.SIGINT)
            self.pm.wait(timeout=10)
        return {"name": self.name, "t0_ms": self.t0, "t1_ms": now_ms(), "seconds": self.seconds}


def stat_once(pid, path):
    with open(path, "w") as f:
        f.write(sh([os.path.join(TOOLS, "zo-stat"), "sample", str(pid)]) + "\n")


# ---- profiles ---------------------------------------------------------------------------------

def write_prefs(path, prefs, header):
    with open(path, "a") as f:
        f.write(f"\n// {header}\n")
        for k, v in prefs.items():
            f.write(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n")


def clone_tree(src, dst):
    """APFS clone copy, near free."""
    if os.path.exists(dst):
        shutil.rmtree(dst)
    sh(["cp", "-cR", src, dst])


# ---- Marionette (template setup only, never during measurement) -------------------------------

class Marionette:
    def __init__(self, port=2828, timeout=90):
        end = time.time() + timeout
        while True:
            try:
                self.sock = socket.create_connection(("127.0.0.1", port), timeout=5)
                break
            except OSError:
                if time.time() > end:
                    raise
                time.sleep(0.5)
        self.sock.settimeout(600)
        self.buf, self.id = b"", 0
        self.hello = self._recv()
        self.send("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": False}}})
        self.send("WebDriver:SetTimeouts", {"script": 600000})
        self.send("Marionette:SetContext", {"value": "chrome"})

    def _recv(self):
        while b":" not in self.buf:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise ConnectionError("marionette closed")
            self.buf += chunk
        n, rest = self.buf.split(b":", 1)
        n = int(n)
        while len(rest) < n:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise ConnectionError("marionette closed")
            rest += chunk
        self.buf = rest[n:]
        return json.loads(rest[:n])

    def send(self, name, params=None):
        self.id += 1
        data = json.dumps([0, self.id, name, params or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b":" + data)
        while True:
            msg = self._recv()
            if msg[0] == 1 and msg[1] == self.id:
                if msg[2]:
                    raise RuntimeError(f"{name}: {msg[2]}")
                return msg[3]

    def js(self, body, *args):
        """Runs chrome-privileged JS in the browser window; `body` may use await and arguments[]."""
        script = f"return (async () => {{ {body} }})();"
        return self.send("WebDriver:ExecuteScript", {"script": script, "args": list(args)}).get("value")

    def quit(self):
        try:
            self.send("Marionette:Quit", {"flags": ["eAttemptQuit"]})
        except (ConnectionError, OSError, RuntimeError):
            pass


# ---- powermetrics parsing ---------------------------------------------------------------------

def read_powermetrics(path):
    raw = open(path, "rb").read()
    return [plistlib.loads(p) for p in raw.split(b"\0") if p.strip()]
