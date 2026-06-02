import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import { downloadWithRetry } from '../utils/download.js';
import { logError } from '../utils/error.js';

const router = express.Router();

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function resolveUrl(src, base) {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null;
  try {
    return new URL(src.trim(), base).href;
  } catch {
    return null;
  }
}

function parseSrcset(srcset, base) {
  return srcset
    .split(',')
    .map(part => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map(src => resolveUrl(src, base))
    .filter(Boolean);
}

router.post('/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 30000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);
    const images = new Set();

    const add = (src) => {
      const resolved = resolveUrl(src, url);
      if (resolved) images.add(resolved);
    };

    // <img> — src + common lazy-load data attributes + srcset
    $('img').each((_, el) => {
      const e = $(el);
      ['src', 'data-src', 'data-lazy', 'data-original', 'data-lazy-src',
       'data-hi-res', 'data-full', 'data-image'].forEach(attr => {
        const v = e.attr(attr);
        if (v) add(v);
      });
      const srcset = e.attr('srcset') || e.attr('data-srcset');
      if (srcset) parseSrcset(srcset, url).forEach(u => images.add(u));
    });

    // <source> inside <picture>
    $('source').each((_, el) => {
      const srcset = $(el).attr('srcset') || $(el).attr('data-srcset');
      if (srcset) parseSrcset(srcset, url).forEach(u => images.add(u));
      const src = $(el).attr('src');
      if (src) add(src);
    });

    // Open Graph / Twitter Card meta tags
    $('meta').each((_, el) => {
      const prop = $(el).attr('property') || $(el).attr('name') || '';
      if (/og:image|twitter:image/.test(prop)) {
        const content = $(el).attr('content');
        if (content) add(content);
      }
    });

    // Inline background-image styles (best-effort)
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
      if (match) add(match[1]);
    });

    res.json({ images: Array.from(images) });
  } catch (error) {
    logError(error, 'Fetch images error');
    res.status(500).json({
      error: 'Failed to fetch images',
      details: error.message,
    });
  }
});

router.post('/download-all', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    const archive = archiver('zip', { zlib: { level: 5 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="images-${Date.now()}.zip"`);

    archive.pipe(res);

    for (let i = 0; i < urls.length; i++) {
      try {
        const { data, ext } = await downloadWithRetry(urls[i]);
        const fileName = `image-${String(i + 1).padStart(3, '0')}.${ext}`;
        archive.append(data, { name: fileName });
      } catch (error) {
        console.error(`Skipping ${urls[i]}:`, error.message);
      }
    }

    await archive.finalize();
  } catch (error) {
    logError(error, 'Batch download error');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to create zip file',
        details: error.message,
      });
    }
  }
});

router.get('/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const { data, contentType, ext } = await downloadWithRetry(url);
    const fileName = `image-${Date.now()}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    res.send(Buffer.from(data));
  } catch (error) {
    logError(error, 'Download error');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download image',
        details: error.message,
      });
    }
  }
});

// Proxy endpoint for image previews — lets the browser display images
// from sites that block direct hotlinking by setting a matching Referer.
router.get('/proxy-image', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).end();

  try {
    const headers = {
      'User-Agent': BROWSER_HEADERS['User-Agent'],
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    };
    if (referer) headers['Referer'] = referer;

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers,
      timeout: 15000,
      maxRedirects: 5,
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(response.data));
  } catch {
    res.status(404).end();
  }
});

export default router;

