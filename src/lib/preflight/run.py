"""
AdVision browser-harness preflight runner.
Visits a URL, dismisses CMP, exports cookies + localStorage to stdout as JSON.
"""
import json, sys, os, time

HARNESS_DIR = os.path.expanduser("~/Documents/GitHub/browser-harness")
sys.path.insert(0, HARNESS_DIR)
sys.path.insert(0, os.path.join(HARNESS_DIR, "src"))

url = sys.argv[1] if len(sys.argv) > 1 else ""
if not url:
    print(json.dumps({"error": "No URL provided", "success": False}))
    sys.exit(1)

cdp_ws = os.environ.get("BU_CDP_WS", "")
if not cdp_ws:
    print(json.dumps({"error": "BU_CDP_WS not set", "success": False}))
    sys.exit(1)

try:
    # Load helpers from harness
    helpers_path = os.path.join(HARNESS_DIR, "helpers.py")
    with open(helpers_path) as f:
        exec(f.read(), globals())

    goto(url)
    wait_for_load()
    time.sleep(2)

    dismissed = False
    accept_selectors = [
        "#onetrust-accept-btn-handler",
        ".js-accept-all-cookies",
        "button[id*='accept']",
        "button[class*='accept-all']",
        "[aria-label*='Accept all']",
        "[aria-label*='accept all']",
        "button[id*='agree']",
        ".css-accept",
        "[data-testid*='accept']",
        "#accept-all",
    ]
    for sel in accept_selectors:
        try:
            click(sel)
            dismissed = True
            time.sleep(1)
            break
        except Exception:
            pass

    cookies = get_cookies() if 'get_cookies' in dir() else []
    storage = get_local_storage() if 'get_local_storage' in dir() else {}

    print(json.dumps({
        "success": True,
        "dismissed": dismissed,
        "cookies": cookies,
        "localStorage": storage,
        "url": url,
    }))

except Exception as e:
    print(json.dumps({"error": str(e), "success": False}))
    sys.exit(1)
