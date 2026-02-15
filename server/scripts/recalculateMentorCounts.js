const { models } = require('../src/db');

/**
 * Script to recalculate currentMenteeCount for all mentors
 * This counts UNIQUE active mentees per mentor (not total matches)
 * 
 * Run with: node scripts/recalculateMentorCounts.js
 */
async function recalculateMentorCounts() {
  try {
    console.log('Starting mentor mentee count recalculation...');

    // Get all mentors
    const mentors = await models.User.findAll({
      where: { role: 'mentor' },
      include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
    });

    console.log(`Found ${mentors.length} mentors`);

    let updated = 0;
    for (const mentor of mentors) {
      // Count unique active mentees for this mentor
      const uniqueMentees = await models.MentorMenteeMatch.findAll({
        where: { 
          mentorId: mentor.id, 
          status: 'active' 
        },
        attributes: ['menteeId'],
        group: ['menteeId'],
        raw: true
      });

      const currentMenteeCount = uniqueMentees.length;

      // Update mentor profile
      if (mentor.mentorProfile) {
        await models.MentorProfile.update(
          { currentMenteeCount },
          { where: { userId: mentor.id } }
        );

        console.log(`Updated ${mentor.firstName} ${mentor.lastName}: ${currentMenteeCount} unique mentees`);
        updated++;
      }
    }

    console.log(`\n✅ Successfully updated ${updated} mentor profiles`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error recalculating mentor counts:', error);
    process.exit(1);
  }
}

recalculateMentorCounts();
