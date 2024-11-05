import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    try {
      const hostname = new URL(origin).hostname;
      
      if (isDev && hostname === 'localhost') {
        return callback(null, true);
      }
      
      const allowedOrigins = [
        'celebrated-pastelito-a57194.netlify.app'
      ];
      
      if (allowedOrigins.some(domain => origin.includes(domain))) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    } catch (error) {
      callback(new Error('Invalid origin'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  res.json({ status: 'healthy', message: 'Image Downloader API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', message: 'Image Downloader API is running' });
});

const customAxios = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
  }
});

// Helper function to download a single image with retries
async function downloadImage(url, retries = 2) {
  try {
    const response = await customAxios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: status => status === 200
    });

    return response.data;
  } catch (error) {
    if (retries > 0) {
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return downloadImage(url, retries - 1);
    }
    throw error;
  }
}

app.post('/api/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await customAxios.get(url);
    const images = [];

    // Extract image URLs from response
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;
    while ((match = imgRegex.exec(response.data)) !== null) {
      try {
        const imageUrl = new URL(match[1], url).href;
        if (/\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(imageUrl)) {
          images.push(imageUrl);
        }
      } catch (e) {
        console.error('Invalid image URL:', match[1]);
      }
    }

    if (images.length === 0) {
      return res.status(404).json({
        error: 'No images found',
        message: 'Could not find any valid images on the page.'
      });
    }

    res.json({ images });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Failed to fetch images',
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

    console.log('Downloading image:', url);

    const imageData = await downloadImage(url);
    
    // Get file extension from URL
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment');
    res.send(imageData);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Failed to download image',
      details: error.message
    });
  }
});

app.post('/api/download-all', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Valid URLs array is required' });
    }

    // Download images in parallel with a concurrency limit
    const concurrencyLimit = 5;
    const results = [];
    
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      const batch = urls.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (url, index) => {
        try {
          const imageData = await downloadImage(url);
          const ext = url.split('?')[0].split('.').pop().toLowerCase();
          return {
            success: true,
            index: i + index,
            data: imageData,
            ext
          };
        } catch (error) {
          console.error(`Failed to download image ${i + index}:`, error.message);
          return {
            success: false,
            index: i + index,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Filter successful downloads
    const successfulDownloads = results.filter(r => r.success);
    
    if (successfulDownloads.length === 0) {
      return res.status(500).json({ error: 'Failed to download any images' });
    }

    // Send successful downloads as a ZIP file
    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 }});
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="images.zip"');
    
    archive.pipe(res);

    successfulDownloads.forEach(result => {
      const fileName = `image-${String(result.index + 1).padStart(3, '0')}.${result.ext}`;
      archive.append(Buffer.from(result.data), { name: fileName });
    });

    await archive.finalize();
  } catch (error) {
    console.error('Download all error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to create zip file',
        details: error.message
      });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
