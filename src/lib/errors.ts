/** The error's own message when it has one, for showing to the user. */
export function messageOf(error: unknown, fallback = 'Something went wrong.'): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
