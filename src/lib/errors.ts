/**
 * Shared error types.
 *
 * Deliberately free of any server-only import. `src/server/actions/types.ts` is
 * reachable from client components (they import `idleState` and `ActionState`),
 * so anything it pulls in must be safe to bundle for the browser.
 */
export class AuthorizationError extends Error {
  constructor(message = "ไม่มีสิทธิ์เข้าถึง / Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}
