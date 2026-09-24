import { runIdentitySync } from "@/server/runtime";

export function holdMintedSecret(secret: string, now?: number): string {
  return runIdentitySync((identity) => identity.holdMintedSecret(secret, now));
}

export function takeMintedSecret(id: string | null | undefined, now?: number): string | null {
  return runIdentitySync((identity) => identity.takeMintedSecret(id, now));
}
