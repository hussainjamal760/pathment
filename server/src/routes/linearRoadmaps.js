const express = require('express');
const router = express.Router();
const c = require('../controllers/linearRoadmapController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

const adminOnly = [authenticate, requirePermission(PERMISSIONS.ROADMAP_AUTHOR)];

// AI-draft roadmap steps from a brief (any authenticated mentor/admin author).
// Generating a draft is harmless; saving is still gated by the routes below.
router.post('/generate', authenticate, c.generate);

// Mentee's own roadmap progress (step X/N) for their progress view.
router.get('/me', authenticate, c.myRoadmaps);

// Admin org-roadmap authoring (the shared library mentors import + assign).
router.get('/org', adminOnly, c.listOrg);
router.post('/org', adminOnly, c.createOrg);
router.patch('/org/:id', adminOnly, c.updateOrg);
router.post('/org/:id/steps', adminOnly, c.addOrgStep);
router.delete('/org/:id/steps/:stepId', adminOnly, c.removeOrgStep);
router.delete('/org/:id', adminOnly, c.deleteOrg);

// Chain authoring for org roadmaps: "what comes next" (reusable graph edges).
router.get('/org/:id/links', adminOnly, c.getLinks);
router.put('/org/:id/links', adminOnly, c.setLinks);

module.exports = router;
