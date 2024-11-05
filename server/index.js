import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { PassThrough } from 'stream';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// CORS configuration with improved headers
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
  credentials: true,
  exposedHeaders: ['Content-Disposition']
};

app.use(cors(corsOptions));
app.use(express.json());

// Error logging utility
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

// Content type detection
const getContentType = (url, data) => {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (/^(jpg|jpeg|png|gif|webp)$/.test(ext)) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  
  const signature = data.slice(0, 4).toString('hex');
  if (signature.startsWith('89504e47')) return 'image/png';
  if (signature.startsWith('ffd8')) return 'image/jpeg';
  if (signature.startsWith('47494638')) return 'image/gif';
  
  return 'application/octet-stream';
};

// Download with retry and monitoring
const downloadWithRetry = async (url, attempt = 1, maxAttempts = 3) => {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: status => status === 200,
      onDownloadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`Download progress for ${url}: ${percentCompleted}%`);
      }
    });

    return response.data;
  } catch (error) {
    logError(error, `Download attempt ${attempt} failed for ${url}`);
    
    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadWithRetry(url, attempt + 1, maxAttempts);
    }
    throw error;
  }
};

// Memory usage monitoring
const logMemoryUsage = () => {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`
  });
};

app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Starting download:', url);
    logMemoryUsage();

    const imageData = await downloadWithRetry(url);
    const contentType = getContentType(url, imageData);
    const fileName = `image-${Date.now()}.${contentType.split('/')[1]}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const stream = new PassThrough();
    stream.end(imageData);
    
    stream.on('error', (error) => {
      logError(error, 'Stream error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });

    stream.pipe(res);
    
    stream.on('end', () => {
      console.log('Download completed:', url);
      logMemoryUsage();
    });

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

// ... rest of your existing endpoints ...

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  logMemoryUsage();
});
