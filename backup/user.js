import mongoose from 'mongoose';

// Define the user schema for MongoDB
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Instance method to check expiration
userSchema.methods.isExpired = function () {
  const now = new Date();
  const createdAt = new Date(this.createdAt);
  const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
  console.log('print diffDays: ', diffDays);
  return diffDays > 30;
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

      await user.save();
      console.log('User updated:', user);
      return user;
    }

    // If the user doesn't exist, create a new user
    user = new User({
      googleId: userData.googleId,
      name: userData.name,
      email: userData.email,
      imageUrl: userData.imageUrl,
    });

    await user.save();
    console.log('New user created:', user);
    return user;

  } catch (err) {
    console.error('Error creating or updating user:', err);
    throw err;
  }
}

export default User;
