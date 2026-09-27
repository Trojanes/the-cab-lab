const assert = require("node:assert/strict");
const { zipStore } = require("./cnjobZip.js");
const buf = zipStore([
  { name: "manifest.json", data: Buffer.from("{\"format\":\"cabinetnc.manufacturing-snapshot\"}") },
  { name: "snapshot.json", data: Buffer.from("{\"units\":\"mm\"}") },
]);
assert.equal(buf.readUInt32LE(0), 0x04034b50);
assert.ok(buf.includes(Buffer.from("manifest.json")));
assert.ok(buf.includes(Buffer.from("snapshot.json")));
assert.ok(buf.includes(Buffer.from("cabinetnc.manufacturing-snapshot")));
console.log("cnjob zip ok");
