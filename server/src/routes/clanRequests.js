const express = require('express');
const router = express.Router();
const c = require('../controllers/clanRequestsController');
const { authenticate, authorize } = require('../middlewares/auth');

const adminOnly = [authenticate, authorize(['admin'])];

router.get('/', adminOnly, c.overview);

// Change requests: a mentee may create one; admin resolves.
router.post('/requests', authenticate, c.createRequest);
router.patch('/requests/:id/resolve', adminOnly, c.resolveRequest);

// Cross-clan assignments + policies (admin).
router.post('/cross-clan', adminOnly, c.createCrossClan);
router.delete('/cross-clan/:id', adminOnly, c.removeCrossClan);
router.post('/policies', adminOnly, c.createPolicy);
router.delete('/policies/:id', adminOnly, c.removePolicy);

module.exports = router;
