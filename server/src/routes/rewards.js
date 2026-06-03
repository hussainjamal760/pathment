const express = require('express');
const router = express.Router();
const c = require('../controllers/rewardsController');
const { authenticate, authorize } = require('../middlewares/auth');

// Catalog + redemptions (mentor/admin).
router.get('/', authenticate, authorize(['mentor', 'admin']), c.overview);
router.post('/redeem', authenticate, authorize(['mentor', 'admin']), c.redeem);

// Catalog management (admin).
router.post('/gifts', authenticate, authorize(['admin']), c.createGift);
router.delete('/gifts/:id', authenticate, authorize(['admin']), c.removeGift);

module.exports = router;
