import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'https://celebrated-pastelito-a57194.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/api/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const images = new Set();

    $('img').each((_, element) => {
      const srcAttrs = ['src', 'data-src', 'data-original', 'data-lazy-src'];
      let imageUrl = null;

      for (const attr of srcAttrs) {
        const src = $(element).attr(attr);
        if (src) {
          try {
            imageUrl = new URL(src, url).href;
            break;
          } catch (e) {
            console.error('Invalid URL:', src);
          }
        }
      }

      if (imageUrl && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(imageUrl)) {
        images.add(imageUrl);
      }
    });

    $('[style*="background"]').each((_, element) => {
      const style = $(element).attr('style');
      const match = style?.match(/url\(['"]?(.*?)['"]?\)/);
      if (match && match[1]) {
        try {
          const imageUrl = new URL(match[1], url).href;
          if (/\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(imageUrl)) {
            images.add(imageUrl);
          }
        } catch (e) {
          console.error('Invalid background URL:', match[1]);
        }
      }
    });

    const imageArray = Array.from(images);
    if (imageArray.length === 0) {
      return res.status(404).json({ 
        error: 'No images found',
        message: 'No valid images were found on the provided URL.'
      });
    }

    res.json({ images: imageArray });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch images',
      details: error.message 
    });
  }
});

app.post('/api/download-all', async (req, res) => {
  try {
    const { urls, folderName } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Valid URLs array is required' });
    }

    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    // Pipe archive data to the response
    archive.pipe(res);

    // Download each image and add to the archive
    const downloadPromises = urls.map(async (url, index) => {
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          validateStatus: status => status === 200
        });

        // Extract file extension from URL or content type
        let ext = path.extname(url.split('?')[0]).toLowerCase() || '.jpg';
        if (!ext.match(/\.(jpe?g|png|gif|webp)$/i)) {
          const contentType = response.headers['content-type'];
          ext = contentType.includes('jpeg') ? '.jpg' :
                contentType.includes('png') ? '.png' :
                contentType.includes('gif') ? '.gif' :
                contentType.includes('webp') ? '.webp' : '.jpg';
        }

        // Create a unique filename
        const fileName = `${folderName}/${String(index + 1).padStart(3, '0')}${ext}`;

        // Add the buffer to the archive
        archive.append(Buffer.from(response.data), { name: fileName });
        return true;
      } catch (error) {
        console.error(`Failed to download image ${url}:`, error.message);
        return false;
      }
    });

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);

    // Finalize the archive
    await archive.finalize();
  } catch (error) {
    console.error('Download all error:', error);
    res.status(500).json({
      error: 'Failed to create zip file',
      details: error.message
    });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    const contentType = response.headers['content-type'];
    if (!contentType?.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to an image' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment');

    response.data.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download image',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
