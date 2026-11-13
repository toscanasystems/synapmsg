# Synapmsg — Bug bounty (política pública)

## Scope
- `https://api.synapmsg.ai`
- App Android Synapmsg (APK / Play cuando publique)
- `https://synapmsg.ai` (landing)

## Out of scope
- DoS / spam volume
- Social engineering a staff
- Issues only in third-party deps without exploit path in Synapmsg
- Physical attacks / stolen unlocked device without duress relevance

## Severities
| Severity | Examples |
|---|---|
| Critical | Server-side E2E plaintext leak; auth bypass; remote code on API |
| High | Wipe without valid Ed25519; key swap undetected by KTL; account takeover |
| Medium | Metadata over-collection; FIDO2 bypass with recovery abuse |
| Low | UX spoofing; non-exploitable info disclosure |

## Rewards
Program in soft launch: acknowledgment + swag / credit. Cash tiers TBD after AGPL public release.

## Report
Email `administrador@toscanasystems.com` · subject `[SECURITY]` · include PoC, impact, affected version.
Safe Harbor for good-faith research that follows this policy.
