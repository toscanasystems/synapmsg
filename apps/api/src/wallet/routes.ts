/**
 * P2P wallet stub (Fase 5) — design surface only until compliance.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/status', authMiddleware, (_req: Request, res: Response) => {
  res.json({
    protocol: 'synapmsg-wallet-v0',
    status: 'design_stub',
    enabled: false,
    custody: 'none',
    note: 'No custody, no transfers until legal/compliance greenlight.',
    planned: {
      balances: 'GET /wallet/balances',
      transfer: 'POST /wallet/transfer (P2P, user-to-user)',
      history: 'GET /wallet/ledger',
      kyc: 'required before enable',
    },
    compliance_blockers: [
      'Licencia / registro de proveedor de servicios de pago',
      'KYC/AML del emisor',
      'Jurisdicción y custody policy',
    ],
  });
});

router.get('/capabilities', (_req: Request, res: Response) => {
  res.json({
    protocol: 'synapmsg-wallet-v0',
    status: 'design_stub',
    enabled: false,
  });
});

export default router;
