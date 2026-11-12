import { prisma } from '../lib/prisma';
import { planOf, utcDayKey, type PlanId } from './plans';

export class PlanLimitError extends Error {
  status = 402;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PlanLimitError';
  }
}

export type PlanState = {
  planId: PlanId;
  limits: ReturnType<typeof planOf>;
  mediaBytesUsed: number;
  translationsToday: number;
  dayKey: string;
  planExpiresAt: Date | null;
};

export async function getEffectivePlan(userId: string): Promise<PlanState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      planExpiresAt: true,
      mediaBytesUsed: true,
      translationsToday: true,
      translationsDayKey: true,
    },
  });
  if (!user) throw new PlanLimitError('no_user', 'User not found');

  let planId: PlanId = user.plan === 'premium' ? 'premium' : 'free';
  if (
    planId === 'premium' &&
    user.planExpiresAt &&
    user.planExpiresAt.getTime() <= Date.now()
  ) {
    planId = 'free';
    await prisma.user.update({
      where: { id: userId },
      data: { plan: 'free', planExpiresAt: null },
    });
  }

  const limits = planOf(planId);
  const day = utcDayKey();
  const translationsToday =
    user.translationsDayKey === day ? user.translationsToday ?? 0 : 0;

  return {
    planId,
    limits,
    mediaBytesUsed: Number(user.mediaBytesUsed ?? 0),
    translationsToday,
    dayKey: day,
    planExpiresAt: user.planExpiresAt,
  };
}

/** Charge one cloud translation against the daily quota (sender pays). */
export async function consumeTranslation(userId: string): Promise<void> {
  const state = await getEffectivePlan(userId);
  if (state.translationsToday >= state.limits.translationsPerDay) {
    throw new PlanLimitError(
      'translation_limit',
      state.planId === 'premium'
        ? 'Límite diario de traducciones alcanzado.'
        : `Plan gratis: ${state.limits.translationsPerDay} traducciones/día. Pásate a Premium.`,
    );
  }

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { translationsDayKey: true },
  });
  if (!row) throw new PlanLimitError('no_user', 'User not found');

  if (row.translationsDayKey !== state.dayKey) {
    await prisma.user.update({
      where: { id: userId },
      data: { translationsDayKey: state.dayKey, translationsToday: 1 },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { translationsToday: { increment: 1 } },
    });
  }
}

export async function assertMediaUpload(
  userId: string,
  fileBytes: number,
): Promise<PlanState> {
  const state = await getEffectivePlan(userId);
  if (fileBytes > state.limits.maxFileBytes) {
    throw new PlanLimitError(
      'file_too_large',
      `Archivo demasiado grande (máx ${Math.round(state.limits.maxFileBytes / (1024 * 1024))} MB en plan ${state.limits.label}).`,
    );
  }
  if (state.mediaBytesUsed + fileBytes > state.limits.mediaQuotaBytes) {
    throw new PlanLimitError(
      'media_quota',
      state.planId === 'premium'
        ? 'Cuota de media agotada.'
        : 'Cuota de media agotada (gratis 5 GB). Pásate a Premium.',
    );
  }
  return state;
}

export async function assertGlossaryCapacity(userId: string): Promise<void> {
  const state = await getEffectivePlan(userId);
  const count = await prisma.glossaryEntry.count({ where: { userId } });
  if (count >= state.limits.glossaryMax) {
    throw new PlanLimitError(
      'glossary_limit',
      state.planId === 'premium'
        ? `Máximo ${state.limits.glossaryMax} términos en el glosario.`
        : `Plan gratis: máx ${state.limits.glossaryMax} términos. Pásate a Premium.`,
    );
  }
}
