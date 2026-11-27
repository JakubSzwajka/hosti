import { randomBytes } from "node:crypto";
import { isIPv4 } from "node:net";

export const PRIVATE_CHANNEL_HEADER = "x-hosti-private-channel";
export const PRIVATE_CHANNEL_SECRET = Symbol.for("hosti.privateChannelSecret");

export function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  if (address === "::1") return true;
  const ipv4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return isIPv4(ipv4) && ipv4.split(".")[0] === "127";
}

export function stampPrivateChannel(request, secret) {
  delete request.headers[PRIVATE_CHANNEL_HEADER];
  if (isLoopbackAddress(request.socket?.remoteAddress)) {
    request.headers[PRIVATE_CHANNEL_HEADER] = secret;
  }
}

export function withPrivateChannel(listener, secret) {
  return function privateChannelListener(request, response) {
    stampPrivateChannel(request, secret);
    return listener.call(this, request, response);
  };
}

export function installPrivateChannel(http, secret = randomBytes(32).toString("hex")) {
  if (Reflect.get(globalThis, PRIVATE_CHANNEL_SECRET) !== undefined) {
    throw new Error("The private channel is already installed");
  }
  Reflect.set(globalThis, PRIVATE_CHANNEL_SECRET, secret);
  const createServer = http.createServer;
  http.createServer = function createPrivateChannelServer(...args) {
    const index = args.findIndex((argument) => typeof argument === "function");
    if (index === -1) throw new Error("The private channel needs a request listener");
    args[index] = withPrivateChannel(args[index], secret);
    return createServer.apply(this, args);
  };
  return secret;
}
