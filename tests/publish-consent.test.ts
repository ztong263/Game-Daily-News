import test from "node:test";
import assert from "node:assert/strict";
import {consentHeaders,verifyConsent,consentFailure} from "../lib/publish/consent";
import {callback} from "../lib/publish/protocol";
test("consent preserves native POST origin and allows only the registered OAuth redirect",()=>{
 assert.equal(consentHeaders["Referrer-Policy"],"same-origin");
 const policy=consentHeaders["Content-Security-Policy"];
 assert.equal(policy.split(";").map(v=>v.trim()).find(v=>v.startsWith("form-action")),`form-action 'self' ${callback}`);
 assert.ok(policy.includes("frame-ancestors 'none'"));
 const origin="https://example.com",csrf="a".repeat(64);
 verifyConsent(new Request(origin,{method:"POST",headers:{origin}}),origin,csrf,csrf);
 for(const other of ["null","https://attacker.example"]){assert.throws(()=>verifyConsent(new Request(origin,{method:"POST",headers:{origin:other}}),origin,csrf,csrf),/invalid_origin/);}
 for(const actual of ["","b".repeat(64),"汉".repeat(64)])assert.throws(()=>verifyConsent(new Request(origin,{method:"POST",headers:{origin}}),origin,csrf,actual),/invalid_csrf/);
});
test("consent failures explain known causes without exposing exception payloads",()=>{
 assert.match(consentFailure(Error("invalid_origin")),/来源/);
 assert.match(consentFailure(Error("invalid_csrf")),/过期/);
 assert.ok(!consentFailure(Error("private-test-token")).includes("private-test-token"));
});
