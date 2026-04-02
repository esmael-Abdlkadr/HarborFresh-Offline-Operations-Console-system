# Questions and Assumptions

## 1) Notification service API shape changed between iterations
- **Ambiguity:** early iterations used bulk-send signatures (`send(template, ids)`), while course/notification iteration required single-recipient template data (`send(recipient, template, data)`).
- **Assumption/Solution:** implemented both signatures in one overloaded `notificationService.send` to preserve backward compatibility and satisfy template-data requirements.

## 2) Export/import and user credentials
- **Ambiguity:** export omits `passwordHash`/`salt`, but import must restore users.
- **Assumption/Solution:** import restores user records and reuses existing local credential hashes/salts by username when available; if unavailable, placeholders are used, and local auth behavior follows available credential state.

## 3) Campaign/order + fish dependencies in E2E
- **Ambiguity:** campaign creation requires published fish, but seed data does not guarantee one.
- **Assumption/Solution:** campaign E2E creates and publishes a fish entry first, then creates a campaign against that entry.

## 4) Checkout drawer quantity UX
- **Ambiguity:** spec required "Confirm Join disabled until quantity > 0" while quantity input often defaults to 1.
- **Assumption/Solution:** drawer starts at quantity `0` so confirm is disabled until explicit positive entry.

## 5) Browser API differences in jsdom for Blob/File
- **Ambiguity:** jsdom implementations differ for `Blob.text` / `Blob.arrayBuffer` and strict `BufferSource` typing with WebCrypto.
- **Assumption/Solution:** services/tests use defensive conversions via `Response(...).arrayBuffer()` fallbacks and explicit typed-array conversions to keep runtime + TS compatibility stable.
