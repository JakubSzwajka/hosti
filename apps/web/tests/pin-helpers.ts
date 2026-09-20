/** Opening pin-protected links, for the test files that need them. */
import type { SharingMode } from "@hosti/shared";
import { push, setSharing, shareSlugOf } from "./api";
import { tarFixture } from "./helpers";

export const TEST_SECRET = "a-long-random-string-for-tests";

export type LinkOptions = { pin?: string; mode?: SharingMode };

/** Move a bundle that already exists into one of the three states. */
export async function openLink(
  token: string,
  slug: string,
  options: LinkOptions = {},
): Promise<string> {
  const mode = options.mode ?? (options.pin ? "pin" : "link");
  const shared = await setSharing(token, slug, {
    mode,
    ...(options.pin ? { pin: options.pin } : {}),
  });
  if (shared.status !== 200) throw new Error(`sharing failed: ${await shared.text()}`);
  return shareSlugOf(shared);
}

/** Push the multi-page fixture and open its link, pin optional. */
export async function protectedLink(
  token: string,
  slug: string,
  options: LinkOptions = {},
): Promise<string> {
  const pushed = await push(token, slug, await tarFixture("multi-page"));
  if (pushed.status !== 201) throw new Error(`push failed: ${await pushed.text()}`);
  return openLink(token, slug, options);
}

/** The unlock grant out of a Set-Cookie header, ready to send back. */
export function grantFrom(response: Response, cookieName: string): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${cookieName}=([^;]+)`));
  if (!match) throw new Error(`no ${cookieName} in ${header || "(no set-cookie)"}`);
  return `${cookieName}=${match[1]}`;
}
