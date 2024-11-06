import express from 'express';
import cors from 'cors';
import { corsOptions } from './src/config/cors.js';
import imageRoutes from './src/routes/images.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api', imageRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
