const isDev = process.env.NODE_ENV !== 'production';

export const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || isDev) {
      return callback(null, true);
    }
    const allowedOrigins = [
      'celebrated-pastelito-a57194.netlify.app',
      'localhost',
      '127.0.0.1'
    ];
    if (allowedOrigins.some(domain => origin.includes(domain))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition']
};
