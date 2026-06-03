const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // This will be securely hashed
  role: { type: String, default: 'staff' },   // Can be 'admin' or 'staff'
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);