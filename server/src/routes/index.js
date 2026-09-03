const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const programRoutes = require('./programs');
const enrollmentRoutes = require('./enrollments');
const matchingRoutes = require('./matching');
const performanceRoutes = require('./performance');
const autoReplyRoutes = require('./autoReply');
const mentorRoutes = require('./mentors');
const menteeRoutes = require('./mentees');
const taskRoutes = require('./tasks');
const submissionRoutes = require('./submissions');
const profileRoutes = require('./profile');
const skillRoutes = require('./skills');
const messagingRoutes = require('./messaging');
const gamificationRoutes = require('./gamification');
const activityRoutes = require('./activity');
const clanRoutes = require('./clans');
const mentorAreaRoutes = require('./mentor');
const menteeAreaRoutes = require('./mentee');
const frictionRoutes = require('./friction');
const meetingRoutes = require('./meetings');
const announcementRoutes = require('./announcements');
const communityRoutes = require('./community');
const clanRequestRoutes = require('./clanRequests');
const rewardsRoutes = require('./rewards');
const libraryRoutes = require('./library');
const scheduleRoutes = require('./schedules');
const trackRoutes = require('./tracks');
const linearRoadmapRoutes = require('./linearRoadmaps');
const mentorSpecRoutes = require('./mentorSpec');
const intakeRoutes = require('./intake');
const assessmentRoutes = require('./assessments');
const publicRoutes = require('./public');
const accessRoutes = require('./access');
const aiConnectionRoutes = require('./aiConnections');
const programReviewRoutes = require('./programReviews');
const changelogRoutes = require('./changelog');
const interviewRoutes = require('./interviews');
const quizRoutes = require('./quizzes');


router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);
router.use('/email', require('./emailPublic')); 
router.use('/skills', skillRoutes);

router.use('/admin', adminRoutes);

router.use('/programs', programRoutes);

router.use('/enrollments', enrollmentRoutes);
router.use('/matches', matchingRoutes);

router.use('/performance', performanceRoutes);

router.use('/auto-reply', autoReplyRoutes);

router.use('/mentors', mentorRoutes);
router.use('/mentees', menteeRoutes);

router.use('/tasks', taskRoutes);
router.use('/interviews', interviewRoutes);
router.use('/quizzes', quizRoutes);

router.use('/submissions', submissionRoutes);

router.use('/messaging', messagingRoutes);

router.use('/gamification', gamificationRoutes);

router.use('/activity', activityRoutes);

router.use('/clans', clanRoutes);

router.use('/mentor', mentorAreaRoutes);

router.use('/mentee', menteeAreaRoutes);

router.use('/', frictionRoutes);

router.use('/meetings', meetingRoutes);

router.use('/announcements', announcementRoutes);

router.use('/changelog', changelogRoutes);

router.use('/community', communityRoutes);

router.use('/clan-requests', clanRequestRoutes);

router.use('/rewards', rewardsRoutes);

router.use('/library', libraryRoutes);

router.use('/schedules', scheduleRoutes);

router.use('/tracks', trackRoutes);

router.use('/roadmaps', linearRoadmapRoutes);

router.use('/mentor-spec', mentorSpecRoutes);

router.use('/intake', intakeRoutes);

router.use('/assessments', assessmentRoutes);

router.use('/public', publicRoutes);

router.use('/access', accessRoutes);

router.use('/ai-connections', aiConnectionRoutes);

router.use('/program-reviews', programReviewRoutes);

router.use('/admin/emails', require('./emailAdmin'));

router.use('/feedback', require('./feedback'));

router.use('/certificates', require('./certificates'));

module.exports = router;
