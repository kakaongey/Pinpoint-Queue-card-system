require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app); 
const PORT = process.env.PORT || 5050;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pinpoint_queue';

// ════════════════════════════════════════════════
// 🟢 MIDDLEWARE (The VIP Pass and Translators)
// ════════════════════════════════════════════════
app.use(cors()); // Allows your Vite frontend to talk to this backend
app.use(express.json()); // Tells Express how to read the username/password

// ════════════════════════════════════════════════
// 🟢 WEBSOCKETS SETUP (Live UI Updates)
// ════════════════════════════════════════════════
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('⚡ A screen connected to the Live Display');
  socket.on('disconnect', () => {
    console.log('🔌 A screen disconnected');
  });
});

// ════════════════════════════════════════════════
// 🟢 DATABASE CONNECTION
// ════════════════════════════════════════════════
async function connectDatabase() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB database');
    const created = await authRoutes.ensureDefaultAdmin();
    console.log(created ? '✅ Default admin created' : 'ℹ️ Default admin already exists');
  } catch (err) {
    console.error(`❌ MongoDB unavailable at ${MONGO_URI}`);
    console.error('   Start MongoDB locally or set MONGO_URI in pinpoint-backend/.env.');
    console.error('   Docker option from the repo root: docker compose up -d mongo');

    if (process.env.DEBUG_DB === 'true') {
      console.error(err);
    }
  }
}

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database unavailable',
      message: 'Start MongoDB or set MONGO_URI in .env, then retry this request.'
    });
  }

  next();
}

// ════════════════════════════════════════════════
// 🟢 WHATSAPP BOT INTEGRATION (Temporarily Disabled)
// ════════════════════════════════════════════════
/*
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const whatsapp = new Client({
  authStrategy: new LocalAuth(), 
  puppeteer: { headless: true }
});

whatsapp.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with your WhatsApp to link the system:');
  qrcode.generate(qr, { small: true });
});

whatsapp.on('ready', () => {
  console.log('✅ WhatsApp Bot is fully linked and ready to send messages!');
});

whatsapp.initialize();

app.set('whatsapp', whatsapp); 
*/
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// 🟢 ROUTES
// ════════════════════════════════════════════════
const ticketRoutes = require('./routes/tickets');
app.use('/api/auth', requireDatabase, authRoutes);
app.use('/api/tickets', requireDatabase, ticketRoutes);

// Base Route
app.get('/', (req, res) => {
  res.send('PinPoint API is running with WebSockets & Authentication!');
});

// ════════════════════════════════════════════════
// 🟢 START SERVER
// ════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

connectDatabase();
