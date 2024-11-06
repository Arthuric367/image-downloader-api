import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { downloadWithRetry } from '../utils/download.js';
import { logError } from '../utils/error.js';

const router = express.Router();

router.post('/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      timeout: 30000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const images = new Set();

    $('img').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        try {
          const imageUrl = new URL(src, url).href;
          if (/\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(imageUrl)) {
            images.add(imageUrl);
          }
        } catch (e) {
          console.error('Invalid image URL:', src);
        }
      }
    });

    const imageArray = Array.from(images);
    res.json({ images: imageArray });
  } catch (error) {
    logError(error, 'Fetch images error');
    res.status(500).json({
      error: 'Failed to fetch images',
      details: error.message
    });
  }
});

router.post('/download-all', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    const archive = archiver('zip', { zlib: { level: 5 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="images-${Date.now()}.zip"`);

    archive.pipe(res);

    const downloadAndAppendImages = async () => {
      for (let i = 0; i < urls.length; i++) {
        try {
          const imageData = await downloadWithRetry(urls[i]);
          const fileName = `image-${String(i + 1).padStart(3, '0')}.jpg`;
          archive.append(imageData, { name: fileName });
        } catch (error) {
          console.error(`Failed to download image ${urls[i]}:`, error.message);
        }
      }
    };

    await downloadAndAppendImages();
    await archive.finalize();
  } catch (error) {
    logError(error, 'Batch download error');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to create zip file',
        details: error.message
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

    const imageData = await downloadWithRetry(url);
    const fileName = `image-${Date.now()}.jpg`;

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const stream = new PassThrough();
    stream.end(imageData);
    stream.pipe(res);
  } catch (error) {
    logError(error, 'Download error');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download image',
        details: error.message
      });
    }
  }
});

export default router;
