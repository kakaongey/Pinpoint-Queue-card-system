const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketNumber: String,
  serviceType: String,
  customerName: String,
  phone: String,
  notes: String,
  priority: String,
  counter: String,
  status: { type: String, default: 'Waiting' },
  completedAt: Date,
  skippedAt: Date,
  recalledAt: Date,
  issuedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ticket', ticketSchema);
