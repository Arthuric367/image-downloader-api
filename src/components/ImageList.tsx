import React from 'react';
import { Download } from 'lucide-react';

interface ImageListProps {
  images: string[];
  onDownload: (url: string) => void;
}

const ImageList: React.FC<ImageListProps> = ({ images, onDownload }) => {
  if (images.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4">Found {images.length} Images</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((url, index) => (
          <div key={index} className="relative group">
            <img
              src={url}
              alt={`Image ${index + 1}`}
              className="w-full h-48 object-cover rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=Failed+to+load';
              }}
            />
            <button
              onClick={() => onDownload(url)}
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg"
            >
              <Download className="w-6 h-6 text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ImageList;
