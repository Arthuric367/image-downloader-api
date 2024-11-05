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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'));
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Basic error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!', details: err.message });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'healthy', message: 'Image Downloader API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', message: 'Image Downloader API is running' });
});

app.post('/api/fetch-images', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Fetching images from:', url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const images = new Set();

    $('img').each((_, element) => {
      const src = $(element).attr('src');
      if (src && /\.(jpeg|jpg|png|gif|webp)$/i.test(src)) {
        try {
          const absoluteUrl = new URL(src, url).href;
          images.add(absoluteUrl);
        } catch (e) {
          console.error('Invalid URL:', src);
        }
      }
    });

    console.log('Found images:', Array.from(images));
    res.json({ images: Array.from(images) });
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

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    res.setHeader('Content-Type', response.headers['content-type']);
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
