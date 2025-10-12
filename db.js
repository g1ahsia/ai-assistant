import mongoose from 'mongoose';

// MongoDB connection configuration with authentication support
const MONGO_USERNAME = process.env.MONGO_USERNAME || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'strongpassword';
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'ai-assistant';
const MONGO_AUTH_SOURCE = process.env.MONGO_AUTH_SOURCE || 'admin';

// Build connection URL with or without authentication
const mongoUrl = MONGO_USERNAME && MONGO_PASSWORD 
  ? `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}?authSource=${MONGO_AUTH_SOURCE}`
  : `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`;

console.log('MongoDB connection URL:', mongoUrl.replace(/\/\/.*:.*@/, '//***:***@')); // Hide credentials in logs

// Function to connect to the MongoDB database
export const connectDB = async () => {
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};
