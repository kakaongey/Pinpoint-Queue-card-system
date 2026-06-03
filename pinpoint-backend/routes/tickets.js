const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const auth = require('../middleware/auth'); // Security Guard

// 1. POST: Issue a new ticket (Public - No auth required)
router.post('/issue', async (req, res) => {
  try {
    const { serviceType, customerName, priority, phone, notes } = req.body;

    const prefix = serviceType ? serviceType.substring(0, 2).toUpperCase() : 'TK';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const ticketNumber = `${prefix}-${randomNum}`;

    const newTicket = new Ticket({
      ticketNumber,
      serviceType,
      customerName,
      priority,
      phone,
      notes,
      status: 'Waiting'
    });

    const savedTicket = await newTicket.save();

    // Broadcast to all screens
    const io = req.app.get('io');
    if (io) {
      io.emit('new-ticket', savedTicket);
    }

    res.status(201).json(savedTicket);
  } catch (err) {
    console.error('Error issuing ticket:', err);
    res.status(500).json({ error: 'Failed to issue ticket' });
  }
});

// 2. GET: Fetch active tickets for dashboards and displays
router.get('/active', async (req, res) => {
  try {
    const activeTickets = await Ticket.find({
      status: { $in: ['Waiting', 'Serving'] }
    }).sort({ issuedAt: 1 });

    res.json(activeTickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active tickets' });
  }
});

// 3. PUT: Call the next person in line (Protected)
router.put('/call-next', auth, async (req, res) => {
  try {
    const { counter } = req.body; 
    const nextTicket = await Ticket.findOne({ status: 'Waiting' }).sort({ issuedAt: 1 });

    if (!nextTicket) {
      return res.status(404).json({ message: 'No one is waiting' });
    }

    nextTicket.status = 'Serving';
    nextTicket.counter = counter || 'Auto-Assigned'; 
    await nextTicket.save();

    const io = req.app.get('io');
    if (io) io.emit('ticket-called', nextTicket);

    res.json(nextTicket);
  } catch (err) {
    res.status(500).json({ error: 'Server error while calling next' });
  }
});

// 4. PUT: Complete a serving session (Protected)
router.put('/complete/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.status = 'Completed';
    ticket.completedAt = new Date();
    await ticket.save();

    const io = req.app.get('io');
    if (io) io.emit('ticket-completed', ticket);

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete ticket' });
  }
});

// 5. PUT: Recall a serving customer (Protected)
router.put('/recall/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.recalledAt = new Date();
    await ticket.save();

    const io = req.app.get('io');
    if (io) io.emit('ticket-called', ticket);

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to recall ticket' });
  }
});

// 6. PUT: Skip a serving customer (Protected)
router.put('/skip/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.status = 'Skipped';
    ticket.skippedAt = new Date();
    await ticket.save();

    const io = req.app.get('io');
    if (io) io.emit('ticket-skipped', ticket);

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to skip ticket' });
  }
});

// 7. GET: Fetch Queue Analytics (Protected)
router.get('/stats', auth, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const totalServed = await Ticket.countDocuments({ status: 'Completed' });
    const waitingNow = await Ticket.countDocuments({ status: 'Waiting' });
    const skipped = await Ticket.countDocuments({ status: 'Skipped' });
    const completedTickets = await Ticket.find({
      status: 'Completed',
      completedAt: { $exists: true },
      issuedAt: { $exists: true }
    });

    const avgWaitMinutes = completedTickets.length
      ? Math.round(completedTickets.reduce((sum, ticket) => {
          return sum + ((new Date(ticket.completedAt) - new Date(ticket.issuedAt)) / 60000);
        }, 0) / completedTickets.length)
      : 0;

    const serviceBreakdown = await Ticket.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: "$serviceType", count: { $sum: 1 } } }
    ]);

    const hourlyTraffic = await Ticket.aggregate([
      { $match: { issuedAt: { $gte: startOfDay } } },
      { $group: { _id: { $hour: "$issuedAt" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const traffic = hourlyTraffic.map(hour => ({
      label: `${String(hour._id).padStart(2, '0')}:00`,
      count: hour.count
    }));

    const peakHour = traffic.reduce((peak, hour) => {
      return !peak || hour.count > peak.count ? hour : peak;
    }, null);

    const staffPerformance = await Ticket.aggregate([
      { $match: { status: 'Completed', counter: { $exists: true, $ne: null } } },
      { $group: { _id: "$counter", servedCount: { $sum: 1 } } },
      { $sort: { servedCount: -1 } }
    ]);

    res.json({
      totalServed,
      waitingNow,
      serviceBreakdown,
      avgWaitMinutes,
      avgWaitTime: `${avgWaitMinutes}m`,
      dropOffRate: totalServed + skipped
        ? Math.round((skipped / (totalServed + skipped)) * 100)
        : 0,
      hourlyTraffic: traffic,
      peakHour,
      staffPerformance: staffPerformance.map(staff => ({
        counter: staff._id,
        servedCount: staff.servedCount,
        avgHandleMinutes: avgWaitMinutes || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// 8. GET: Fetch completed/skipped ticket history (Protected)
router.get('/history', auth, async (req, res) => {
  try {
    const history = await Ticket.find({
      status: { $in: ['Completed', 'Skipped'] }
    }).sort({ completedAt: -1, skippedAt: -1, issuedAt: -1 }).limit(100);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// 9. PUT: Reassign ticket to a new counter (Protected)
router.put('/reassign/:id', auth, async (req, res) => {
  try {
    const { targetCounter } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.counter = targetCounter;
    await ticket.save();

    const io = req.app.get('io');
    if (io) io.emit('ticket-called', ticket); 

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reassign ticket' });
  }
});

module.exports = router;
