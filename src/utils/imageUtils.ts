import axios from 'axios';

// Use relative URLs so the Vite dev proxy handles routing to the backend.
// Override with VITE_API_URL env var for production deployments.
const API_URL = import.meta.env.VITE_API_URL || '';

export const fetchImages = async (url: string): Promise<string[]> => {
  try {
    const response = await axios.post(
      `${API_URL}/api/fetch-images`,
      { url },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (!response.data?.images || !Array.isArray(response.data.images)) {
      throw new Error('Invalid response format');
    }

    return response.data.images;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please try again.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch images');
    }
    throw error;
  }
};

export const downloadImage = async (imageUrl: string): Promise<void> => {
  try {
    const response = await axios.get(`${API_URL}/api/download`, {
      params: { url: imageUrl },
      responseType: 'blob',
      headers: { 'Accept': 'image/*' },
      timeout: 30000,
    });

    const contentDisposition = response.headers['content-disposition'];
    let fileName = imageUrl.split('/').pop()?.split('?')[0] || 'image.jpg';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+?)"/);
      if (match) fileName = match[1];
    }

    const blob = new Blob([response.data], {
      type: response.headers['content-type'] || 'application/octet-stream',
    });
    triggerDownload(URL.createObjectURL(blob), fileName);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to download image');
    }
    throw error;
  }
};

export const downloadAllImages = async (urls: string[]): Promise<void> => {
  const response = await fetch(`${API_URL}/api/download-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create ZIP');
  }

  const blob = await response.blob();
  triggerDownload(URL.createObjectURL(blob), `images-${Date.now()}.zip`);
};

function triggerDownload(objectUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

