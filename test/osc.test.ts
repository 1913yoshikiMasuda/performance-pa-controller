import { describe, expect, it } from "vitest";
import { createSocket } from "node:dgram";
import { decodeMessage, encodeBundle, encodeMessage, OscOutput, speakerConfigMessages } from "../src/osc.js";
import { defaultProject } from "../src/types.js";

describe("OSC encoding", () => {
  it("encodes a padded address, type tag, int, and float", () => {
    const packet = encodeMessage({ address: "/pps/test", args: [{ type: "i", value: 7 }, { type: "f", value: 0.5 }] });
    expect(packet.length % 4).toBe(0);
    expect(packet.subarray(0, 10).toString()).toContain("/pps/test");
    expect(packet.includes(Buffer.from(",if\0"))).toBe(true);
  });

  it("decodes heartbeat pong messages", () => {
    const packet=encodeMessage({address:"/pps/system/pong",args:[{type:"i",value:42}]});
    expect(decodeMessage(packet)).toEqual({address:"/pps/system/pong",args:[{type:"i",value:42}]});
  });

  it("confirms a real UDP heartbeat round trip", async () => {
    const receiver=createSocket("udp4");await new Promise<void>((resolve)=>receiver.bind(0,"127.0.0.1",resolve));
    const address=receiver.address();if(typeof address==="string")throw new Error("Expected UDP address");
    const project=defaultProject();project.osc={...project.osc,host:"127.0.0.1",port:address.port};const output=new OscOutput(project.osc);
    try{
      const pongSent=new Promise<void>((resolve,reject)=>receiver.once("message",(packet)=>{const ping=decodeMessage(packet),seq=ping?.args[0]?.value,replyPort=Number(ping?.args[1]?.value);if(ping?.address!=="/pps/system/ping"||typeof seq!=="number"||!replyPort){reject(new Error("Invalid heartbeat ping"));return;}receiver.send(encodeMessage({address:"/pps/system/pong",args:[{type:"i",value:seq}]}),replyPort,"127.0.0.1",(error)=>error?reject(error):resolve());}));
      output.open();for(let attempts=0;!output.isReady()&&attempts<50;attempts++)await new Promise((resolve)=>setTimeout(resolve,2));
      output.heartbeat();await pongSent;for(let attempts=0;!output.health().confirmed&&attempts<50;attempts++)await new Promise((resolve)=>setTimeout(resolve,2));
      expect(output.health()).toMatchObject({ready:true,confirmed:true});expect(output.health().rttMs).toBeTypeOf("number");
    }finally{output.close();receiver.close();}
  });

  it("encodes an immediate bundle with size-prefixed messages", () => {
    const bundle = encodeBundle([{ address: "/pps/a", args: [] }, { address: "/pps/b", args: [] }]);
    expect(bundle.subarray(0, 8).toString()).toBe("#bundle\0");
    expect(bundle.readUInt32BE(12)).toBe(1);
    expect(bundle.readUInt32BE(16)).toBeGreaterThan(0);
  });

  it("describes speaker count, output mapping, and stable IDs", () => {
    const speakers = defaultProject().speakers.slice(0, 2);
    speakers[0].out_ch = 5; speakers[1].out_ch = 8;
    expect(speakerConfigMessages("/pps/", speakers)).toEqual([
      { address: "/pps/speakers/count", args: [{ type: "i", value: 2 }] },
      { address: "/pps/speakers/outputs", args: [{ type: "i", value: 5 }, { type: "i", value: 8 }] },
      { address: "/pps/speakers/ids", args: [{ type: "s", value: "SP01" }, { type: "s", value: "SP02" }] }
    ]);
  });

  it("packs linked source frames into one OSC bundle", () => {
    const project=defaultProject(),output=new OscOutput(project.osc);let packet:Buffer|undefined;
    (output as unknown as {send:(value:Buffer)=>void}).send=(value)=>{packet=value;};
    output.spatialBatchTrigger([
      {id:"S01",position:[0.2,0.3,0.4],gains:[1,0]},
      {id:"S02",position:[0.5,0.6,0.7],gains:[0,1]}
    ],project.speakers.slice(0,2));
    expect(packet?.subarray(0,8).toString()).toBe("#bundle\0");
    expect(packet?.includes(Buffer.from("/pps/spatial/S01/trigger"))).toBe(true);
    expect(packet?.includes(Buffer.from("/pps/spatial/S02/trigger"))).toBe(true);
  });
});
