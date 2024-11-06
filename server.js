const express = require('express');
const axios = require('axios');
const archiver = require('archiver');
const cors = require('cors');
const app = express();

// Enable CORS to allow requests from your frontend
app.use(cors());

// Endpoint to handle downloading images and zipping them
app.get('/api/download-all', async (req, res) => {
  // Retrieve image URLs from query parameters (they will be JSON stringified)
  const imageUrls = req.query.urls ? JSON.parse(req.query.urls) : [];

  // Check if any URLs were provided
  if (imageUrls.length === 0) {
    return res.status(400).send('No images provided');
  }

  // Set headers for ZIP file download
  res.attachment('images.zip');

  // Create a new ZIP archive
  const archive = archiver('zip', { zlib: { level: 9 } });

  // Handle any archiving errors
  archive.on('error', err => {
    console.error('Archiving error:', err);
    res.status(500).send('Failed to create zip');
  });

  // Pipe the archive data to the response
  archive.pipe(res);

  try {
    // Loop through each image URL and add it to the archive
    for (const url of imageUrls) {
      // Fetch the image as a binary array buffer
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      // Convert the data to a buffer and get the image's name
      const buffer = Buffer.from(response.data);
      const fileName = url.split('/').pop();

      // Append each image to the archive
      archive.append(buffer, { name: fileName });
    }

    // Finalize the archive once all files are added
    await archive.finalize();
  } catch (error) {
    // Handle download or other errors
    console.error('Download error:', error);
    res.status(500).send('Failed to download images');
  }
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
