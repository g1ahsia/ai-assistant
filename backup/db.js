import mongoose from 'mongoose';

// Function to connect to the MongoDB database
export const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/ai-assistant', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};
