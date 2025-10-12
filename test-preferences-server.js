import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import User from './user.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/ai-assistant', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('Error connecting to MongoDB:', err);
});

// API route to save user preferences
app.post('/api/preferences', async (req, res) => {
  try {
    const { googleId, preferences } = req.body;
    
    if (!googleId || !preferences) {
      return res.status(400).json({ error: "Missing googleId or preferences" });
    }

    // Find user and update preferences
    let user = await User.findOne({ googleId });
    if (!user) {
      // Create a new user if not found
      user = new User({
        googleId,
        name: 'Test User',
        email: 'test@example.com',
        preferences
      });
    } else {
      // Update user preferences
      user.preferences = preferences;
    }

    await user.save();
    console.log('Preferences saved for user:', googleId);
    res.status(200).json({ message: "Preferences saved successfully" });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: "Error saving preferences", details: error.message });
  }
});

// API route to get user preferences
app.get('/api/preferences/:googleId', async (req, res) => {
  try {
    const { googleId } = req.params;
    
    if (!googleId) {
      return res.status(400).json({ error: "Missing googleId" });
    }

    // Find user and get preferences
    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log('Preferences retrieved for user:', googleId);
    res.status(200).json({ preferences: user.preferences });
  } catch (error) {
    console.error('Error retrieving preferences:', error);
    res.status(500).json({ error: "Error retrieving preferences", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Test preferences server running on http://localhost:${PORT}`);
});
