'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const {
  initDb,
  saveMission, getMissions,
} = require('./src/db');
const { runScan } = require('./src/orchestrator');

async function seed() {
  await initDb();
  
  const existingMissions = getMissions();
  if (existingMissions.length > 0) {
    console.log('✅ Data already exists — skipping seed');
    process.exit(0);
  }
  
  // Create mission
  const mission = {
    id: `mission-${uuidv4()}`,
    name: 'AI Platform Competitive Intelligence',
    competitors: ['OpenAI', 'Cohere', 'Mistral', 'Anthropic'],
    dimensions: ['pricing', 'hiring', 'news', 'patents'],
    cadence_minutes: 60,
    status: 'active',
    scan_cycle: 0,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(), // 7 days ago
  };
  saveMission(mission);
  console.log('✅ Created sample mission');

  // Run 5 scan cycles
  console.log('🔄 Running 5 scan cycles to generate sample data...');
  for (let i = 0; i < 5; i++) {
    console.log(`   Running scan cycle ${i + 1}...`);
    await runScan(mission.id);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error seeding data:', err);
  process.exit(1);
});
