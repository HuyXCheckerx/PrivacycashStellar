"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ed25519_1 = require("@noble/curves/ed25519");
var sha256_1 = require("@noble/hashes/sha256");
var stellar_sdk_1 = require("@stellar/stellar-sdk");
function xorBytes(a, b) {
    var length = Math.min(a.length, b.length);
    var result = Buffer.alloc(length);
    for (var i = 0; i < length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}
var aliceEphemeral = ed25519_1.x25519.utils.randomPrivateKey();
var aliceEphemeralPub = Buffer.from(ed25519_1.x25519.getPublicKey(aliceEphemeral)).toString("hex");
var bobPrivate = ed25519_1.x25519.utils.randomPrivateKey();
var bobPublic = Buffer.from(ed25519_1.x25519.getPublicKey(bobPrivate)).toString("hex");
var sharedAlice = ed25519_1.x25519.getSharedSecret(aliceEphemeral, bobPublic);
var hashAlice = (0, sha256_1.sha256)(sharedAlice);
var stealthKp = stellar_sdk_1.Keypair.random();
var seed = stealthKp.rawSecretKey();
var encrypted = xorBytes(Buffer.from(seed), Buffer.from(hashAlice));
var sharedBob = ed25519_1.x25519.getSharedSecret(bobPrivate, aliceEphemeralPub);
var hashBob = (0, sha256_1.sha256)(sharedBob);
var decrypted = xorBytes(encrypted, Buffer.from(hashBob));
var bobStealth = stellar_sdk_1.Keypair.fromRawEd25519Seed(decrypted);
console.log("Original stealth:", stealthKp.publicKey());
console.log("Bob recovered:   ", bobStealth.publicKey());
console.log("Matches:", stealthKp.publicKey() === bobStealth.publicKey());
