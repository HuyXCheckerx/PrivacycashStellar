import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { Keypair } from "@stellar/stellar-sdk";

function xorBytes(a, b) {
  const length = Math.min(a.length, b.length);
  const result = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// 1. Setup Bob's Meta-Key
const bobPrivate = x25519.utils.randomPrivateKey();
const bobPublic = x25519.getPublicKey(bobPrivate);
const bobPrivateHex = Buffer.from(bobPrivate).toString("hex");
const bobPublicHex = Buffer.from(bobPublic).toString("hex");

// 2. Alice Math
const aliceEphemeral = x25519.utils.randomPrivateKey();
const aliceEphemeralPub = x25519.getPublicKey(aliceEphemeral);
const aliceEphemeralPubHex = Buffer.from(aliceEphemeralPub).toString("hex");

// Alice computes shared secret using Bob's public key
const sharedSecretAlice = x25519.getSharedSecret(aliceEphemeral, bobPublicHex);
const sharedHashAlice = sha256(sharedSecretAlice);

const stealthKp = Keypair.random();
const stealthSeed = stealthKp.rawSecretKey();
const encryptedSeedAlice = xorBytes(Buffer.from(stealthSeed), Buffer.from(sharedHashAlice));
const encryptedSeedHex = encryptedSeedAlice.toString("hex");

// 3. Bob Math
// Bob computes shared secret using Alice's ephemeral public key
const sharedSecretBob = x25519.getSharedSecret(bobPrivateHex, aliceEphemeralPubHex);
const sharedHashBob = sha256(sharedSecretBob);

const decryptedSeedBob = xorBytes(Buffer.from(encryptedSeedHex, "hex"), Buffer.from(sharedHashBob));
const recoveredStealthKp = Keypair.fromRawEd25519Seed(decryptedSeedBob);

console.log("Alice computed Stealth Address:", stealthKp.publicKey());
console.log("Bob recovered Stealth Address: ", recoveredStealthKp.publicKey());
console.log("Match?", stealthKp.publicKey() === recoveredStealthKp.publicKey());
