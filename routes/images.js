import express from 'express';
import puppeteer from 'puppeteer';
import archiver from 'archiver';
import { randomUUID } from 'crypto';
import { logError } from '../utils/error.js';

const router = express.Router();

// ─── In-memory session store ──────────────────────────────────────────────────
// Each session holds the raw image bytes captured during browser rendering.
// Images are served from here — no re-fetching, no expiry problems.
const sessions = new Map();

// Auto-expire sessions after 15 minutes to free memory
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CONTENT_TYPE_TO_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/avif': 'avif', 'image/bmp': 'bmp',
};

function getExt(contentType) {
  const base = (contentType || '').split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_TO_EXT[base] || 'jpg';
}

// ─── Fetch images using a real headless browser ───────────────────────────────
// Puppeteer opens the page exactly like Chrome would. We intercept every image
// response as it downloads — capturing the bytes immediately so signed/expiring
// URLs are never a problem.
router.post('/fetch-images', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const capturedImages = [];
    const seenUrls = new Set();

    // Intercept every image response the browser receives
    page.on('response', async (response) => {
      try {
        const ct = (response.headers()['content-type'] || '').split(';')[0].trim();
        if (!ct.startsWith('image/')) return;
        if (response.status() !== 200) return;

        const imgUrl = response.url();
        if (imgUrl.startsWith('data:') || seenUrls.has(imgUrl)) return;
        seenUrls.add(imgUrl);

        const buffer = await response.buffer();
        if (buffer.length < 2048) return; // Skip tiny images under 2 KB (icons, trackers)

        capturedImages.push({
          id: capturedImages.length,
          originalUrl: imgUrl,
          contentType: ct,
          data: buffer,
          size: buffer.length,
        });
      } catch {
        // Ignore errors for individual images — keep going
      }
    });

    // Navigate and wait for the initial page load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Auto-scroll to trigger lazy-loaded images
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let scrolled = 0;
        const step = 500;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          scrolled += step;
          if (scrolled >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 150);
      });
    });

    // Wait briefly for any remaining lazy-load responses to arrive
    await new Promise(r => setTimeout(r, 2000));

    await browser.close();
    browser = null;

    // Store captured images in session
    const sessionId = randomUUID();
    sessions.set(sessionId, { createdAt: Date.now(), images: capturedImages });

    // Return metadata only — actual bytes stay on the server
    res.json({
      sessionId,
      images: capturedImages.map(({ id, originalUrl, contentType, size }) => ({
        id, originalUrl, contentType, size,
      })),
    });
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    logError(error, 'Fetch images error');
    res.status(500).json({ error: 'Failed to fetch images', details: error.message });
  }
});

// ─── Session endpoints ────────────────────────────────────────────────────────

// Serve image preview (used by the <img> tag in the frontend)
router.get('/session/:sid/image/:id', (req, res) => {
  const session = sessions.get(req.params.sid);
  if (!session) return res.status(410).json({ error: 'Session expired. Please extract again.' });
  const img = session.images[Number(req.params.id)];
  if (!img) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Content-Type', img.contentType);
  res.setHeader('Cache-Control', 'private, max-age=900');
  res.send(img.data);
});

// Download a single image
router.get('/session/:sid/download/:id', (req, res) => {
  const session = sessions.get(req.params.sid);
  if (!session) return res.status(410).json({ error: 'Session expired. Please extract again.' });
  const img = session.images[Number(req.params.id)];
  if (!img) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Content-Type', img.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="image-${img.id + 1}.${getExt(img.contentType)}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.send(img.data);
});

// Download a specific selection of images as ZIP
router.post('/session/:sid/download-selected', async (req, res) => {
  const session = sessions.get(req.params.sid);
  if (!session) return res.status(410).json({ error: 'Session expired. Please extract again.' });
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  try {
    const selected = ids.map(id => session.images[id]).filter(Boolean);
    const archive = archiver('zip', { zlib: { level: 5 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="images-${Date.now()}.zip"`);
    archive.pipe(res);
    selected.forEach((img, i) => {
      archive.append(img.data, { name: `image-${String(i + 1).padStart(3, '0')}.${getExt(img.contentType)}` });
    });
    await archive.finalize();
  } catch (error) {
    logError(error, 'Download selected error');
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create zip' });
  }
});

// Download all images in the session as ZIP
router.get('/session/:sid/download-all', async (req, res) => {
  const session = sessions.get(req.params.sid);
  if (!session) return res.status(410).json({ error: 'Session expired. Please extract again.' });
  try {
    const archive = archiver('zip', { zlib: { level: 5 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="images-${Date.now()}.zip"`);
    archive.pipe(res);
    session.images.forEach((img, i) => {
      archive.append(img.data, { name: `image-${String(i + 1).padStart(3, '0')}.${getExt(img.contentType)}` });
    });
    await archive.finalize();
  } catch (error) {
    logError(error, 'Download all error');
    if (!res.headersSent) res.status(500).json({ error: 'Failed to create zip' });
  }
});

export default router;

