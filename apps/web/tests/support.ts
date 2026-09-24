import { describeSharing, pruneRevisions as pruneRevisionsEffect } from "@hosti/bundles";
import { CATALOG_UPLOAD } from "@hosti/identity";
import { PREVIEW_TOKEN_TTL_MS } from "@hosti/serving";
import { bundlesDir, keepRevisions } from "@/server/config";
import { signingSecret } from "@/server/auth/config";
import {
  runBundlesPromise,
  runCatalogSync,
  runIdentityPromise,
  runIdentitySync,
  runServingSync,
  runStorageSync,
} from "@/server/runtime";

export { CATALOG_UPLOAD, PREVIEW_TOKEN_TTL_MS, describeSharing };

export const SESSION_COOKIE = "hosti_admin";

export function signSession(
  secret: string,
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  return runIdentitySync((identity) => identity.signSession(secret, options));
}

export function verifySession(secret: string, value: string | undefined | null, now?: number) {
  return runIdentitySync((identity) => identity.verifySession(secret, value, now));
}

export function mutationToken(
  secret: string,
  session: NonNullable<ReturnType<typeof verifySession>>,
) {
  return runIdentitySync((identity) => identity.mutationToken(secret, session));
}

export function checkMutationToken(
  secret: string,
  session: NonNullable<ReturnType<typeof verifySession>>,
  supplied: string | null | undefined,
): boolean {
  return runIdentitySync((identity) => identity.checkMutationToken(secret, session, supplied));
}

export function constantTimeEquals(left: string, right: string): boolean {
  return runIdentitySync((identity) => identity.constantTimeEquals(left, right));
}

export function createPushToken(name: string) {
  return runIdentitySync((identity) => identity.createPushToken(name));
}

export function listPushTokens() {
  return runIdentitySync((identity) => identity.listPushTokens);
}

export function deletePushToken(id: number): boolean {
  return runIdentitySync((identity) => identity.deletePushToken(id));
}

export function hashToken(secret: string): string {
  return runIdentitySync((identity) => identity.hashToken(secret));
}

export function readTokenName(value: unknown): string {
  return runIdentitySync((identity) => identity.readTokenName(value));
}

export function takeMintedSecret(id: string | null | undefined, now?: number): string | null {
  return runIdentitySync((identity) => identity.takeMintedSecret(id, now));
}

export function hashPin(pin: string): Promise<string> {
  return runIdentityPromise((identity) => identity.hashPin(pin));
}

export function verifyPin(pin: string, stored: string): Promise<boolean> {
  return runIdentityPromise((identity) => identity.verifyPin(pin, stored));
}

export function findBundle(slug: string) {
  return runCatalogSync((catalog) => catalog.findBundle(slug));
}

export function createBundle(input: {
  slug: string;
  title?: string | null;
  collection?: string | null;
}) {
  return runCatalogSync((catalog) => catalog.createBundle(input));
}

export function recordRevision(input: {
  bundleId: number;
  seq: number;
  byteSize: number;
  fileCount: number;
  pushedBy: string;
}) {
  return runCatalogSync((catalog) => catalog.recordRevision(input));
}

export function listRevisions(bundleId: number) {
  return runCatalogSync((catalog) => catalog.listRevisions(bundleId));
}

export function listCatalog() {
  return runCatalogSync((catalog) => catalog.listCatalog);
}

export function listCollections() {
  return runCatalogSync((catalog) => catalog.listCollections);
}

export function db() {
  return runCatalogSync((catalog) => catalog.database);
}

export function bundleDir(bundleSlug: string): string {
  return runStorageSync((storage) => storage.bundleDir(bundlesDir(), bundleSlug));
}

export function pruneRevisions(bundleSlug: string, keep: number = keepRevisions()) {
  return runBundlesPromise(pruneRevisionsEffect({ bundleSlug, bundlesRoot: bundlesDir(), keep }));
}

export function unlockCookieName(shareSlug: string): string {
  return runServingSync((serving) => serving.unlockCookieName(shareSlug));
}

export function signUnlock(
  secret: string,
  shareSlug: string,
  binding: { bundleId: number; pinHash: string },
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  return runServingSync((serving) => serving.signUnlock(secret, shareSlug, binding, options));
}

export function verifyUnlock(
  secret: string,
  shareSlug: string,
  binding: { bundleId: number; pinHash: string },
  value: string | null | undefined,
  now?: number,
): boolean {
  return runServingSync((serving) => serving.verifyUnlock(secret, shareSlug, binding, value, now));
}

export function signPreviewToken(secret: string, bundleSlug: string, now?: number): string {
  return runServingSync((serving) => serving.signPreviewToken(secret, bundleSlug, now));
}

export function previewGrant(bundleSlug: string, now?: number) {
  return runServingSync((serving) => serving.previewGrant(bundleSlug, signingSecret(), now));
}

export function previewUrl(bundleSlug: string): string {
  return runServingSync((serving) => serving.previewUrl(bundleSlug, signingSecret()));
}
