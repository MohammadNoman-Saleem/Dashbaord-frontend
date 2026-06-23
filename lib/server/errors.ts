// HttpError hierarchy and PII scrubbing. Replaces NestJS HttpException and the
// global EnvelopeExceptionFilter from the backend src/common/envelope-exception
// .filter.ts.
//
// In the self-contained app there is no global filter; the higher-order
// handler() wrapper (a later foundation file) catches a thrown HttpError,
// reads its status and plain-language message, and emits the error envelope
// { data: null, meta } with reliable=false. A non-HttpError becomes a 500 with
// the default message; its detail is logged (scrubbed) and never sent to the
// client.
//
// SERVER ONLY. scrub() must run on anything logged so emails and phone numbers
// never reach the logs (NHRA). Patient names are kept out of logs at the call
// sites; scrub is the backstop for contact identifiers.

export const DEFAULT_ERROR_MESSAGE =
  "Couldn't load this panel. The rest of the dashboard is fine.";

// Strip emails and phone-like sequences before anything is logged. Verbatim
// from the backend exception filter's scrub().
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[phone]');
}

/** Base for every error that carries an HTTP status and a client-safe,
 *  plain-language message. The handler converts this into the error envelope
 *  with the matching status. */
export class HttpError extends Error {
  readonly status: number;
  /** The plain-language message surfaced to the client in meta.error. */
  readonly messagePlain: string;

  constructor(status: number, messagePlain: string) {
    super(messagePlain);
    this.name = new.target.name;
    this.status = status;
    this.messagePlain = messagePlain;
    // Restore the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request.') {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Wrong username or password.') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'You do not have access to this.') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.') {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'That conflicts with the current state.') {
    super(409, message);
  }
}

export class GoneError extends HttpError {
  constructor(message = 'This is no longer available.') {
    super(410, message);
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}
