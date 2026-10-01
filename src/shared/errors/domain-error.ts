/** Business said no. Mapped to HTTP by base class in `common/filters`. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export abstract class NotFoundError extends DomainError {}
export abstract class ConflictError extends DomainError {}
export abstract class InvalidStateError extends DomainError {}
