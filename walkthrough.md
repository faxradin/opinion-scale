# Security Summary

**Reviewed Files**: 14
**Issues Resolved**: 6

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Spoofable Voter Identity & Vote Lock Bypass | `server.ts`, `server/auth.ts` | 95, 311 | Voting routes previously relied solely on a client-supplied `X-Client-Id` header without server verification, allowing anyone to clear local storage or forge headers to bypass the 1-vote rule, 48-hour cooldown, and 5-change lifetime limit. | High | Fixed | Added HMAC-SHA256 signed `HttpOnly` voter cookies (`dw_voter`) issued and verified server-side alongside persistent `voteMetaByClient` enforcement via `applySingleVoteWithPolicy`. |
| Brute-Force Admin Login & Single-Factor Auth | `server/auth.ts`, `server.ts` | 172, 196, 685 | Admin login previously checked only a passcode without a username, rate limiting, account lockout, or logout token revocation. | High | Fixed | Enforced username + `scrypt` password verification (`N=16384`), 5-attempt / 15-minute IP lockout, minimum 8-character password requirement, `sessionVersion` invalidation on credential updates, and `jti` token revocation on logout. |
| Cross-Site Request Forgery & Missing Security Headers | `server.ts` | 190, 214 | Mutating API endpoints lacked origin verification, tight JSON body caps, and browser security headers (`CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`). | High | Fixed | Added strict Content Security Policy (`frame-ancestors 'self' https://aistudio.google.com https://*.google.com`), `nosniff`, Origin/Host + `Sec-Fetch-Site` validation on mutating `/api/*` routes, and a global `64kb` body cap (`2mb` scoped to admin figure uploads). |
| Missing Rate Limiting on Public Endpoints | `server.ts` | 258 | Public voting, community suggestion, AI research, and Wikidata batch-refresh routes could be flooded by automated scripts. | Medium | Fixed | Added per-IP sliding-window rate limiters (`voteLimiter`, `suggestionLimiter`, `aiLimiter`, `statusLimiter`) returning HTTP `429` when thresholds are exceeded. |
| Internal Network URL Exposure & Unvalidated Image Fetches | `src/utils/ranking.ts`, `server/wiki.ts` | 129, 160, 422 | `isSafeHttpUrl` allowed private/loopback IP URLs (`127.0.0.1`, `169.254.169.254`, `10.x.x.x`), and cached Wikimedia photos were only checked by Content-Type header rather than file bytes. | Medium | Fixed | Blocked private, loopback, link-local, and `.internal`/`.local` hostnames in `isSafeHttpUrl`, enforced raster magic-byte validation (`JPEG`/`PNG`/`GIF`/`WEBP`, max 5 MB, rejecting SVG) in `isValidRasterImageBuffer`, and tightened `:id` route parameters to `[a-zA-Z0-9_-]{1,64}`. |
| Prompt Input Sanitization & File Permissions | `server/wiki.ts`, `server/store.ts`, `server/auth.ts` | 449, 41 | User-supplied figure names and categories were interpolated directly into AI prompts without stripping control characters, and data files used default process permissions. | Low | Fixed | Added `sanitizePromptField` to strip control characters and markup delimiters before prompt construction, and wrote sensitive `data/` files (`store.json`, `admin.json`, cached photos) atomically with `0o600` file permissions (`0o700` directory mode). |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Secrets & Credentials | `server/auth.ts`, `server/wiki.ts`, `.env.example` | `GEMINI_API_KEY`, `SESSION_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSCODE` are loaded exclusively on the server from `process.env` or `scrypt`-hashed `data/admin.json` (`0o600`), never shipped to the client bundle. |
| Dependency Security | `package.json`, `bun.lock` | Audited 299 dependencies via `bun audit` with 0 known vulnerabilities reported. |
| Safe Error Handling | `server.ts` | Global Express error middleware catches malformed JSON (`400`) and unexpected runtime errors (`500`) without leaking stack traces or filesystem paths. |
| Safe Rendering | `src/components/*.tsx`, `src/utils/ranking.ts` | React escapes all rendered text bindings; external links (`wiki.url`, AI sources) are validated with `isSafeHttpUrl` and opened with `rel="noopener noreferrer"`. |

## PoC Verification

### 1. Bypassing the 48-Hour Lock & 5-Change Cap via Spoofed Headers
#### Summary
| Field | Value |
|---|---|
| Issue Type | Broken Client-Side Voting Limit & Session Spoofing |
| Impact | High |
| Affected File | `server.ts:95`, `server/auth.ts:311`, `src/utils/ranking.ts:344` |
| Test Scenario | Submitting a vote with a valid cookie, then immediately attempting a second vote for another figure with a forged `X-Client-Id` header or a tampered `dw_voter` cookie. |

#### How It Was Fixed
The server now issues an HMAC-signed `HttpOnly` cookie (`dw_voter`) on first contact and ignores client-supplied `X-Client-Id` headers whenever a valid signed cookie is present. Each voter's `totalSelections`, `lockedUntil` timestamp (48 hours ahead), and remaining changes (max 5) are persisted in `data/store.json` and enforced on the server before updating counts.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/figures/:id/dislike` enters `resolveVoterId` at `server.ts:95` | Checks `req.headers.cookie['dw_voter']` via `verifySignedVoterToken` (`server/auth.ts:320`) |
| 2 | Tampered cookie fails HMAC `crypto.timingSafeEqual` check; valid cookie returns the authentic `voterId` regardless of forged `X-Client-Id` | Authentic voter identity preserved |
| 3 | `applySingleVoteWithPolicy` (`src/utils/ranking.ts:344`) checks `policy.lockedUntil > nowMs` and `policy.remainingChanges <= 0` | Rejects immediate switch/cancel with `reason: 'cooldown'` and HTTP `409` (`server.ts:407`) |

#### Conclusion
**Fix Verified** - Neither forging `X-Client-Id` headers nor tampering with cookies bypasses the 48-hour cooldown or the 5-change lifetime limit.

---

### 2. Brute-Force Guessing & Unauthorized Access on Admin Endpoints
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Brute-Force Protection & Session Revocation |
| Impact | High |
| Affected File | `server.ts:685`, `server/auth.ts:196`, `server/auth.ts:246` |
| Test Scenario | Sending 6 consecutive invalid login requests to `/api/admin/login`, calling `/api/admin/overview` without a token, or reusing a token after `/api/admin/logout`. |

#### How It Was Fixed
Login attempts now require both a valid username and password verified via timing-safe comparison against `scrypt` hashes, lock out an IP for 15 minutes after 5 failed attempts, and track token IDs (`jti`) and `sessionVersion` so logged-out or rotated sessions are rejected immediately.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/admin/login` invokes `checkAdminLoginRateLimit(ip)` (`server.ts:687`) | Returns HTTP `429` once 5 failures occur within 15 minutes |
| 2 | `GET /api/admin/overview` runs `requireAdmin` (`server.ts:749`, `server/auth.ts:301`) | Rejects missing/invalid/revoked tokens with HTTP `401` |
| 3 | `POST /api/admin/logout` calls `revokeAdminToken` (`server.ts:718`) | Adds `jti` to `REVOKED_JTIS`, causing subsequent requests with that token to fail `verifyAdminToken` (`server/auth.ts:293`) |

#### Conclusion
**Fix Verified** - Automated password guessing is rate-limited, unauthenticated requests are blocked with HTTP `401`, and logged-out tokens cannot be reused.

---

### 3. Private-Network URLs & Path Traversal via Entity IDs
#### Summary
| Field | Value |
|---|---|
| Issue Type | Server-Side Request Forgery & Invalid Entity Identifiers |
| Impact | Medium |
| Affected File | `src/utils/ranking.ts:129`, `server.ts:134`, `server/wiki.ts:422` |
| Test Scenario | Passing `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:8080/admin` to `isSafeHttpUrl`, or sending `../etc/passwd` as `:id` to `/api/figures/:id/photo`. |

#### How It Was Fixed
`isSafeHttpUrl` rejects loopback, private RFC1918 ranges, link-local metadata IPs, and `.local`/`.internal` hostnames. All `:id` route parameters pass through `requireValidIdParam`, and `getCachedFigurePhoto` confines cache file paths to `data/photos` while verifying raster image magic bytes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `isSafeHttpUrl('http://169.254.169.254/latest/meta-data/')` calls `isPrivateOrLoopbackHost` (`src/utils/ranking.ts:167`) | Detects `169.254.x.x` link-local IP and returns `false` |
| 2 | `GET /api/figures/..%2Fetc/photo` hits `requireValidIdParam` (`server.ts:138`) | Fails `/^[a-zA-Z0-9_-]{1,64}$/` regex and returns HTTP `400` before reaching filesystem operations |

#### Conclusion
**Fix Verified** - Internal IP URLs and malformed traversal identifiers are blocked before outbound network calls or disk reads occur.
