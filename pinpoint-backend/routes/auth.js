const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// The secret key used to stamp the digital ID cards (JWTs)
const JWT_SECRET = process.env.JWT_SECRET || 'kca_pinpoint_super_secret_key_2026';

async function ensureDefaultAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  try {
    const adminExists = await User.findOne({ username });
    if (adminExists) return false;

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const admin = new User({ 
      username, 
      password: hashedPassword, 
      role: 'admin' 
    });
    
    await admin.save();
    return true;
  } catch (err) {
    console.error('Admin setup failed:', err);
    throw err;
  }
}

// 1. Setup Route. Safe to run repeatedly; it only creates the admin when missing.
router.post('/setup', async (req, res) => {
  try {
    const created = await ensureDefaultAdmin();
    res.json({
      message: created
        ? 'Admin user created successfully! You can now log in.'
        : 'Admin already exists'
    });
  } catch (err) {
    res.status(500).json({ error: 'Setup failed' });
  }
});

// 2. The Real Login Route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Compare the typed password with the hashed password in MongoDB
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // If passwords match, create the JSON Web Token (JWT)
    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username }, 
      JWT_SECRET, 
      { expiresIn: '8h' } // Token expires at the end of a shift
    );

    // Send the token back to the frontend
    res.json({ 
      token, 
      user: { username: user.username, role: user.role } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
module.exports.ensureDefaultAdmin = ensureDefaultAdmin;
