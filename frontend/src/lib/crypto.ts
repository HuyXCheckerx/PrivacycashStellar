import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * Generate Bob's Stealth Meta-Key.
 * This generates a simple x25519 keypair used ONLY for ECDH.
 * 
 * @returns { privateKeyHex, publicKeyHex }
 */
export function generateMetaKey() {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  
  return {
    privateKeyHex: Buffer.from(privateKey).toString("hex"),
    publicKeyHex: Buffer.from(publicKey).toString("hex"),
  };
}

/**
 * Recover a Meta-Keypair from an existing private key hex.
 */
export function recoverMetaKey(privateKeyHex: string) {
  const publicKey = x25519.getPublicKey(Buffer.from(privateKeyHex, 'hex'));
  return {
    privateKeyHex,
    publicKeyHex: Buffer.from(publicKey).toString("hex"),
  };
}

/**
 * XOR two byte arrays of the same length
 */
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Alice creates a stealth address for Bob using Bob's Meta-Key (publicKeyHex).
 * We use a hybrid approach:
 * 1. Alice creates a fresh random Stellar Keypair (the Stealth Address).
 * 2. Alice performs ECDH with Bob's Meta-Key to get a Shared Secret.
 * 3. Alice encrypts the fresh Stellar Seed using the Shared Secret (XOR One-Time Pad).
 * 4. Bob will be able to reverse this ECDH and decrypt the exact Stellar Seed.
 */
export function deriveStealthAddress(bobPublicKeyHex: string) {
  // 1. Generate Alice's ephemeral ECDH keypair
  const ephemeralPriv = x25519.utils.randomSecretKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // 2. Compute Shared Secret Point
  const sharedSecretPointBytes = x25519.getSharedSecret(ephemeralPriv, Buffer.from(bobPublicKeyHex, 'hex'));
  
  // Hash the shared secret point to get our 32-byte encryption key
  const sharedSecretHash = sha256(sharedSecretPointBytes);

  // 3. Generate a brand new Stellar account (The Stealth Address)
  const stealthKeypair = Keypair.random();
  const stealthSeed = stealthKeypair.rawSecretKey(); // 32 bytes
  const stealthAddress = stealthKeypair.publicKey(); // G...

  // 4. Encrypt the 32-byte seed with the 32-byte shared secret hash
  const encryptedSeed = xorBytes(stealthSeed, sharedSecretHash);

  return {
    ephemeralPubHex: Buffer.from(ephemeralPub).toString("hex"),
    encryptedSeedHex: Buffer.from(encryptedSeed).toString("hex"),
    stealthAddress: stealthAddress,
  };
}

/**
 * Bob scans an event and checks if it belongs to him.
 */
export function checkStealthAddress(
  ephemeralPubHex: string, 
  encryptedSeedHex: string, 
  bobPrivateKeyHex: string
) {
  try {
    // 1. Bob computes the Shared Secret Point: Bob's PrivateKey * Ephemeral PublicKey
    const sharedSecretPointBytes = x25519.getSharedSecret(
      Buffer.from(bobPrivateKeyHex, 'hex'), 
      Buffer.from(ephemeralPubHex, 'hex')
    );

    // 2. Hash to get the 32-byte decryption key
    const sharedSecretHash = sha256(sharedSecretPointBytes);

    // 3. Decrypt the seed
    const encryptedSeed = Buffer.from(encryptedSeedHex, "hex");
    const decryptedSeed = xorBytes(encryptedSeed, sharedSecretHash);

    // 4. Reconstruct the Stellar Keypair
    const stealthKeypair = Keypair.fromRawEd25519Seed(Buffer.from(decryptedSeed));

    return {
      stealthAddress: stealthKeypair.publicKey(),
      stealthSeedSecret: stealthKeypair.secret(), // S...
      stealthKeypair,
    };
  } catch (error) {
    // If the math fails, it's not Bob's
    return null;
  }
}
