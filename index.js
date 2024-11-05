import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS with specific origins
const allowedOrigins = [
  'https://celebrated-pastelito-a57194.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  }
}));

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
  maxRedirects: 5,
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

app.post('/api/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Fetching images from:', url);

    // Try different approaches to fetch the page
    let response;
    try {
      // First attempt with default headers
      response = await customAxios.get(url);
    } catch (error) {
      console.log('First attempt failed, trying with different headers...');
      // Second attempt with minimal headers
      response = await customAxios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          'Accept': 'text/html,*/*',
        }
      });
    }

    const $ = cheerio.load(response.data);
    const images = new Set();

    // Helper function to clean and validate URLs
    const cleanUrl = (src) => {
      if (!src) return null;
      src = src.trim();
      
      // Handle data URLs
      if (src.startsWith('data:')) return src;
      
      // Handle protocol-relative URLs
      if (src.startsWith('//')) src = 'https:' + src;
      
      // Handle relative URLs
      try {
        return new URL(src, url).href;
      } catch (e) {
        console.error('Invalid URL:', src);
        return null;
      }
    };

    // Extract images from various sources
    const extractors = [
      // Regular img tags
      () => {
        $('img').each((_, el) => {
          const attrs = ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-srcset'];
          attrs.forEach(attr => {
            const value = $(el).attr(attr);
            if (value) {
              const cleanedUrl = cleanUrl(value);
              if (cleanedUrl) images.add(cleanedUrl);
            }
          });

          // Handle srcset
          const srcset = $(el).attr('srcset');
          if (srcset) {
            srcset.split(',').forEach(src => {
              const srcUrl = src.trim().split(' ')[0];
              const cleanedUrl = cleanUrl(srcUrl);
              if (cleanedUrl) images.add(cleanedUrl);
            });
          }
        });
      },

      // Background images
      () => {
        $('[style*="background"]').each((_, el) => {
          const style = $(el).attr('style');
          if (style) {
            const matches = style.match(/url\(['"]?(.*?)['"]?\)/g) || [];
            matches.forEach(match => {
              const imageUrl = match.replace(/url\(['"]?|['"]?\)/g, '');
              const cleanedUrl = cleanUrl(imageUrl);
              if (cleanedUrl) images.add(cleanedUrl);
            });
          }
        });
      },

      // Meta tags
      () => {
        $('meta[property*="image"], meta[name*="image"]').each((_, el) => {
          const content = $(el).attr('content');
          if (content) {
            const cleanedUrl = cleanUrl(content);
            if (cleanedUrl) images.add(cleanedUrl);
          }
        });
      },

      // Link tags
      () => {
        $('link[rel*="icon"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const cleanedUrl = cleanUrl(href);
            if (cleanedUrl) images.add(cleanedUrl);
          }
        });
      }
    ];

    // Run all extractors
    extractors.forEach(extractor => extractor());

    // Filter and validate images
    const validImages = Array.from(images).filter(img => {
      try {
        const urlObj = new URL(img);
        return (
          // Check file extensions
          /\.(jpe?g|png|gif|webp|svg|avif|ico|bmp)(\?.*)?$/i.test(urlObj.pathname) ||
          // Check common image paths
          urlObj.pathname.includes('/images/') ||
          urlObj.pathname.includes('/img/') ||
          urlObj.pathname.includes('/photos/') ||
          // Check data URLs
          img.startsWith('data:image/')
        );
      } catch {
        return false;
      }
    });

    console.log(`Found ${validImages.length} valid images`);

    if (validImages.length === 0) {
      // Try to extract from response headers
      const contentType = response.headers['content-type'];
      if (contentType?.startsWith('image/')) {
        return res.json({ images: [url] });
      }

      return res.status(404).json({
        error: 'No images found',
        message: 'Could not find any valid images on the page. The page might be using dynamic loading or require authentication.',
        url: url
      });
    }

    res.json({ images: validImages });
  } catch (error) {
    console.error('Server error:', error);
    
    let errorMessage;
    if (error.response?.status === 403) {
      errorMessage = 'Access denied. The website might be blocking automated access.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect to the server. The website might be down.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timed out. The server took too long to respond.';
    } else {
      errorMessage = error.message;
    }

    res.status(500).json({
      error: 'Failed to fetch images',
      details: errorMessage,
      url: req.body.url
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

    const response = await customAxios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 15000,
      headers: {
        ...customAxios.defaults.headers,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    });

    // Verify content type is an image
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
