import axios from 'axios';

export const downloadWithRetry = async (url, attempt = 1, maxAttempts = 3) => {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      validateStatus: status => status === 200,
      maxRedirects: 5
    });
    return response.data;
  } catch (error) {
    if (attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadWithRetry(url, attempt + 1, maxAttempts);
    }
    throw error;
  }
};
