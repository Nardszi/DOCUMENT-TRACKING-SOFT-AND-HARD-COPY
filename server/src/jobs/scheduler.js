import { startDeadlineJob } from './deadline.job.js'
import { startAutoArchiveJob } from './auto-archive.job.js'
import { startNotificationCleanupJob } from './cleanup-notifications.job.js'
import { startFileCleanupJob } from './cleanup-files.job.js'
import { startDailyDigestJob } from './daily-digest.job.js'
import { startEscalateOverdueJob } from './escalate-overdue.job.js'
import { startTokenCleanupJob } from './cleanup-tokens.job.js'
import { startAuditRetentionJob } from './audit-retention.job.js'
import { startApprovalEscalationJob } from './approval-escalation.job.js'

export function startAllJobs() {
  console.log('[scheduler] Starting all scheduled jobs...')

  startDeadlineJob()
  startAutoArchiveJob()
  startNotificationCleanupJob()
  startFileCleanupJob()
  startDailyDigestJob()
  startEscalateOverdueJob()
  startTokenCleanupJob()
  startAuditRetentionJob()
  startApprovalEscalationJob()

  console.log('[scheduler] All jobs scheduled.')
}
