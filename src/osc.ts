import { createSocket, type Socket } from "node:dgram";
import type { Project, XYZ } from "./types.js";

type OscArg = { type: "f" | "i" | "s"; value: number | string };
interface OscMessage { address: string; args: OscArg[] }

function paddedString(value: string): Buffer {
  const source = Buffer.from(`${value}\0`, "utf8");
  const output = Buffer.alloc(Math.ceil(source.length / 4) * 4);
  source.copy(output);
  return output;
}

export function encodeMessage(message: OscMessage): Buffer {
  const values = message.args.map((arg) => {
    if (arg.type === "s") return paddedString(String(arg.value));
    const buffer = Buffer.alloc(4);
    if (arg.type === "i") buffer.writeInt32BE(Number(arg.value), 0);
    else buffer.writeFloatBE(Number(arg.value), 0);
    return buffer;
  });
  return Buffer.concat([paddedString(message.address), paddedString(`,${message.args.map((arg) => arg.type).join("")}`), ...values]);
}

export function encodeBundle(messages: OscMessage[]): Buffer {
  const timetag = Buffer.alloc(8); timetag.writeUInt32BE(1, 4); // OSC immediate timetag
  const packets = messages.map((message) => {
    const packet = encodeMessage(message); const size = Buffer.alloc(4); size.writeUInt32BE(packet.length, 0);
    return Buffer.concat([size, packet]);
  });
  return Buffer.concat([paddedString("#bundle"), timetag, ...packets]);
}

export class OscOutput {
  private port?: Socket;
  private ready = false;
  private config: Project["osc"];

  constructor(config: Project["osc"]) { this.config = { ...config }; }
  isReady(): boolean { return this.ready; }

  open(): void {
    this.close();
    this.port = createSocket("udp4");
    this.port.on("listening", () => { this.ready = true; });
    this.port.on("error", (error: Error) => console.error("[osc]", error.message));
    this.port.bind(0, "0.0.0.0");
  }

  reconfigure(config: Project["osc"]): void { this.config = { ...config }; }
  close(): void { if (this.port) { try { this.port.close(); } catch { /* already closed */ } } this.port = undefined; this.ready = false; }

  private address(path: string): string { return `${this.config.namespace.replace(/\/$/, "")}/${path}`; }
  private message(address: string, args: OscArg[]): OscMessage { return { address: this.address(address), args }; }
  private send(packet: Buffer): void { if (this.ready && this.port) this.port.send(packet, this.config.port, this.config.host); }

  spatial(id: string, position: XYZ, gains: number[], seq: number): void {
    this.send(encodeBundle([
      this.message(`spatial/${id}/position`, position.map((value) => ({ type: "f", value })) as OscArg[]),
      this.message(`spatial/${id}/gains`, gains.map((value) => ({ type: "f", value }))),
      this.message(`spatial/${id}/trigger`, [{ type: "i", value: seq }])
    ]));
  }

  spatialMove(id: string, position: XYZ, gains: number[]): void {
    this.send(encodeBundle([
      this.message(`spatial/${id}/position`, position.map((value) => ({ type: "f", value })) as OscArg[]),
      this.message(`spatial/${id}/gains`, gains.map((value) => ({ type: "f", value })))
    ]));
  }

  pad(id: string, seq: number): void {
    this.send(encodeMessage(this.message(`pad/${id}/trigger`, [{ type: "i", value: seq }])));
  }

  fader(id: string, value: number): void {
    this.send(encodeMessage(this.message(`fader/${id}/value`, [{ type: "f", value }])));
  }
}
