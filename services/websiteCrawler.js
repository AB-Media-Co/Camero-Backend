// services/websiteCrawler.js
import { chromium } from 'playwright';

const sanitizeText = (text = '') =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

const truncate = (text = '', limit = 800) =>
  text.length > limit ? `${text.slice(0, limit).trim()}…` : text;

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Auto-crawl website starting from given URLs.
 * - Follows internal links only
 * - Avoids duplicates
 * - Respects maxPages limit
 */
export const crawlWebsitePages = async ({
  urls = [],          // seed URLs (e.g. baseUrl + optional extra paths)
  maxPages = 10,      // how many pages max to scrape
  timeoutMs = 45000,
  waitUntil = 'networkidle',
  viewport = DEFAULT_VIEWPORT
}) => {
  if (!urls.length) {
    return [];
  }

  const browser = await chromium.launch();
  const results = [];
  const visited = new Set();
  const queue = [];

  // Normalize seed URLs
  urls.forEach((raw) => {
    try {
      const url = new URL(raw).href;
      if (!queue.includes(url)) {
        queue.push(url);
      }
    } catch (e) {
      // ignore invalid URL
    }
  });

  try {
    while (queue.length && results.length < maxPages) {
      const current = queue.shift();
      if (!current) continue;

      let currentUrl;
      try {
        currentUrl = new URL(current).href;
      } catch {
        continue;
      }

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      const page = await browser.newPage({ viewport });

      try {
        await page.goto(currentUrl, { waitUntil, timeout: timeoutMs });

        const snapshot = await page.evaluate(() => {
          const getText = (selector) =>
            Array.from(document.querySelectorAll(selector))
              .map((node) => node.innerText || node.textContent || '')
              .map((text) => text.trim())
              .filter(Boolean);

          const links = Array.from(document.querySelectorAll('a[href]'))
            .map((a) => a.href)
            .filter(Boolean);

          return {
            title: document.title || '',
            headings: getText('h1, h2'),
            paragraphs: getText('p'),
            links
          };
        });

        const mergedParagraphs = sanitizeText(snapshot.paragraphs.join(' '));
        const summarySource = snapshot.headings.join(' • ') || snapshot.title;
        const summary = truncate(`${summarySource} — ${mergedParagraphs}`, 600);

        console.log(`✅ Crawled: ${currentUrl} (${mergedParagraphs.length} chars)`);

        results.push({
          url: currentUrl,
          title: snapshot.title || currentUrl,
          headings: snapshot.headings.slice(0, 5),
          contentPreview: truncate(mergedParagraphs, 1200),
          summary,
          capturedAt: new Date(),
          status: 'success'
        });

        // ---- enqueue internal links for further crawling ----
        const origin = new URL(currentUrl).origin;

        snapshot.links.forEach((link) => {
          try {
            let abs = new URL(link, currentUrl).href;

            // only same-origin links (internal)
            if (!abs.startsWith(origin)) return;

            // strip hash fragments
            const hashIndex = abs.indexOf('#');
            if (hashIndex !== -1) {
              abs = abs.slice(0, hashIndex);
            }

            // basic filtering for mailto/tel/javascript
            if (
              abs.startsWith('mailto:') ||
              abs.startsWith('tel:') ||
              abs.startsWith('javascript:')
            ) {
              return;
            }

            if (!visited.has(abs) && !queue.includes(abs)) {
              // don't let queue explode too much beyond maxPages
              if (queue.length + results.length < maxPages * 3) {
                // Check if this is a policy page - prioritize it
                const urlLower = abs.toLowerCase();
                const isPolicyPage =
                  urlLower.includes('/shipping') ||
                  urlLower.includes('/delivery') ||
                  urlLower.includes('/return') ||
                  urlLower.includes('/refund') ||
                  urlLower.includes('/payment') ||
                  urlLower.includes('/contact') ||
                  urlLower.includes('/about') ||
                  urlLower.includes('/track') ||
                  urlLower.includes('/cancel') ||
                  urlLower.includes('/modif') ||
                  urlLower.includes('/offer') ||
                  urlLower.includes('/sale') ||
                  urlLower.includes('/discount') ||
                  urlLower.includes('/faq') ||
                  urlLower.includes('/help') ||
                  urlLower.includes('/policies/') ||
                  urlLower.includes('/pages/');

                // Add policy pages to the front of the queue, others to the back
                if (isPolicyPage) {
                  queue.unshift(abs); // Add to front
                } else {
                  queue.push(abs); // Add to back
                }
              }
            }
          } catch (e) {
            // ignore invalid links
          }
        });
      } catch (error) {
        results.push({
          url: currentUrl,
          title: currentUrl,
          headings: [],
          contentPreview: '',
          summary: '',
          capturedAt: new Date(),
          status: 'error',
          errorMessage: error.message
        });
      } finally {
        await page.close();
      }
    }

    return results;
  } finally {
    await browser.close();
  }
};

export default {
  crawlWebsitePages
};
