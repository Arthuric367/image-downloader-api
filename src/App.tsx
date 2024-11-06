import React, { useState } from 'react';
import { Image as ImageIcon, AlertCircle, Download } from 'lucide-react';
import ImageList from './components/ImageList';
import { fetchImages } from './utils/imageUtils';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleFetchImages = async () => {
    setLoading(true);
    setError('');
    setImages([]);
    
    try {
      const fetchedImages = await fetchImages(url);
      setImages(fetchedImages);
      
      if (fetchedImages.length === 0) {
        setError('No images found on this page');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setLoading(false);
    }
  };

  // New function to download all images as a ZIP file
  const handleDownloadAll = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/download-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: images })
      });

      if (!response.ok) throw new Error('Failed to download zip');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images-${Date.now()}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download images');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <ImageIcon className="w-8 h-8 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-800">Bulk Image Downloader</h1>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <p className="text-red-700">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleFetchImages}
                disabled={loading || !url}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition
                  ${loading || !url 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700'}`}
              >
                <ImageIcon className="w-5 h-5" />
                {loading ? 'Processing...' : 'Fetch Images'}
              </button>

              {/* Button to download all images as a ZIP file */}
              <button
                onClick={handleDownloadAll}
                disabled={loading || images.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition bg-purple-600 hover:bg-purple-700"
              >
                <Download className="w-5 h-5" />
                Download All as ZIP
              </button>
            </div>
          </div>

          {/* Image List */}
          <ImageList images={images} />
        </div>
      </div>
    </div>
  );
}

export default App;
