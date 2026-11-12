# Recurrente — Synapmsg Premium

Cobro Premium vía Recurrente (`RECURRENTE_SECRET_KEY` en Railway).

## Endpoints

| Ruta | Uso |
|---|---|
| `POST /billing/checkout` | Crea checkout y devuelve `checkout_url` |
| `POST /billing/confirm` | `{ checkoutId }` → si `paid`, activa Premium |
| `GET /billing/config` | Flags `recurrenteEnabled` / precio |

## Variables

```
RECURRENTE_SECRET_KEY=sk_live_…   # 64 chars
RECURRENTE_BASE_URL=https://app.recurrente.com/api
RECURRENTE_PREMIUM_CENTS=499
RECURRENTE_PREMIUM_CURRENCY=USD
RECURRENTE_SUCCESS_URL=https://synapmsg.ai/billing/success/
RECURRENTE_CANCEL_URL=https://synapmsg.ai/billing/cancel/
```

Opcional: `RECURRENTE_PRODUCT_ID` / `RECURRENTE_PRICE_ID` / `RECURRENTE_WEBHOOK_SECRET`.

Secrets solo en Railway o `.env` local (nunca en git).
