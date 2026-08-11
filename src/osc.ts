import { createSocket, type Socket } from "node:dgram";
import type { Project, Speaker, XYZ } from "./types.js";

type OscArg = { type: "f" | "i" | "s"; value: number | string };
export interface OscMessage { address: string; args: OscArg[] }
export interface SpatialOscFrame { id: string; position: XYZ; gains: number[] }
export interface OscHealth { ready: boolean; confirmed: boolean; rttMs?: number; lastReplyAt?: number }

export function speakerConfigMessages(namespace: string, speakers: Speaker[]): OscMessage[] {
  const base = namespace.replace(/\/$/, "");
  return [
    { address: `${base}/speakers/count`, args: [{ type: "i", value: speakers.length }] },
    { address: `${base}/speakers/outputs`, args: speakers.map(({ out_ch }) => ({ type: "i", value: out_ch })) },
    { address: `${base}/speakers/ids`, args: speakers.map(({ id }) => ({ type: "s", value: id })) }
  ];
}

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

function readPaddedString(packet: Buffer, offset: number): { value: string; next: number } | undefined {
  const end=packet.indexOf(0,offset);if(end<0)return undefined;
  return {value:packet.subarray(offset,end).toString("utf8"),next:Math.ceil((end+1)/4)*4};
}

export function decodeMessage(packet: Buffer): OscMessage | undefined {
  const address=readPaddedString(packet,0);if(!address||!address.value.startsWith("/"))return undefined;
  const tags=readPaddedString(packet,address.next);if(!tags||!tags.value.startsWith(","))return undefined;
  let offset=tags.next;const args:OscArg[]=[];
  for(const type of tags.value.slice(1)){
    if(type==="i"||type==="f"){
      if(offset+4>packet.length)return undefined;
      args.push({type,value:type==="i"?packet.readInt32BE(offset):packet.readFloatBE(offset)});offset+=4;
    }else if(type==="s"){
      const value=readPaddedString(packet,offset);if(!value)return undefined;args.push({type,value:value.value});offset=value.next;
    }else return undefined;
  }
  return {address:address.value,args};
}

export class OscOutput {
  private port?: Socket;
  private ready = false;
  private config: Project["osc"];
  private pendingSpeakers?: Speaker[];
  private heartbeatSeq = 0;
  private heartbeatPending = new Map<number, bigint>();
  private lastHeartbeatReplyAt?: number;
  private heartbeatRttMs?: number;

  constructor(config: Project["osc"]) { this.config = { ...config }; }
  isReady(): boolean { return this.ready; }

  open(): void {
    this.close();
    this.port = createSocket("udp4");
    this.port.on("listening", () => { this.ready = true; if (this.pendingSpeakers) this.speakerConfig(this.pendingSpeakers); });
    this.port.on("message",(packet)=>{
      const message=decodeMessage(packet);if(!message||message.address!==this.address("system/pong"))return;
      const seq=message.args[0]?.type==="i"?Number(message.args[0].value):NaN,start=this.heartbeatPending.get(seq);if(!start)return;
      this.heartbeatPending.delete(seq);this.heartbeatRttMs=Math.max(0,Number(process.hrtime.bigint()-start)/1_000_000);this.lastHeartbeatReplyAt=Date.now();
    });
    this.port.on("error", (error: Error) => console.error("[osc]", error.message));
    this.port.bind(0, "0.0.0.0");
  }

  reconfigure(config: Project["osc"]): void { this.config = { ...config };this.heartbeatPending.clear();this.lastHeartbeatReplyAt=undefined;this.heartbeatRttMs=undefined; }
  close(): void { if (this.port) { try { this.port.close(); } catch { /* already closed */ } } this.port = undefined; this.ready = false;this.heartbeatPending.clear();this.lastHeartbeatReplyAt=undefined;this.heartbeatRttMs=undefined; }

  heartbeat(): void {
    if(!this.ready||!this.port)return;
    const address=this.port.address();if(typeof address==="string")return;
    const seq=this.heartbeatSeq=this.heartbeatSeq>=2_147_483_646?1:this.heartbeatSeq+1;
    this.heartbeatPending.set(seq,process.hrtime.bigint());
    for(const pending of this.heartbeatPending.keys())if(pending!==seq)this.heartbeatPending.delete(pending);
    this.send(encodeMessage(this.message("system/ping",[{type:"i",value:seq},{type:"i",value:address.port}])));
  }

  health(): OscHealth {
    const lastReplyAt=this.lastHeartbeatReplyAt,confirmed=lastReplyAt!==undefined&&Date.now()-lastReplyAt<6_000;
    return {ready:this.ready,confirmed,...(this.heartbeatRttMs!==undefined?{rttMs:this.heartbeatRttMs}:{}),...(lastReplyAt!==undefined?{lastReplyAt}:{})};
  }

  private address(path: string): string { return `${this.config.namespace.replace(/\/$/, "")}/${path}`; }
  private message(address: string, args: OscArg[]): OscMessage { return { address: this.address(address), args }; }
  private send(packet: Buffer): void { if (this.ready && this.port) this.port.send(packet, this.config.port, this.config.host); }

  speakerConfig(speakers: Speaker[]): void {
    this.pendingSpeakers = speakers.map((speaker) => ({ ...speaker }));
    this.send(encodeBundle(speakerConfigMessages(this.config.namespace, speakers)));
  }

  spatialTrigger(id: string, position: XYZ, gains: number[], speakers: Speaker[]): void {
    this.spatialBatchTrigger([{ id, position, gains }], speakers);
  }

  spatialBatchTrigger(frames: SpatialOscFrame[], speakers: Speaker[]): void {
    this.pendingSpeakers = speakers.map((speaker) => ({ ...speaker }));
    this.send(encodeBundle([
      ...speakerConfigMessages(this.config.namespace, speakers),
      ...frames.flatMap(({ id, position, gains }) => [
        this.message(`spatial/${id}/position`, position.map((value) => ({ type: "f", value })) as OscArg[]),
        this.message(`spatial/${id}/gains`, gains.map((value) => ({ type: "f", value }))),
        this.message(`spatial/${id}/trigger`, [{ type: "i", value: 1 }])
      ])
    ]));
  }

  spatialRelease(id: string): void {
    this.send(encodeMessage(this.message(`spatial/${id}/trigger`, [{ type: "i", value: 0 }])));
  }

  spatialBatchRelease(ids: string[]): void {
    if (ids.length === 1) { this.spatialRelease(ids[0]); return; }
    this.send(encodeBundle(ids.map((id) => this.message(`spatial/${id}/trigger`, [{ type: "i", value: 0 }]))));
  }

  spatialMove(id: string, position: XYZ, gains: number[]): void {
    this.spatialBatchMove([{ id, position, gains }]);
  }

  spatialBatchMove(frames: SpatialOscFrame[]): void {
    this.send(encodeBundle(frames.flatMap(({ id, position, gains }) => [
      this.message(`spatial/${id}/position`, position.map((value) => ({ type: "f", value })) as OscArg[]),
      this.message(`spatial/${id}/gains`, gains.map((value) => ({ type: "f", value })))
    ])));
  }

  pad(id: string, gate: 0 | 1): void {
    this.send(encodeMessage(this.message(`pad/${id}/trigger`, [{ type: "i", value: gate }])));
  }

  fader(id: string, value: number): void {
    this.send(encodeMessage(this.message(`fader/${id}/value`, [{ type: "f", value }])));
  }
}
