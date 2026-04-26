import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { Keypair } from "@stellar/stellar-sdk";

function xorBytes(a, b) {
  const result = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// User generated Meta-Key from Bob:
const bobPublicKeyHex = "a2050c066a8dd0e606a96c0659f67ee34944a3fb80e057846a299011a9d32c44";
// Since I don't know Bob's private key, I'll generate a brand new Bob keypair.
const bobPrivate = x25519.utils.randomPrivateKey();
const bobPublic = x25519.getPublicKey(bobPrivate);
const myBobPublicHex = Buffer.from(bobPublic).toString("hex");
const myBobPrivateHex = Buffer.from(bobPrivate).toString("hex");

// Alice's side
const ephemeralPriv = x25519.utils.randomPrivateKey();
const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
const ephemeralPubHex = Buffer.from(ephemeralPub).toString("hex");

const sharedSecretAlice = x25519.getSharedSecret(ephemeralPriv, myBobPublicHex);
const sharedHashAlice = sha256(sharedSecretAlice);

const stealthKeypair = Keypair.random();
const stealthSeed = stealthKeypair.rawSecretKey();
const stealthAddress = stealthKeypair.publicKey();
const encryptedSeedAlice = xorBytes(Buffer.from(stealthSeed), Buffer.from(sharedHashAlice));
const encryptedSeedHex = encryptedSeedAlice.toString("hex");

// Bob's side
try {
  const sharedSecretBob = x25519.getSharedSecret(myBobPrivateHex, ephemeralPubHex);
  const sharedHashBob = sha256(sharedSecretBob);
  const decryptedSeedBob = xorBytes(Buffer.from(encryptedSeedHex, "hex"), Buffer.from(sharedHashBob));
  const recoveredStealthKp = Keypair.fromRawEd25519Seed(decryptedSeedBob);

  console.log("Alice Stealth:   ", stealthAddress);
  console.log("Bob Recovered:   ", recoveredStealthKp.publicKey());
  console.log("Match?", stealthAddress === recoveredStealthKp.publicKey());
} catch(e) {
  console.log("Error:", e.message);
}
