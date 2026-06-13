// Fixture for GET /api/pipeline/velocity: how long open deals sit in each
// stage, and real created-to-close cycle times for won deals. All data is
// fictional.
import type { PipelineVelocityData, VelocityStage } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function stage(name: string, count: number, avg: number, min: number, max: number): VelocityStage {
  return { name, count, avg_days: avg, min_days: min, max_days: max }
}

const DATA = {
  pipelines: [
    {
      pipeline: 'Telemedicine',
      stages: [
        stage('New Deal', 4, 2, 0, 5),
        stage('Quote Proposed', 3, 6, 2, 11),
        stage('Payment Done', 1, 1, 1, 1),
        stage('Consultation Scheduled', 2, 3, 1, 5),
        stage('TeleConsult Completed', 0, 0, 0, 0),
      ],
      won: { count: 19, avg_days: 4, min_days: 1, max_days: 12 },
      fastest: { name: 'Payment Done', avg_days: 1 },
      bottleneck: { name: 'Quote Proposed', avg_days: 6 },
      open_avg_days: 4,
    },
    {
      pipeline: 'Treatment',
      stages: [
        stage('New Deal', 3, 5, 1, 9),
        stage('Quote Proposed', 2, 14, 8, 20),
        stage('Consultation Scheduled', 1, 4, 4, 4),
        stage('Consult Payment', 1, 2, 2, 2),
        stage('TeleConsult Completed', 1, 7, 7, 7),
        stage('Treatment Quote', 2, 19, 12, 26),
        stage('Treatment Payment', 0, 0, 0, 0),
        stage('Treatment Scheduled', 1, 9, 9, 9),
        stage('Treatment in Progress', 1, 21, 21, 21),
        stage('Treatment Completed', 0, 0, 0, 0),
      ],
      won: { count: 8, avg_days: 34, min_days: 12, max_days: 71 },
      fastest: { name: 'Consult Payment', avg_days: 2 },
      bottleneck: { name: 'Treatment in Progress', avg_days: 21 },
      open_avg_days: 11,
    },
    {
      pipeline: 'Corporates',
      stages: [
        stage('Outreach', 2, 12, 5, 19),
        stage('Interest', 1, 30, 30, 30),
        stage('Agreement', 1, 8, 8, 8),
        stage('Readiness', 0, 0, 0, 0),
        stage('Live', 0, 0, 0, 0),
      ],
      won: null,
      fastest: { name: 'Agreement', avg_days: 8 },
      bottleneck: { name: 'Interest', avg_days: 30 },
      open_avg_days: 16,
    },
    {
      pipeline: 'Doctor',
      stages: [
        stage('Discovery B2B', 20, 41, 3, 120),
        stage('Contacted', 8, 25, 6, 60),
        stage('New Deal Doctor', 4, 18, 4, 33),
        stage('Proposal Sent', 5, 22, 9, 41),
        stage('NHRA Qualification', 3, 35, 14, 58),
        stage('Onboarded B2B', 2, 51, 40, 62),
        stage('Final Approval', 2, 12, 8, 16),
        stage('Live Doctor', 0, 0, 0, 0),
      ],
      won: { count: 11, avg_days: 47, min_days: 9, max_days: 130 },
      fastest: { name: 'Final Approval', avg_days: 12 },
      bottleneck: { name: 'Onboarded B2B', avg_days: 51 },
      open_avg_days: 33,
    },
    {
      pipeline: 'Hospital or Clinic',
      stages: [
        stage('Discovery B2B', 6, 38, 10, 90),
        stage('Contacted B2B', 3, 21, 7, 40),
        stage('New Deal  B2B', 2, 55, 30, 80),
        stage('Proposal B2B', 2, 17, 12, 22),
        stage('Onboarded B2B', 1, 44, 44, 44),
        stage('Final Approval', 1, 9, 9, 9),
        stage('Live Partner B2B', 0, 0, 0, 0),
      ],
      won: { count: 4, avg_days: 29, min_days: 6, max_days: 68 },
      fastest: { name: 'Final Approval', avg_days: 9 },
      bottleneck: { name: 'New Deal  B2B', avg_days: 55 },
      open_avg_days: 30,
    },
  ],
} satisfies PipelineVelocityData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}
