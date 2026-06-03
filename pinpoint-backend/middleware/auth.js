const jwt = require('jsonwebtoken');

// This must match the secret key we used in auth.js!
const JWT_SECRET = process.env.JWT_SECRET || 'kca_pinpoint_super_secret_key_2026';

module.exports = function(req, res, next) {
  // 1. Look for the token in the headers
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'Access Denied. No token provided.' });
  }

  // 2. The token usually comes as "Bearer [token_string]"
  const token = authHeader.split(' ')[1]; 
  if (!token) {
    return res.status(401).json({ message: 'Access Denied. Invalid token format.' });
  }

  try {
    // 3. Verify the token is real and hasn't expired
    const verifiedUser = jwt.verify(token, JWT_SECRET);
    
    // 4. Attach the user info to the request so the next function knows who is calling
    req.user = verifiedUser; 
    
    // 5. Let them pass!
    next(); 
  } catch (err) {
    res.status(400).json({ message: 'Invalid or Expired Token' });
  }
};