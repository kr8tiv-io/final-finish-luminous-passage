import { randomBytes } from 'node:crypto';
import { createVisualizerSession, verifyVisualizerSession } from '../security/request-guards';

const sessionSecret = randomBytes(32).toString('base64url');
export const VISUALIZER_SESSION_MAX_AGE_MS = 10 * 60 * 1_000;

export function issueVisualizerSession(clientAddress: string, now = Date.now()): string {
  return createVisualizerSession(sessionSecret, clientAddress, now);
}

export function verifyVisualizerSessionForClient(token: string, clientAddress: string, now = Date.now()): boolean {
  return verifyVisualizerSession(token, sessionSecret, clientAddress, now, VISUALIZER_SESSION_MAX_AGE_MS);
}

export function getVisualizerSessionSecret(): string {
  return sessionSecret;
}
