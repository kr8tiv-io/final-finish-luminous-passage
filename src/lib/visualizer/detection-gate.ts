/**
 * Intentionally closed for this private-first preview. A provider key alone
 * must not activate uploads. Replace this gate only after isolated decoding,
 * bounded provider cancellation, approved privacy terms and enforced spending
 * limits pass their separate deployment acceptance tests.
 */
export function automaticDetectionEnabled(): boolean { return false; }
