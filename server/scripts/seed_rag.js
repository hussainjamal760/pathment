require('dotenv').config();
const { sequelize } = require('../src/db');
const ragIngestionService = require('../src/services/ragIngestionService');

async function seedRag() {
  console.log('🌱 Seeding RAG Knowledge Base...');

  try {
    // 1. A public document about Pathment rules
    await ragIngestionService.enqueueIngestion({
      sourceType: 'document',
      sourceId: 'doc_rules_1',
      text: 'Pathment platform rules: All mentors must reply to mentees within 24 hours. Be respectful and professional. Do not share personal phone numbers.',
      visibility: 'public'
    });

    // 2. A mentor-specific FAQ
    await ragIngestionService.enqueueIngestion({
      sourceType: 'faq',
      sourceId: 'faq_mentor_guidelines',
      text: 'When a mentee asks about resume building, always tell them to prioritize the "Experience" section over "Education" if they have more than 2 years of work history.',
      visibility: 'mentor'
    });

    console.log('✅ Successfully queued dummy documents for RAG ingestion!');
    console.log('⏳ The ragIngestionWorker will process them in the background shortly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed RAG:', error);
    process.exit(1);
  }
}

seedRag();
