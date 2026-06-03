const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { authenticate } = require('../middlewares/auth');

// Cohort social feed (any authenticated user).
router.get('/feed', authenticate, communityController.feed);
router.get('/people', authenticate, communityController.people);
router.post('/posts', authenticate, communityController.createPost);
router.post('/posts/:id/react', authenticate, communityController.react);

module.exports = router;
