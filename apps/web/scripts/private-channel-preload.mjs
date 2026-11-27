import http from "node:http";
import { installPrivateChannel } from "./private-channel.mjs";

installPrivateChannel(http);
