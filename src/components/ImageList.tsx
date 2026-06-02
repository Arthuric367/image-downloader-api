import React from 'react';
import { Download } from 'lucide-react';

interface ImageListProps {
  images: string[];
  sourceUrl?: string;
  onDownload: (url: string) => void;
}

const ImageList: React.FC<ImageListProps> = ({ images, sourceUrl = '', onDownload }) => {
  if (images.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4">Found {images.length} Images</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((url, index) => (
          <div key={index} className="relative group rounded-xl overflow-hidden bg-gray-100">
            <div className="aspect-square">
              <img
                src={url}
                alt={`Image ${index + 1}`}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={e => {
                  const el = e.currentTarget;
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1';
                    el.src = `/api/proxy-image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(sourceUrl)}`;
                  } else {
                    el.style.display = 'none';
                  }
                }}
              />
            </div>
            <button
              onClick={() => onDownload(url)}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            >
              <Download className="w-6 h-6 text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageList;

