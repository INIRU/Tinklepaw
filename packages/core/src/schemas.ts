import { z } from 'zod';

export const RewardConfigSchema = z.object({
  pointsPerInterval: z.number().int().min(0),
  intervalSeconds: z.number().int().min(1),
  dailyCapPoints: z.number().int().min(0).nullable(),
  minMessageLength: z.number().int().min(0),
  enabledChannelIds: z.array(z.string()).default([])
});

export type RewardConfig = z.infer<typeof RewardConfigSchema>;
