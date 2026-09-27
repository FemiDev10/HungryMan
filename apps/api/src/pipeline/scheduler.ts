import cron from 'node-cron';
import { getSettings } from '../lib/candidate.js';
import { hhmm } from '../lib/time.js';
import { expireStaleTasks } from './execute.js';
import { runCycle, type CycleAction } from './orchestrator.js';

export interface ScheduleEntry {
  time: string; // HH:MM in settings.timezone
  action: CycleAction;
}

export const DEFAULT_SCHEDULE: ScheduleEntry[] = [
  { time: '08:00', action: 'DISCOVER' },
  { time: '08:15', action: 'ANALYSE' },
  { time: '08:30', action: 'PREPARE' },
  { time: '09:00', action: 'EXECUTE' },
  { time: '13:00', action: 'DISCOVER' },
  { time: '18:00', action: 'FULL_CYCLE' },
];

export function nextScheduled(schedule: ScheduleEntry[], timezone: string, now = new Date()): ScheduleEntry | null {
  if (!schedule.length) return null;
  const current = hhmm(timezone, now);
  const sorted = [...schedule].sort((a, b) => a.time.localeCompare(b.time));
  return sorted.find((s) => s.time > current) ?? sorted[0];
}

/**
 * Minute-resolution scheduler driven by the Settings row, so schedule edits in the
 * dashboard apply without a restart. Scheduled runs only happen while the agent is RUNNING.
 */
export function startScheduler() {
  let lastFired = '';
  const task = cron.schedule('* * * * *', async () => {
    try {
      await expireStaleTasks();
      const s = await getSettings();
      if (s.agentState !== 'RUNNING') return;
      const now = hhmm(s.timezone);
      if (now === lastFired) return;
      const due = ((s.schedule ?? []) as unknown as ScheduleEntry[]).filter((e) => e.time === now);
      if (!due.length) return;
      lastFired = now;
      for (const entry of due) {
        console.log(`[scheduler] ${now} ${entry.action}`);
        const r = await runCycle(entry.action);
        if (r === null) console.log('[scheduler] another cycle is running; skipped');
      }
    } catch (err) {
      console.error('[scheduler]', (err as Error).message);
    }
  });
  return () => task.stop();
}
