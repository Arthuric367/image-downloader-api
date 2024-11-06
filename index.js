import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { PassThrough } from 'stream';
import * as cheerio from 'cheerio';
import archiver from 'archiver';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || isDev) {
      return callback(null, true);
    }
    const allowedOrigins = [
      'celebrated-pastelito-a57194.netlify.app',
      'localhost',
      '127.0.0.1'
    ];
    if (allowedOrigins.some(domain => origin.includes(domain))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition']
};

app.use(cors(corsOptions));
app.use(express.json());

const logError = (error, context) => {
  console.error({
    context,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: error.config?.url,
    status: error.response?.status,
    statusText: error.response?.statusText,
  });
};

const downloadWithRetry = async (url, attempt = 1, maxAttempts = 3) => {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: status => status === 200,
      maxRedirects: 5
    });
    return response.data;
  } catch (error) {
    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadWithRetry(url, attempt + 1, maxAttempts);
    }
    throw error;
  }
};

app.post('/api/fetch-images', async (req, res) => {
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

app.post('/api/download-all', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    // Set up ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="images-${Date.now()}.zip"`);

    // Pipe archive data to response
    archive.pipe(res);

    // Download and add each image to the archive
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

    // Finalize archive once all images are appended
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

app.get('/api/download', async (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
