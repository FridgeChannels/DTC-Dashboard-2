from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = Path(tempfile.gettempdir()) / "dtc-dashboard-customer-intelligence"
BASE_URL = "http://127.0.0.1:8081/customer-intelligence"
REACT_PATH = Path("/Users/ln/Downloads/fc-platform/node_modules/react/umd/react.development.js")
REACT_DOM_PATH = Path("/Users/ln/Downloads/fc-platform/node_modules/react-dom/umd/react-dom.development.js")


def compiled_component():
    source = ROOT / "src/dashboard/components/customer-intelligence.jsx"
    script = """
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(process.argv[1], 'utf8');
process.stdout.write(ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 }
}).outputText);
"""
    return subprocess.check_output(
        ["node", "-e", script, str(source)],
        cwd=ROOT,
        text=True,
    )


def intelligence_fixture():
    opportunity = {
        "id": "supply_replenishment",
        "label": "Supply & replenishment",
        "description": "Current supply level and when customers expect to need more.",
        "recommendedAction": "Time replenishment communication to the customer's latest supply signal.",
        "priority": "high",
        "customerCount": 1,
        "reachableCount": 1,
        "knownCount": 0,
        "anonymousCount": 0,
        "recentCustomerCount": 1,
        "customerKeys": ["fc:user-1"],
        "latestSignalAt": "2026-08-11T03:15:00.000Z",
        "members": [{
            "userKey": "fc:user-1",
            "label": "customer@example.com",
            "identityStatus": "reachable",
            "channels": ["Email", "Shopify"],
            "magnetSn": "FC-010",
            "questionText": "At your current rate, how long will your current supply last?",
            "answerLabel": "Less than 1 week",
            "answeredAt": "2026-08-11T03:15:00.000Z",
        }],
    }
    answer = {
        "id": "answer-1",
        "questionKey": "customer_signal:CORE-02",
        "questionId": "CORE-02",
        "questionText": "At your current rate, how long will your current supply last?",
        "source": "customer_signal",
        "sourceLabel": "FC standard questions",
        "campaignId": "fc-standard-v2",
        "campaignName": "Question bank v2",
        "category": "core",
        "categoryLabel": "Core signals",
        "topicId": "fc:supply_replenishment",
        "topicLabel": "Supply & replenishment",
        "topicSource": "fc_standard",
        "fieldKey": "remaining_supply_duration",
        "userKey": "fc:user-1",
        "userLabel": "customer@example.com",
        "identified": True,
        "identityStatus": "reachable",
        "channels": ["Email", "Shopify"],
        "magnetId": 10,
        "magnetSn": "FC-010",
        "action": "answered",
        "optionId": "CORE-02:less_than_1_week",
        "value": "less_than_1_week",
        "answerLabel": "Less than 1 week",
        "otherText": None,
        "responseTimeMs": 840,
        "answeredAt": "2026-08-11T03:15:00.000Z",
    }
    return {
        "dateRange": {"startAt": None, "endAt": None},
        "signalLibrary": {
            "id": "fc-standard-v2",
            "label": "Question bank v2",
            "questionCount": 5,
            "updatedAt": "2026-08-11T04:41:26.000Z",
        },
        "summary": {
            "answers": 42,
            "respondents": 28,
            "identifiedCustomers": 19,
            "reachableCustomers": 15,
            "actionableCustomers": 13,
            "activeAudiences": 3,
            "recentAnswers": 17,
            "zeroPartyDataCaptureRate": 0.5,
            "zeroPartyCapturedHouseholds": 5,
            "zeroPartyExposedHouseholds": 10,
            "zeroPartyCaptureCoverage": "survey_campaign_impressions",
            "updatedAt": "2026-08-11T03:15:00.000Z",
        },
        "questions": [{
            "key": "customer_signal:CORE-02",
            "id": "CORE-02",
            "source": "customer_signal",
            "sourceLabel": "FC standard questions",
            "campaignId": "fc-standard-v2",
            "campaignName": "Question bank v2",
            "category": "core",
            "categoryLabel": "Core signals",
            "topicId": "fc:supply_replenishment",
            "topicLabel": "Supply & replenishment",
            "topicSource": "fc_standard",
            "fieldKey": "remaining_supply_duration",
            "text": "At your current rate, how long will your current supply last?",
            "displayOrder": 2,
            "answered": 28,
            "skipped": 2,
            "answerRate": 0.933,
            "avgResponseTimeMs": 840,
            "latestAnsweredAt": "2026-08-11T03:15:00.000Z",
            "options": [
                {"id": "CORE-02:already_out", "value": "already_out", "label": "Already out", "isOther": False, "count": 4, "share": 0.143},
                {"id": "CORE-02:less_than_1_week", "value": "less_than_1_week", "label": "Less than 1 week", "isOther": False, "count": 10, "share": 0.357},
                {"id": "CORE-02:about_2_weeks", "value": "about_2_weeks", "label": "About 2 weeks", "isOther": False, "count": 9, "share": 0.321},
                {"id": "CORE-02:weeks_2_4", "value": "weeks_2_4", "label": "2–4 weeks", "isOther": False, "count": 5, "share": 0.179},
            ],
        }],
        "answers": [answer],
        "opportunities": [
            {
                **opportunity,
                "id": "usage",
                "label": "Usage",
                "description": "How customers start, continue, and experience product use.",
                "recommendedAction": "Use the latest usage signal to tailor education, support, or product guidance.",
                "priority": "medium",
                "customerCount": 4,
                "reachableCount": 2,
                "knownCount": 1,
                "anonymousCount": 1,
                "recentCustomerCount": 2,
            },
            opportunity,
            {
                **opportunity,
                "id": "repeat_purchase",
                "label": "Repeat purchase",
                "description": "Purchase intent and the reasons customers may reorder, switch, or stop.",
                "recommendedAction": "Segment follow-up by purchase intent and address the stated barrier or preference.",
                "priority": "high",
                "customerCount": 8,
                "reachableCount": 6,
                "knownCount": 1,
                "anonymousCount": 1,
                "recentCustomerCount": 5,
            },
        ],
        "customers": [{
            "userKey": "fc:user-1",
            "label": "customer@example.com",
            "identified": True,
            "identityStatus": "reachable",
            "channels": ["Email", "Shopify"],
            "email": "customer@example.com",
            "magnetId": 10,
            "magnetSn": "FC-010",
            "responseCount": 3,
            "lastAnsweredAt": "2026-08-11T03:15:00.000Z",
            "opportunityIds": ["supply_replenishment", "repeat_purchase"],
            "latestAnswers": [answer],
            "history": [answer],
        }],
        "truncated": False,
    }


def recommendation_fixture():
    rule = {"field": "answer.value", "operator": "in", "questionKey": "customer_signal:CORE-02", "value": ["less_than_1_week", "about_2_weeks"]}
    return {"configured": True, "recommendations": [{
        "id": "rec-1", "versionId": "rec-v1", "version": 1, "name": "Near-term replenishment opportunity",
        "topicId": "fc:supply_replenishment", "decisionUse": "customer_action", "status": "ready",
        "aiGenerated": True, "disclosure": "AI-generated decision support based on the evidence shown here. The system validates rules and readiness; the brand decides what to do.",
        "summary": "Customers report less than two weeks of supply. A timely Segment and replenishment coupon may reduce stock-out risk after brand review.",
        "segmentSuggestion": {"action": "create_segment", "summary": "Create a Segment of customers with less than two weeks of supply."},
        "couponSuggestion": {
            "action": "suggest_coupon",
            "offerIdea": "Useful replenishment coupon after brand review",
        },
        "recommendedAction": "Create Segment, then configure coupon: Useful replenishment coupon after brand review",
        "analysisRunId": "run-visual-1",
        "analyzedAt": "2026-08-11T03:15:00.000Z",
        "rules": {"all": [rule]}, "exclusions": {"any": []}, "sampleCount": 28,
        "matchedCount": 10, "reachableCount": 7, "limitations": ["Marketing consent must be checked before activation."],
        "evidence": [{
            "evidenceId": "customer_signal:answer-1",
            "userKey": "fc:user-1",
            "questionKey": "customer_signal:CORE-02",
            "value": "less_than_1_week",
            "answeredAt": "2026-08-11T03:15:00.000Z",
            "identityStatus": "reachable",
            "reachableChannels": ["Email"],
        }], "updatedAt": "2026-08-11T03:15:00.000Z",
    }]}


def run():
    errors = []
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        )
        for name, width, height in [("desktop", 1440, 1000), ("mobile-365", 365, 844), ("mobile-390", 390, 844), ("mobile-430", 430, 900)]:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
            page.on("pageerror", lambda error: errors.append(f"page: {error}"))
            def route_api(route):
                path = urlparse(route.request.url).path
                if path == "/api/customer-intelligence/recommendations":
                    route.fulfill(status=200, content_type="application/json", json=recommendation_fixture())
                elif path == "/api/customer-intelligence/impact":
                    route.fulfill(status=200, content_type="application/json", json={"attributionConnected": False, "message": "Activation lineage is recorded. Order attribution is not connected.", "activations": []})
                else:
                    route.fulfill(status=200, content_type="application/json", json={"intelligence": intelligence_fixture()})
            page.route("**/api/customer-intelligence**", route_api)
            page.route("**/api/segments/preview", lambda route: route.fulfill(status=200, content_type="application/json", json={"preview": {"ruleHash": "hash-1", "matchedCount": 10, "reachableCount": 7, "excludedCount": 0, "members": [{"userKey": "fc:user-1", "reasons": ["Matched the reviewed answer rule"]}], "segmentRecommendation": {"decision": "create_new", "segmentId": None, "segmentName": None, "reasons": ["No existing Segment contains the validated members."]}}}))
            page.goto("http://127.0.0.1:8081/health", wait_until="domcontentloaded", timeout=30000)
            page.set_content("""
              <!doctype html><html><head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="stylesheet" href="http://127.0.0.1:8081/styles/styles.css">
              </head><body>
                <div class="admin-app customer-intelligence-active">
                  <aside class="admin-sidebar">
                    <div class="admin-sidebar-brand"><div><div class="admin-sidebar-title">FridgeChannel</div><div class="admin-sidebar-sub">Admin</div></div></div>
                    <nav class="admin-nav"><div class="admin-nav-group"><div class="admin-nav-group-label">Overview</div>
                      <button class="admin-nav-item"><span class="admin-nav-label">Dashboard</span></button>
                      <button class="admin-nav-item active"><span class="admin-nav-label">Customer Intelligence</span></button>
                      <button class="admin-nav-item"><span class="admin-nav-label">Orders &amp; Delivery</span></button>
                    </div></nav>
                  </aside>
                  <div class="admin-main"><div id="root"></div></div>
                </div>
              </body></html>
            """, wait_until="load")
            page.add_script_tag(path=str(REACT_PATH))
            page.add_script_tag(path=str(REACT_DOM_PATH))
            page.add_script_tag(content="""
              window.I = { info: () => React.createElement('span', { className: 'info' }, 'i') };
              window.PageLoading = () => React.createElement('div', { className: 'page-loading' }, 'Loading');
              window.FCFmt = {
                fmtInt: (value) => Number(value || 0).toLocaleString(),
                fmtPct: (value, digits) => `${(Number(value || 0) * 100).toFixed(digits)}%`,
              };
            """)
            page.add_script_tag(content=compiled_component())
            page.add_script_tag(content="ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.CustomerIntelligencePage));")
            page.wait_for_selector(".ci-page h1", timeout=30000)
            page.wait_for_selector(".ci-tabs", timeout=30000)
            assert page.locator(".ci-page h1").count() == 1
            assert page.locator(".ci-page h2").count() == 0
            assert page.locator(".ci-page .card").count() == 0
            assert page.get_by_role("heading", name="Customer Intelligence").is_visible()
            assert page.get_by_role("button", name="Overview", exact=True).count() == 0
            assert page.locator(".ci-tabs button").all_text_contents() == ["Answers", "Recommendations"]
            assert page.get_by_text("Ready recommendations", exact=True).is_visible()
            assert page.get_by_text("Zero-Party Data Capture Rate", exact=True).is_visible()
            assert page.get_by_text("5 / 10 households", exact=True).is_visible()
            assert page.get_by_role("button", name="Impact", exact=True).count() == 0
            overflow = page.evaluate("({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, offenders: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map(el => ({className: el.className, right: Math.round(el.getBoundingClientRect().right)}))})")
            assert overflow["scrollWidth"] <= overflow["clientWidth"], overflow
            page.wait_for_timeout(250)
            page.screenshot(path=str(ARTIFACT_DIR / f"customer-intelligence-answers-{name}.png"), full_page=True)
            assert page.get_by_text("FC standard · Supply & replenishment · Question bank v2").is_visible()
            assert page.locator(".ci-question-metrics span", has_text="Latest response").is_visible()
            page.get_by_text("At your current rate, how long will your current supply last?").first.click()
            page.get_by_role("button", name="Less than 1 week 10 · 35.7%").click()
            assert page.get_by_text("customer@example.com").first.is_visible()
            page.wait_for_timeout(250)
            page.screenshot(path=str(ARTIFACT_DIR / f"customer-intelligence-answer-detail-{name}.png"), full_page=True)
            page.get_by_role("button", name="Recommendations", exact=True).click()
            page.get_by_text("AI-generated", exact=True).first.wait_for(state="visible")
            assert page.get_by_text("Near-term replenishment opportunity", exact=True).last.is_visible()
            assert page.get_by_role("combobox", name="Signal topic").is_visible()
            assert page.get_by_role("combobox", name="Recommendation status").is_visible()
            assert page.get_by_text("Recommended now", exact=True).is_visible()
            assert page.get_by_text("Segment suggestion", exact=True).is_visible()
            assert page.get_by_text("Coupon suggestion", exact=True).is_visible()
            assert page.get_by_text("Review again when", exact=True).is_visible()
            assert page.get_by_text("Review carefully", exact=True).is_visible()
            assert page.get_by_text("At your current rate, how long will your current supply last? · Less than 1 week", exact=False).is_visible()
            assert page.get_by_text("undefined", exact=True).count() == 0
            page.get_by_role("button", name="Review suggestion").click()
            page.get_by_text("Matching customer evidence").count() == 0
            page.locator(".ci-preview-members").wait_for(state="visible")
            assert page.get_by_role("button", name="Create new Segment").is_visible()
            assert page.locator(".ci-page h1").count() == 1
            assert page.locator(".ci-page h2").count() == 0
            overflow = page.evaluate("({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, offenders: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map(el => ({className: el.className, right: Math.round(el.getBoundingClientRect().right)}))})")
            assert overflow["scrollWidth"] <= overflow["clientWidth"], overflow
            page.wait_for_timeout(250)
            page.screenshot(path=str(ARTIFACT_DIR / f"customer-intelligence-recommendation-{name}.png"), full_page=True)
            page.close()
        browser.close()
    if errors:
        raise AssertionError("\n".join(errors))


if __name__ == "__main__":
    run()
