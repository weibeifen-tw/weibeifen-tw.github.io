# BUILD06 release preflight
- Word catalog snapshot: seven volumes, 30 chapters, 210 pieces. Exact title/order validation added; catalog content unchanged.
- Candidate body files stay outside the public repository until release prerequisites are met.
- Owner approval in chat is distinct from SSH signature. Do not generate an owner key or use CI fixture keys for release.
- Before publishing: owner public key in allowed_signers, reviewed public metadata, real release date, authorized article commit, owner-signed tags, strict verification, Pages deployment gate, browser regression.
- No database migration or errata activation in this commit.
