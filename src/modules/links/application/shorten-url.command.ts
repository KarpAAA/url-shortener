export interface ShortenUrlCommand {
  /** The destination as the client sent it; validated and normalised by the domain. */
  readonly url: string;
}
