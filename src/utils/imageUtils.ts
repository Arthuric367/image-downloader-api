import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://image-downloader-api-iu58.onrender.com';

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
      headers: {
        'Accept': 'image/*',
      },
      timeout: 30000,
    });

    const contentDisposition = response.headers['content-disposition'];
    let fileName = 'image.jpg';
    
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) fileName = match[1];
    } else {
      fileName = imageUrl.split('/').pop()?.split('?')[0] || 'image.jpg';
    }

    const blob = new Blob([response.data], { type: response.headers['content-type'] });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to download image');
    }
    throw error;
  }
};
