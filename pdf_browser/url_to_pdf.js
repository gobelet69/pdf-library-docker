#!/usr/bin/env node
const { chromium } = require("playwright");
const { createSafeProxy, resolvePublicTarget } = require("./url_policy");

const [, , inputUrl, outputPath] = process.argv;

if (!inputUrl || !outputPath) {
  console.error("Usage: url_to_pdf.js <url> <output.pdf>");
  process.exit(64);
}

const CONSENT_RE = /^(accept|agree|allow all|reject|reject all|reject non-essential|continue without accepting|save choices|got it|ok)$/i;
const OVERLAY_RE = /(privacy notice|cookie|cookies|consent|partners|personal data|manage settings|reject non-essential)/i;
const READABILITY_PATH = require.resolve("@mozilla/readability/Readability.js");

async function clickConsentInFrame(frame) {
  const candidates = [
    frame.getByRole("button", { name: /reject non-essential/i }),
    frame.getByRole("button", { name: /reject all/i }),
    frame.getByRole("button", { name: /continue without accepting/i }),
    frame.getByRole("button", { name: /^accept$/i }),
    frame.getByRole("button", { name: /accept all/i }),
    frame.getByText(/reject non-essential/i),
    frame.getByText(/^accept$/i),
  ];

  for (const locator of candidates) {
    try {
      const count = await locator.count();
      if (!count) continue;
      await locator.first().click({ timeout: 1200 });
      await frame.page().waitForTimeout(600);
      return true;
    } catch (_) {
      // Try the next common consent control.
    }
  }
  return false;
}

async function removeConsentOverlays(page) {
  await page.evaluate(({ overlaySource, consentSource }) => {
    const overlayRe = new RegExp(overlaySource, "i");
    const consentRe = new RegExp(consentSource, "i");
    const textOf = (node) => (node.innerText || node.textContent || "").trim();
    const elements = [...document.querySelectorAll("body *")];
    for (const element of elements) {
      const style = window.getComputedStyle(element);
      const text = textOf(element);
      if (!text || text.length > 4000) continue;
      const isOverlayPosition = ["fixed", "sticky"].includes(style.position);
      const blocksScreen = element.offsetWidth > window.innerWidth * 0.45 && element.offsetHeight > window.innerHeight * 0.12;
      const hasConsentButton = [...element.querySelectorAll("button, a")].some((node) => consentRe.test(textOf(node)));
      if (isOverlayPosition && blocksScreen && overlayRe.test(text) && hasConsentButton) {
        element.remove();
      }
    }
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
  }, { overlaySource: OVERLAY_RE.source, consentSource: CONSENT_RE.source });
}

async function preparePageForPdf(page) {
  await page.evaluate(() => {
    const NAV_RE = /(nav|menu|header|toolbar|topbar|navbar|masthead|subscribe|search|share|social|newsletter|floating|sticky|cookie|consent|privacy)/i;
    const textOf = (node) => (node.innerText || node.textContent || "").trim();
    const elements = [...document.querySelectorAll("body *")];

    for (const element of elements) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const text = textOf(element);
      const label = [
        element.tagName,
        element.id,
        element.className,
        element.getAttribute("role"),
        element.getAttribute("aria-label"),
        text.slice(0, 120),
      ].join(" ");
      const fixedOrSticky = ["fixed", "sticky"].includes(style.position);
      if (!fixedOrSticky) continue;

      const coversWidth = rect.width >= window.innerWidth * 0.35;
      const topChrome = rect.top <= 180 && rect.height <= 220 && coversWidth;
      const bottomChrome = rect.bottom >= window.innerHeight - 220 && rect.height <= 260 && coversWidth;
      const sideWidget = rect.width <= 360 && rect.height <= window.innerHeight * 0.8 && (rect.left <= 30 || rect.right >= window.innerWidth - 30);
      const navLike = NAV_RE.test(label);

      if ((topChrome || bottomChrome || sideWidget) && navLike) {
        element.remove();
      } else if (fixedOrSticky && navLike) {
        element.style.setProperty("position", "static", "important");
        element.style.setProperty("transform", "none", "important");
        element.style.setProperty("inset", "auto", "important");
      }
    }

    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
      html, body {
        overflow: visible !important;
        height: auto !important;
      }
      img, video, canvas, svg {
        max-width: 100% !important;
      }
      iframe, aside, [role="dialog"], [aria-modal="true"] {
        max-width: 100% !important;
      }
      [class*="sticky" i],
      [class*="floating" i],
      [class*="share" i],
      [class*="newsletter" i] {
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
    window.scrollTo(0, 0);
  });
}

function cleanUrl(value) {
  try {
    return new URL(value).href;
  } catch (_) {
    return "";
  }
}

async function applyReaderMode(page) {
  await page.addScriptTag({ path: READABILITY_PATH });
  const article = await page.evaluate(() => {
    const reader = new Readability(document.cloneNode(true), {
      keepClasses: false,
    });
    return reader.parse();
  });

  if (!article || !article.content || (article.textContent || "").trim().length < 500) {
    return false;
  }

  const baseHref = cleanUrl(page.url());
  const safeTitle = article.title || "Imported article";
  const byline = article.byline || "";
  const siteName = article.siteName || new URL(baseHref).hostname;
  const excerpt = article.excerpt || "";
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <base href="${escapeHtml(baseHref)}">
        <title>${escapeHtml(safeTitle)}</title>
        <style>
          @page { size: A4; margin: 16mm 17mm 18mm; }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #1d232b;
            font-family: ui-serif, Georgia, "Times New Roman", serif;
            font-size: 12.6pt;
            line-height: 1.58;
          }
          body { max-width: 720px; margin: 0 auto; }
          header { margin: 0 0 22px; padding-bottom: 18px; border-bottom: 1px solid #d9dde3; }
          .site { color: #5d6673; font: 700 9pt ui-sans-serif, system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
          h1 { margin: 7px 0 8px; font-size: 28pt; line-height: 1.08; letter-spacing: 0; }
          .byline, .excerpt { color: #596273; font-family: ui-sans-serif, system-ui, sans-serif; }
          .byline { font-size: 10pt; margin-top: 4px; }
          .excerpt { font-size: 11pt; margin-top: 12px; }
          article :is(nav, header, footer, aside, form, button, iframe, script, style, noscript) { display: none !important; }
          article { overflow-wrap: anywhere; }
          article h2, article h3, article h4 { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.18; break-after: avoid; }
          article h2 { margin: 26px 0 8px; font-size: 18pt; }
          article h3 { margin: 22px 0 8px; font-size: 15pt; }
          article p, article ul, article ol, article blockquote, article pre { margin: 0 0 13px; }
          article a { color: #174f7c; text-decoration: underline; }
          article img, article video, article canvas, article svg {
            display: block;
            max-width: 100% !important;
            height: auto !important;
            margin: 16px auto;
            break-inside: avoid;
          }
          article figure { margin: 18px 0; break-inside: avoid; }
          article figcaption { color: #697386; font: 9pt ui-sans-serif, system-ui, sans-serif; line-height: 1.35; margin-top: 6px; }
          article blockquote { border-left: 3px solid #c8d0da; padding-left: 14px; color: #424b57; }
          article pre, article code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9.5pt; }
          article pre { white-space: pre-wrap; background: #f4f6f8; padding: 10px 12px; border-radius: 4px; }
          article table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; break-inside: avoid; }
          article th, article td { border: 1px solid #d8dee6; padding: 6px 7px; vertical-align: top; }
        </style>
      </head>
      <body>
        <header>
          <div class="site">${escapeHtml(siteName)}</div>
          <h1>${escapeHtml(safeTitle)}</h1>
          ${byline ? `<div class="byline">${escapeHtml(byline)}</div>` : ""}
          ${excerpt ? `<div class="excerpt">${escapeHtml(excerpt)}</div>` : ""}
        </header>
        <article>${article.content}</article>
      </body>
    </html>`;

  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(600);
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

async function main() {
  const allowLoopback = process.env.PDF_RENDERER_TEST_ALLOW_LOOPBACK === "1";
  await resolvePublicTarget(inputUrl, undefined, { allowLoopback });
  const proxy = createSafeProxy({ allowLoopback });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: process.env.PDF_RENDERER_SANDBOX === "1",
      proxy: { server: `http://127.0.0.1:${proxy.address().port}`, bypass: "" },
      args: ["--proxy-bypass-list=<-loopback>"],
    });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 1800 },
      deviceScaleFactor: 1,
      locale: "en-US",
      reducedMotion: "reduce",
      bypassCSP: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.route("**/*", async (route) => {
      try {
        await resolvePublicTarget(route.request().url(), undefined, { allowLoopback });
        await route.continue();
      } catch (_) {
        await route.abort("blockedbyclient");
      }
    });

    await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    for (const frame of page.frames()) {
      await clickConsentInFrame(frame);
    }
    await removeConsentOverlays(page);
    let readerApplied = false;
    try {
      readerApplied = await applyReaderMode(page);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.warn(`Reader mode unavailable, falling back to page render: ${message}`);
    }
    if (!readerApplied) {
      await preparePageForPdf(page);
    }

    await page.emulateMedia({ media: readerApplied ? "print" : "screen" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });
  } finally {
    if (browser) await browser.close();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
