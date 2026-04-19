import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/animal-classification',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024,
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:5001',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};
