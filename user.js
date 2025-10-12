import mongoose from 'mongoose';

// Define the user schema for MongoDB
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  imageUrl: { type: String },
  preferences: {
    theme: { type: String, default: "dark" },
    language: { type: String, default: "en" },
    answerMode: { type: String, default: "precise" },
    folders: {
      watch: [{ type: String }],
      smart: [{
        id: { type: String },
        name: { type: String },
        description: { type: String },
        createdAt: {
          start: { type: String },
          end: { type: String }
        },
        updatedAt: {
          start: { type: String },
          end: { type: String }
        },
        fileTypes: [{ type: String }]
      }]
    }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiredAt: { type: Date }
});

// Instance method to check expiration
userSchema.methods.isExpired = function () {
  if (!this.expiredAt) {
    // Fallback to old logic if expiredAt is not set
    const now = new Date();
    const createdAt = new Date(this.createdAt);
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    console.log('print diffDays: ', diffDays);
    return diffDays > 30;
  }
  
  const now = new Date();
  console.log('print expiredAt: ', this.expiredAt);
  console.log('print now: ', now);
  console.log('isExpired: ', now > this.expiredAt);
  console.log('isExpired result: ', now > this.expiredAt);
  return now > this.expiredAt;
};

// Instance method to update preferences
userSchema.methods.updatePreferences = async function(newPreferences) {
  this.preferences = { ...this.preferences, ...newPreferences };
  this.updatedAt = new Date();
  await this.save();
  console.log('User preferences updated:', this.preferences);
  return this;
};

// Instance method to get preferences
userSchema.methods.getPreferences = function() {
  return this.preferences;
};

const User = mongoose.model('User', userSchema);

// Function to save or update the user in MongoDB
export async function createOrUpdateUser(userData) {
  try {
    // Check if the user already exists
    let user = await User.findOne({ googleId: userData.googleId });

    if (user) {
      // If the user exists, update their information
      user.name = userData.name;
      user.email = userData.email;
      user.imageUrl = userData.imageUrl;
      user.updatedAt = new Date();

      await user.save();
      console.log('User updated:', user);
      return user;
    }

    // If the user doesn't exist, create a new user
    const now = new Date();
    const expiredAt = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now
    
    user = new User({
      googleId: userData.googleId,
      name: userData.name,
      email: userData.email,
      imageUrl: userData.imageUrl,
      expiredAt: expiredAt
    });

    await user.save();
    console.log('New user created:', user);
    return user;

  } catch (err) {
    console.error('Error creating or updating user:', err);
    throw err;
  }
}

// Function to update user preferences
export async function updateUserPreferences(googleId, preferences) {
  try {
    const user = await User.findOne({ googleId });
    if (!user) {
      throw new Error('User not found');
    }
    
    await user.updatePreferences(preferences);
    return user;
  } catch (err) {
    console.error('Error updating user preferences:', err);
    throw err;
  }
}

// Function to get user preferences
export async function getUserPreferences(googleId) {
  try {
    const user = await User.findOne({ googleId });
    if (!user) {
      return null;
    }
    return user.getPreferences();
  } catch (err) {
    console.error('Error getting user preferences:', err);
    throw err;
  }
}

export default User;
