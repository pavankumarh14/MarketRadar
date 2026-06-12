'use strict';

const cron = require('node-cron');

// Active cron jobs keyed by mission_id — allows per-mission pause/resume.
const activeJobs = new Map();

/**
 * Convert a cadence in minutes to a cron expression.
 * Only supports the common hackathon cadences; extend as needed.
 */
function toCronExpression(cadenceMinutes) {
  switch (cadenceMinutes) {
    case 15:  return '*/15 * * * *';
    case 30:  return '*/30 * * * *';
    case 60:  return '0 * * * *';
    case 240: return '0 */4 * * *';
    default:  return `*/${cadenceMinutes} * * * *`;  // best-effort for other values
  }
}

/**
 * Start scheduling recurring scans for a mission.
 *
 * @param {string} missionId
 * @param {number} cadenceMinutes
 * @param {Function} onTick  Async callback: () => Promise<void>
 */
function startScheduler(missionId, cadenceMinutes, onTick) {
  stopScheduler(missionId);  // idempotent — cancel any existing job first

  const expr = toCronExpression(cadenceMinutes);
  console.log(`[scheduler] Mission ${missionId}: scheduling every ${cadenceMinutes} min (${expr})`);

  const job = cron.schedule(expr, async () => {
    console.log(`[scheduler] Triggering scan for mission ${missionId}`);
    try {
      await onTick();
    } catch (err) {
      console.error(`[scheduler] Scan error for mission ${missionId}:`, err.message);
    }
  });

  activeJobs.set(missionId, job);
}

/** Cancel the scheduled job for a mission. Safe to call if no job is running. */
function stopScheduler(missionId) {
  const job = activeJobs.get(missionId);
  if (job) {
    job.stop();
    activeJobs.delete(missionId);
    console.log(`[scheduler] Stopped job for mission ${missionId}`);
  }
}

function getActiveJobIds() {
  return [...activeJobs.keys()];
}

module.exports = { startScheduler, stopScheduler, getActiveJobIds };
