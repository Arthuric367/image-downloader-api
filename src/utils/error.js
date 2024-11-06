export const logError = (error, context) => {
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
