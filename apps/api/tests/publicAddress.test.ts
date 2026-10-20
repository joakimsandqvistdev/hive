import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress } from "../src/publicAddress.js";

test("public address validation rejects private, special, and mapped ranges", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.2", "172.20.0.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "192.0.2.4", "198.18.0.1", "203.0.113.8", "::1", "::",
    "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1",
    "2002:7f00:1::", "not-an-ip",
  ]) assert.equal(isPublicAddress(address), false, address);
});

test("public address validation accepts public IPv4 and IPv6", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])
    assert.equal(isPublicAddress(address), true, address);
});
