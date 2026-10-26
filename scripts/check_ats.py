import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import unicodedata
from collections import Counter
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
MIN_COVERAGE = 0.90


def chrome_path():
    if os.environ.get("CHROME_PATH"):
        return os.environ["CHROME_PATH"]
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    return str(next((path for path in candidates if path.is_file()), "")) or None


def start_server():
    if os.environ.get("ATS_APP_URL"):
        return os.environ["ATS_APP_URL"], None
    print("INFO Building production assets for the PDF download check.", flush=True)
    subprocess.run(
        ["node", "node_modules/vite/bin/vite.js", "build"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        port = connection.getsockname()[1]
    url = f"http://127.0.0.1:{port}/"
    server = subprocess.Popen(
        ["node", "node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", str(port), "--strictPort"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Vite stopped before the ATS check could start.")
        try:
            with urlopen(url, timeout=0.2):
                return url, server
        except OSError:
            time.sleep(0.2)
    server.terminate()
    raise RuntimeError("Vite did not start. Run npm install before checking PDF extraction.")


def words(text):
    return Counter(re.findall(r"\w+", unicodedata.normalize("NFKC", text).casefold()))


def coverage(expected, actual):
    source = words(expected)
    extracted = words(actual)
    return sum(min(count, extracted[word]) for word, count in source.items()) / max(sum(source.values()), 1)


def extractors(pdf):
    document = PdfReader(BytesIO(pdf))
    results = {"pypdf": "\n".join(page.extract_text() for page in document.pages)}
    if shutil.which("pdftotext"):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary:
            temporary.write(pdf)
            path = Path(temporary.name)
        try:
            for mode in ("-raw", "-layout"):
                result = subprocess.run(
                    ["pdftotext", mode, str(path), "-"],
                    capture_output=True,
                    check=True,
                )
                results[f"pdftotext {mode}"] = result.stdout.decode("utf-8", errors="replace")
        finally:
            path.unlink()
    else:
        print("WARNING pdftotext is unavailable; only pypdf coverage will be measured.")
    return document, results


def check_pdf(page, label):
    button = page.get_by_role("button", name="Download PDF")
    if not button.is_enabled():
        raise AssertionError(f"{label}: PDF export is blocked by resume validation.")
    expected = "\n".join(page.locator(".resume-pages .resume-sheet").all_inner_texts())
    email = page.locator('.resume-source .resume-contact a[href^="mailto:"]').inner_text()
    with page.expect_download() as transfer:
        button.click()
    download = transfer.value
    if not download.suggested_filename.endswith("-resume.pdf"):
        raise AssertionError(f"{label}: PDF download has an unexpected filename.")
    document, texts = extractors(download.path().read_bytes())
    if not document.pages:
        raise AssertionError(f"{label}: no pages were exported.")
    for engine, actual in texts.items():
        score = coverage(expected, actual)
        print(f"INFO {label}: {engine} text retention {score:.1%} on {len(document.pages)} A4 page(s).")
        if score < MIN_COVERAGE:
            raise AssertionError(f"{label}: {engine} recovered less than {MIN_COVERAGE:.0%} of visible words.")
        if email not in actual:
            raise AssertionError(f"{label}: the email address did not survive export.")
    for sheet in document.pages:
        width, height = (float(value) for value in sheet.mediabox.upper_right)
        if not (594 <= width <= 596 and 841 <= height <= 843):
            raise AssertionError(f"{label}: expected an A4 page, got {width} x {height} points.")
    return document, texts


def main():
    url, server = start_server()
    print(f"INFO Checking ATS-readable PDF export from {url}")
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=chrome_path(), headless=True)
            try:
                page = browser.new_page(viewport={"width": 1600, "height": 1050})
                page.goto(url)
                editor = page.get_by_role("textbox", name="Resume Markdown")
                if os.environ.get("ATS_MD_PATH"):
                    editor.fill(Path(os.environ["ATS_MD_PATH"]).read_text(encoding="utf-8"))
                    check_pdf(page, "Provided resume")
                    print("INFO ATS text-retention target met for the provided Markdown.")
                    return
                source = editor.input_value()
                document, texts = check_pdf(page, "Sample resume")
                if page.locator(".resume-pages .resume-sheet").count() != 1:
                    raise AssertionError("The sample preview should fit on one A4 sheet.")
                contact_style = page.locator(".resume-pages .resume-sheet").first.evaluate("""
                    sheet => {
                        const contact = sheet.querySelector('.resume-contact')
                        const location = contact.lastElementChild
                        return {
                            border: getComputedStyle(sheet.querySelector('.resume-header')).borderBottomWidth,
                            location: getComputedStyle(location).color,
                            email: getComputedStyle(contact.querySelector('a[href^="mailto:"]')).color,
                            icon: getComputedStyle(location.querySelector('svg')).color,
                            otherIcon: getComputedStyle(contact.querySelector('svg')).color,
                            sectionRules: [...sheet.querySelectorAll('.resume-content h1, .resume-content h2')].some(
                                heading => getComputedStyle(heading).borderBottomWidth !== '0px'
                            ),
                            sizes: ['h2', 'h3', 'li'].map(selector =>
                                parseFloat(getComputedStyle(sheet.querySelector(`.resume-content ${selector}`)).fontSize)
                            ),
                            weights: ['h2', 'h3'].map(selector =>
                                parseInt(getComputedStyle(sheet.querySelector(`.resume-content ${selector}`)).fontWeight)
                            ),
                            labelColor: getComputedStyle(sheet.querySelector('.resume-content h2')).color,
                            roleColor: getComputedStyle(sheet.querySelector('.resume-company').previousElementSibling).color,
                            markerColor: getComputedStyle(sheet.querySelector('.resume-content li'), '::marker').color,
                        }
                    }
                """)
                if contact_style["border"] == "0px" or contact_style["sectionRules"]:
                    raise AssertionError("Only the contact header should have a bottom rule.")
                if contact_style["location"] != contact_style["email"] or contact_style["icon"] != contact_style["otherIcon"]:
                    raise AssertionError("Location must use the same contact colors as the other details.")
                if not (contact_style["sizes"][1] > contact_style["sizes"][2] > contact_style["sizes"][0]
                        and min(contact_style["weights"]) >= 600):
                    raise AssertionError("Section labels, role titles, and bullets need the reference type hierarchy.")
                if (contact_style["roleColor"] == contact_style["markerColor"] or
                        contact_style["roleColor"] == contact_style["labelColor"]):
                    raise AssertionError("Roles keep the accent; bullet markers and section labels stay neutral.")
                layout = page.locator(".resume-pages .resume-sheet").first.evaluate("""
                    sheet => {
                        const content = sheet.querySelector('.resume-content')
                        const education = [...content.querySelectorAll('.resume-entry')].find(
                            entry => entry.querySelector('.resume-college')
                        )
                        const experience = [...content.querySelectorAll('.resume-entry')].find(
                            entry => entry.querySelector('.resume-company')
                        )
                        return {
                            collegeBelow: education.querySelector('h4').getBoundingClientRect().top >
                                education.querySelector('h3').getBoundingClientRect().top,
                            companyBelow: experience.querySelector('.resume-company').getBoundingClientRect().top >
                                experience.querySelector('h3').getBoundingClientRect().top,
                            datesRight: [...content.querySelectorAll('.resume-entry-date, .resume-cert-date')].every(
                                date => Math.abs(date.getBoundingClientRect().right -
                                    content.getBoundingClientRect().right) < 2
                            )
                        }
                    }
                """)
                if not layout["collegeBelow"] or not layout["companyBelow"] or not layout["datesRight"]:
                    raise AssertionError("Company and college must follow their heading, with dates aligned right.")
                for actual in texts.values():
                    headings = ["PROFESSIONAL SUMMARY", "PROFESSIONAL EXPERIENCE", "EDUCATION", "CORE SKILLS"]
                    positions = [actual.find(heading) for heading in headings]
                    if -1 in positions or positions != sorted(positions):
                        raise AssertionError("The standard section headings were not extracted in order.")
                    if actual.find("Bengaluru, India") < actual.find("linkedin.com/in/your-profile"):
                        raise AssertionError("The contact location must follow LinkedIn in the PDF.")
                links = [
                    annotation.get_object().get("/A", {}).get("/URI")
                    for sheet in document.pages
                    for annotation in sheet.get("/Annots", [])
                ]
                if len(links) < 4:
                    raise AssertionError("PDF contact hyperlinks are missing.")
                page.get_by_role("button", name="COLOR THEME").click()
                bar_toggle = page.get_by_role("button", name="Section title bars")
                heading = page.locator(".resume-pages .resume-sheet .resume-content h2").first
                if heading.evaluate("el => getComputedStyle(el).borderLeftWidth") == "0px":
                    raise AssertionError("Section title bars should be enabled by default.")
                page.get_by_role("button", name="Section title bars").click()
                page.wait_for_function(
                    "getComputedStyle(document.querySelector('.resume-pages .resume-sheet .resume-content h2')).borderLeftWidth === '0px'"
                )
                if bar_toggle.get_attribute("aria-pressed") != "false":
                    raise AssertionError("Section title bar toggle did not turn off.")
                page.get_by_role("button", name="Section title bars").click()
                page.wait_for_function(
                    "getComputedStyle(document.querySelector('.resume-pages .resume-sheet .resume-content h2')).borderLeftWidth !== '0px'"
                )
                page.locator('input[type="color"][aria-label="Name color"]').fill("#285943")
                page.wait_for_function(
                    "getComputedStyle(document.querySelector('.resume-pages .resume-sheet .resume-header h1')).color === 'rgb(40, 89, 67)'"
                )
                if heading.evaluate("el => getComputedStyle(el).color") == "rgb(40, 89, 67)":
                    raise AssertionError("Name color must not override section heading colors.")
                check_pdf(page, "Custom name color and title bars")
                page.get_by_role("button", name="Use theme color").click()
                editor.fill(source + "\n\n| Role | Employer |\n| --- | --- |\n| Engineer | Example |")
                page.get_by_text("Tables are not ATS-safe.", exact=False).wait_for()
                if page.get_by_role("button", name="Download PDF").is_enabled():
                    raise AssertionError("An unsupported table was allowed into the PDF.")
                editor.fill(source + "\n\n## Additional Experience\n\n" + "\n".join(
                    f"- Test accomplishment {number:02d}: delivered a measurable result."
                    for number in range(1, 51)
                ))
                page.wait_for_function(
                    "document.querySelectorAll('.resume-pages .resume-sheet').length > 1"
                )
                sheets_fit = page.locator(".resume-pages .resume-sheet").evaluate_all("""
                    sheets => sheets.every(sheet => {
                        const content = sheet.querySelector('.resume-content')
                        const bottom = sheet.getBoundingClientRect().bottom -
                            parseFloat(getComputedStyle(sheet).paddingBottom)
                        return content.lastElementChild.getBoundingClientRect().bottom <= bottom + 1
                    })
                """)
                if not sheets_fit:
                    raise AssertionError("Resume preview text spills outside an A4 sheet.")
                long_document, long_texts = check_pdf(page, "Multi-page resume")
                if len(long_document.pages) < 2:
                    raise AssertionError("The multi-page fixture did not span multiple pages.")
                for actual in long_texts.values():
                    if any(f"Test accomplishment {number:02d}" not in actual for number in range(1, 51)):
                        raise AssertionError("Some experience bullets were lost across pages.")
                page.get_by_role("group", name="Primary font").get_by_role("button", name="Outfit").click()
                page.get_by_role("group", name="Secondary font").get_by_role("button", name="DM Sans").click()
                page.evaluate("document.fonts.ready")
                check_pdf(page, "Alternate fonts")
                editor.fill(source.replace("30%.", "30% and saved ₹5,000."))
                _, rupee_texts = check_pdf(page, "Currency symbol")
                if not re.search(r"₹\s*5,000", rupee_texts["pypdf"]):
                    raise AssertionError("The rupee symbol did not survive PDF export.")
                print("INFO ATS text-retention target met for sample and multi-page resumes.")
            finally:
                browser.close()
    finally:
        if server:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
