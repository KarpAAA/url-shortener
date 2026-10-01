/** The outside world failed. `retryable` decides 503 (try again) versus 502. */
export abstract class InfrastructureError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}
