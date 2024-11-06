import express from 'express';
import axios from 'axios';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint to handle image download and zipping
app.post('/api/download-all', async (req, res) => {
  const { urls } = req.body;

  if (!urls || !urls.length) {
    return res.status(400).json({ message: 'No images to download' });
  }

  // Set headers for downloading a ZIP file
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=images.zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  try {
    // Fetch each image and append to the archive
    for (let i = 0; i < urls.length; i++) {
      const imageUrl = urls[i];
      const response = await axios.get(imageUrl, { responseType: 'stream' });

      archive.append(response.data, { name: `image${i + 1}.jpg` });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error downloading or archiving images:', error);
    res.status(500).json({ message: 'Failed to download images' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
