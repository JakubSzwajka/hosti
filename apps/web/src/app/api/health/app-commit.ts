export const COMMIT_LENGTH = 12;

export function appCommit(value: string | undefined = process.env.APP_COMMIT): string {
  const commit = value?.trim();
  return commit ? commit.slice(0, COMMIT_LENGTH) : "unknown";
}
