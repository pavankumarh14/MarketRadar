'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const {
  initDb,
  saveMission, getMissions, getMissionById,
  saveDAG, getDAGsByMissionId,
  saveFinding, getSignalsByMissionId, getFindingsByDagId,
  saveBrief, getBriefsByMissionId,
} = require('./src/db');
const { runScan } = require('./src/orchestrator');

async function seed() {
  await initDb();
  
  // Create mission if not exists
  let mission = getMissions()[0];
  if (!mission) {
    mission = {
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
  }

  // Run 5 scan cycles
  console.log('🔄 Running 5 scan cycles to generate sample data...');
  for (let i = 0; i < 5; i++) {
    console.log(`   Running scan cycle ${i + 1}...`);
    await runScan(mission.id);
    // Add a small delay between scans
    await new Promise(r => setTimeout(r, 500));
  }

  // Verify data
  const dags = getDAGsByMissionId(mission.id);
  const findings = getSignalsByMissionId(mission.id);
  const briefs = getBriefsByMissionId(mission.id);
  
  console.log('\n✅ Seeded data successfully!');
  console.log(`   - ${dags.length} DAGs created`);
  console.log(`   - ${findings.length} findings created`);
  console.log(`   - ${briefs.length} briefs created`);
  
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error seeding data:', err);
  process.exit(1);
});
