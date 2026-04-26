const { x25519 } = require("@noble/curves/ed25519");
const { sha256 } = require("@noble/hashes/sha256");
const { Keypair } = require("@stellar/stellar-sdk");

function xorBytes(a, b) {
  const length = Math.min(a.length, b.length);
  const result = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

const bobPrivate = x25519.utils.randomPrivateKey();
const bobPublic = x25519.getPublicKey(bobPrivate);
const bobPrivateHex = Buffer.from(bobPrivate).toString("hex");
const bobPublicHex = Buffer.from(bobPublic).toString("hex");

const aliceEphemeral = x25519.utils.randomPrivateKey();
const aliceEphemeralPub = x25519.getPublicKey(aliceEphemeral);
const aliceEphemeralPubHex = Buffer.from(aliceEphemeralPub).toString("hex");

const sharedSecretAlice = x25519.getSharedSecret(aliceEphemeral, bobPublicHex);
const sharedHashAlice = sha256(sharedSecretAlice);

const stealthKp = Keypair.random();
const stealthSeed = stealthKp.rawSecretKey();
const encryptedSeedAlice = xorBytes(Buffer.from(stealthSeed), Buffer.from(sharedHashAlice));
const encryptedSeedHex = encryptedSeedAlice.toString("hex");

const sharedSecretBob = x25519.getSharedSecret(bobPrivateHex, aliceEphemeralPubHex);
const sharedHashBob = sha256(sharedSecretBob);

const decryptedSeedBob = xorBytes(Buffer.from(encryptedSeedHex, "hex"), Buffer.from(sharedHashBob));
const recoveredStealthKp = Keypair.fromRawEd25519Seed(decryptedSeedBob);

console.log("Original: ", stealthKp.publicKey());
console.log("Recovered:", recoveredStealthKp.publicKey());
console.log("Match:    ", stealthKp.publicKey() === recoveredStealthKp.publicKey());
