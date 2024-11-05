import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    try {
      const hostname = new URL(origin).hostname;
      
      // Allow all localhost requests in development
      if (isDev && hostname === 'localhost') {
        return callback(null, true);
      }
      
      // In production, only allow specific origins
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

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'your_pexels_api_key';
const customAxios = axios.create({
  timeout: 30000,
  headers: {
    'Authorization': PEXELS_API_KEY,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
  }
});

app.post('/api/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check if it's a Pexels URL
    if (url.includes('pexels.com')) {
      try {
        // Extract photo ID from URL if possible
        const photoId = url.match(/photos\/(\d+)/)?.[1];
        
        if (photoId) {
          const response = await customAxios.get(`https://api.pexels.com/v1/photos/${photoId}`);
          const photo = response.data;
          
          return res.json({
            images: [photo.src.original]
          });
        } else {
          // If no specific photo ID, return curated photos
          const response = await customAxios.get('https://api.pexels.com/v1/curated?per_page=15');
          const photos = response.data.photos;
          
          return res.json({
            images: photos.map(photo => photo.src.original)
          });
        }
      } catch (error) {
        console.error('Pexels API error:', error);
        return res.status(500).json({
          error: 'Failed to fetch images from Pexels',
          details: error.message
        });
      }
    }

    // For non-Pexels URLs, try to fetch normally
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

    const response = await customAxios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 15000,
      headers: {
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
