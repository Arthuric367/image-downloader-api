import axios from 'axios';

// Use relative URLs so the Vite dev proxy handles routing to the backend.
// Override with VITE_API_URL env var for production deployments.
const API_URL = import.meta.env.VITE_API_URL || '';

export interface ImageMeta {
  id: number;
  originalUrl: string;
  contentType: string;
  size: number;
}

export interface FetchResult {
  sessionId: string;
  images: ImageMeta[];
}

// Fetch images — opens a real headless browser, captures image bytes live.
// Returns a sessionId; images are stored server-side for 15 minutes.
export const fetchImages = async (url: string): Promise<FetchResult> => {
  try {
    const response = await axios.post(
      `${API_URL}/api/fetch-images`,
      { url },
      {
        headers: { 'Content-Type': 'application/json' },
        // Puppeteer can take up to ~30s to load, render, and scroll
        timeout: 90000,
      }
    );

    const { sessionId, images } = response.data;
    if (!sessionId || !Array.isArray(images)) throw new Error('Invalid response format');
    return { sessionId, images };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. The page may be too slow to load.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch images');
    }
    throw error;
  }
};

// URL used by <img> tags to preview an image from the session cache
export function getImagePreviewUrl(sessionId: string, imageId: number): string {
  return `${API_URL}/api/session/${sessionId}/image/${imageId}`;
}

// Download a single image from the session cache
export async function downloadImage(sessionId: string, imageId: number): Promise<void> {
  const response = await axios.get(
    `${API_URL}/api/session/${sessionId}/download/${imageId}`,
    { responseType: 'blob', timeout: 30000 }
  );
  const cd = response.headers['content-disposition'];
  let fileName = `image-${imageId + 1}`;
  if (cd) {
    const match = cd.match(/filename="(.+?)"/);
    if (match) fileName = match[1];
  }
  triggerDownload(
    URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] })),
    fileName
  );
}

// Download a selected subset of images as a ZIP
export async function downloadSelectedImages(sessionId: string, ids: number[]): Promise<void> {
  const res = await fetch(`${API_URL}/api/session/${sessionId}/download-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create ZIP');
  }
  triggerDownload(URL.createObjectURL(await res.blob()), `images-${Date.now()}.zip`);
}

// Download all images in the session as a ZIP
export async function downloadAllImages(sessionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/session/${sessionId}/download-all`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create ZIP');
  }
  triggerDownload(URL.createObjectURL(await res.blob()), `images-${Date.now()}.zip`);
}

function triggerDownload(objectUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

