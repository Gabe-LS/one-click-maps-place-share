"""Brief test: English + Italian only."""

from playwright.sync_api import sync_playwright
import os

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(DIR, "test-profile")
PLACE = "Mount+Kinabalu/@6.0753129,116.548524,15z"
LANGS = [("en", "English"), ("it", "Italian")]


def accept_consent(page):
    try:
        page.click(
            "form[action*='consent'] button:last-child,button[jsaction*='agree']",
            timeout=2000,
        )
    except Exception:
        pass


def wait_for_share_button(page, timeout=15000):
    try:
        page.wait_for_selector('button[jslog^="13534"]', timeout=timeout)
        return True
    except Exception:
        return False


def test_lang(page, code, name):
    page.goto(
        f"https://www.google.com/maps/place/{PLACE}?hl={code}",
        wait_until="domcontentloaded",
    )
    accept_consent(page)

    if not wait_for_share_button(page):
        print(f"  {name}: FAIL (no share button)")
        return False

    page.wait_for_timeout(1000)
    page.evaluate("navigator.clipboard.writeText('')")

    overlay = page.query_selector("#gmbs-overlay")
    if not overlay:
        print(f"  {name}: FAIL (no overlay)")
        return False

    overlay.click()

    # Poll for clipboard content
    for _ in range(40):
        page.wait_for_timeout(250)
        try:
            clip = page.evaluate("navigator.clipboard.readText()")
        except Exception:
            clip = ""
        if clip.strip() and "goo.gl/" in clip:
            lines = clip.strip().split("\n")
            print(f"  {name}: PASS ({len(lines)} lines)")
            for i, line in enumerate(lines):
                print(f"    {i + 1}: {line}")
            return True

    print(f"  {name}: FAIL (timeout)")
    return False


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFILE,
        headless=False,
        args=[
            "--disable-blink-features=AutomationControlled",
            f"--disable-extensions-except={DIR}",
            f"--load-extension={DIR}",
        ],
        viewport={"width": 1280, "height": 900},
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    ok = all(test_lang(page, c, n) for c, n in LANGS)
    print(f"\n{'ALL PASS' if ok else 'FAILURES'}")
    ctx.close()
