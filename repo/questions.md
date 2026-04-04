# Questions and Assumptions

## 1) Notification service API shape changed between iterations
- **Ambiguity:** early iterations used bulk-send signatures (`send(template, ids)`), while course/notification iteration required single-recipient template data (`send(recipient, template, data)`).
- **Assumption/Solution:** implemented both signatures in one overloaded `notificationService.send` to preserve backward compatibility and satisfy template-data requirements.

## 2) Export/import and user credentials
- **Ambiguity:** the prompt requires offline transfer of the full dataset, but does not specify whether exported user records should include credential fields (`passwordHash`, `salt`) or strip them and require manual credential re-setup on the target device.
- **Solution:** implemented with credential fields included in the export. The export snapshot includes `passwordHash` and `salt` for every user (see `src/services/financeService.ts`, `exportDataset`). No plaintext passwords are ever stored or exported — only the irreversible PBKDF2 hashes and their salts. Import fully replaces all local IndexedDB tables with the snapshot, so users can log in on the restored device immediately without any re-setup or placeholder credentials.

## 3) Campaign/order + fish dependencies in E2E
- **Ambiguity:** campaign creation requires published fish, but seed data does not guarantee one.
- **Assumption/Solution:** campaign E2E creates and publishes a fish entry first, then creates a campaign against that entry.

## 4) Checkout drawer quantity UX
- **Ambiguity:** spec required "Confirm Join disabled until quantity > 0" while quantity input often defaults to 1.
- **Assumption/Solution:** drawer starts at quantity `0` so confirm is disabled until explicit positive entry.

## 5) Browser API differences in jsdom for Blob/File
- **Ambiguity:** jsdom implementations differ for `Blob.text` / `Blob.arrayBuffer` and strict `BufferSource` typing with WebCrypto.
- **Assumption/Solution:** services/tests use defensive conversions via `Response(...).arrayBuffer()` fallbacks and explicit typed-array conversions to keep runtime + TS compatibility stable.
