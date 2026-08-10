require('dotenv').config();
const { sequelize, models } = require('../src/db');
const ragIngestionService = require('../src/services/ragIngestionService');

async function reseed() {
  try {
    console.log('Clearing old knowledge chunks and jobs...');
    await sequelize.query('TRUNCATE TABLE knowledge_chunks CASCADE;');
    await sequelize.query('TRUNCATE TABLE rag_ingestion_jobs CASCADE;');
    
    console.log('Seeding new documents...');
    // A mentor-specific FAQ (Assume mentor_id is needed, but seed_rag.js didn't provide one. Wait, seed_rag.js didn't provide a mentor_id!)
    // Let's find the mentor user to attach to this.
    const mentor = await models.User.findOne({ where: { email: 'mentor.omar@demo.pathment.com' } });
    if (!mentor) throw new Error('No mentor found');

    await ragIngestionService.enqueueIngestion({
      sourceType: 'document',
      sourceId: 'doc_rules_1',
      text: 'Pathment platform rules: All mentors must reply to mentees within 24 hours. Be respectful and professional. Do not share personal phone numbers.',
      visibility: 'public'
    });

    await ragIngestionService.enqueueIngestion({
      sourceType: 'faq',
      sourceId: 'faq_mentor_guidelines',
      text: 'When a mentee asks about resume building, always tell them to prioritize the "Experience" section over "Education" if they have more than 2 years of work history.',
      visibility: 'mentor',
      mentorId: mentor.id
    });

    console.log('Successfully enqueued documents for ingestion. The worker will pick them up.');
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
}

reseed();
