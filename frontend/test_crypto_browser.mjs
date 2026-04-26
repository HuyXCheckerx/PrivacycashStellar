import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { Keypair } from "@stellar/stellar-sdk";

function xorBytes(a, b) {
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

const alicePriv = x25519.utils.randomPrivateKey();
const alicePub = x25519.getPublicKey(alicePriv);

const bobPriv = x25519.utils.randomPrivateKey();
const bobPub = x25519.getPublicKey(bobPriv);

const aliceShared = x25519.getSharedSecret(alicePriv, Buffer.from(bobPub).toString("hex"));
const bobShared = x25519.getSharedSecret(Buffer.from(bobPriv).toString("hex"), Buffer.from(alicePub).toString("hex"));

console.log(Buffer.from(aliceShared).toString("hex") === Buffer.from(bobShared).toString("hex"));
