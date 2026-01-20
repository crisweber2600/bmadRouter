// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

/**
 * Read an environment variable.
 *
 * Trims beginning and trailing whitespace.
 *
 * Will return undefined if the environment variable doesn't exist or cannot be accessed.
 */
export const readEnv = (env: string): string | undefined => {
  if (typeof (globalThis as any).process !== 'undefined') {
    const value = (globalThis as any).process.env?.[env]?.trim() ?? undefined;
    return value === '' ? undefined : value;
  }
  if (typeof (globalThis as any).Deno !== 'undefined') {
    const value = (globalThis as any).Deno.env?.get?.(env)?.trim();
    return value === '' ? undefined : value;
  }
  return undefined;
};
