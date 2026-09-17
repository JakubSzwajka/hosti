/** Opening PIN-protected links, for the two test files that need them. */
import { createShare, push } from "./api";
import { tarFixture } from "./helpers";

export const TEST_SECRET = "a-long-random-string-for-tests";

export type LinkOptions = { pin?: string; unlisted?: boolean };

/** One more link on a bundle that already exists. */
export async function openLink(
  token: string,
  slug: string,
  options: LinkOptions = {},
): Promise<string> {
  const shared = await createShare(token, slug, options);
  if (shared.status !== 201) throw new Error(`share failed: ${await shared.text()}`);
  const body = (await shared.json()) as { link: { slug: string } };
  return body.link.slug;
}

/** Push the multi-page fixture and open one link on it, PIN optional. */
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
