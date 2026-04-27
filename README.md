# 🌑 Stellar Stealth Protocol

# TRY IT OUT ON TESTNET!
https://www.cryptodealer.fun
<img width="3769" height="2027" alt="image" src="https://github.com/user-attachments/assets/173f7cbb-a407-43d6-8691-605127b3cc4c" />




> **Private, non-custodial payments on the Stellar Testnet — powered by Soroban smart contracts, X25519 ECDH cryptography, and an automated Relayer.**

Stellar Stealth Protocol is a proof-of-concept implementation of [stealth addresses](https://vitalik.eth.limo/general/2023/01/20/stealth.html) for the Stellar network. It allows a sender (Alice) to deposit funds to an **unlinkable, one-time stealth address** that only the intended recipient (Bob) can discover and withdraw — without any on-chain link between Alice, Bob, and the stealth address being publicly visible.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone & Install](#1-clone--install)
  - [2. Run the Frontend](#2-run-the-frontend)
  - [3. Deploy the Contract (optional)](#3-deploy-the-contract-optional)
- [Cryptographic Protocol](#cryptographic-protocol)
- [Smart Contract](#smart-contract)
- [Relayer](#relayer)
- [Security Considerations](#security-considerations)
- [Testnet Deployment](#testnet-deployment)
- [Roadmap](#roadmap)

---



# 🌑 Demonstration
https://youtu.be/I0S4O1DZuXs
<img width="3761" height="2023" alt="Screenshot 2026-04-26 221439" src="https://github.com/user-attachments/assets/88ae5601-3615-425c-be57-a59ed685e1c7" />
<img width="3762" height="2026" alt="image" src="https://github.com/user-attachments/assets/41ad96f2-ca7a-4cb6-aec4-0f94a7f12ab4" />



## How It Works

The protocol follows the standard **stealth address meta-key** scheme, adapted for Stellar:

```
Bob generates a Meta-Key (X25519 keypair)
Bob publishes his Meta-Key Public Key ──────────────────────────────────┐
                                                                        │
Alice uses Bob's Meta-Key Public Key                                    │
Alice generates a random Ephemeral Keypair (one-time use)              │
Alice performs ECDH: SharedSecret = EphemeralPriv × BobMetaPub         │
Alice generates a brand-new random Stellar Keypair (the Stealth Address)│
Alice encrypts the Stealth Seed: EncryptedSeed = Seed XOR SHA256(Secret)│
Alice submits deposit tx → funds land on the Stealth Address on-chain  │
Alice broadcasts: [EphemeralPub, EncryptedSeed] ── via contract event ─┘

Bob scans the blockchain for contract events
Bob tries each event: SharedSecret = BobMetaPriv × EphemeralPub
Bob decrypts: Seed = EncryptedSeed XOR SHA256(Secret)
Bob reconstructs the Stealth Keypair and checks if the address has funds
Bob (via Relayer) signs a Soroban Auth Entry and withdraws the funds
Upon withdrawal, 0.5% fee is deducted and Bob receives PCS token rewards (10x fee)
Bob can later swap PCS rewards for XLM via the constant-product Liquidity Pool AMM
```

**Zero on-chain linkage:** The Stealth Address is a fresh, random Stellar account. Neither Alice's account, Bob's Meta-Key, nor Bob's main wallet address are publicly visible in the same transaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                    │
│                                                         │
│  ┌─────────────────┐        ┌────────────────────────┐  │
│  │   Alice (Send)  │        │    Bob (Scan & Claim)  │  │
│  │                 │        │                        │  │
│  │  1. Enter Bob's │        │  1. Generate Meta-Key  │  │
│  │     Meta-Key    │        │  2. Scan Blockchain    │  │
│  │  2. Set Amount  │        │  3. See matched funds  │  │
│  │  3. Deposit →   │        │  4. Withdraw →         │  │
│  └────────┬────────┘        └──────────┬─────────────┘  │
│           │                            │                 │
│    crypto.ts (ECDH, XOR)      crypto.ts (ECDH, XOR)     │
│    soroban.ts (deposit tx)    soroban.ts (withdraw tx)   │
└───────────┼────────────────────────────┼─────────────────┘
            │                            │
            ▼                            ▼
┌───────────────────────────────────────────────────────────┐
│              Soroban Smart Contracts (Rust)               │
│                                                           │
│  [ Stealth Contract ]                                     │
│  deposit(...) → transfers funds into contract storage    │
│  withdraw(...)                                           │
│    → verifies Ed25519 signature of payload               │
│    → deducts 0.5% fee → sends to relayer                │
│    → sends 99.5% → destination (Bob's main wallet)      │
│    → calls PCS_Token.mint(reward) to destination         │
│                                                           │
│  [ PCS Token Contract ]                                   │
│  Governance and reward token (PrivacyCashStellar)         │
│  Only authorized minters (Stealth Contract) can mint      │
│                                                           │
│  [ Liquidity Pool Contract ]                              │
│  Constant-product AMM (x·y=k) for PCS / XLM swaps         │
│  swap(token_in, amount) → returns token_out             │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│                  Stellar Testnet                          │
│        Soroban RPC: soroban-testnet.stellar.org          │
└───────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Stellar Project/
├── contracts/                    # Rust Soroban smart contract workspace
│   ├── Cargo.toml                # Workspace config (soroban-sdk v25)
│   └── contracts/
│       ├── stealth_contract/     # Main protocol logic
│       ├── pcs_token/            # Reward token logic
│       └── liquidity_pool/       # AMM swap logic
│
└── frontend/                     # Next.js 16 application
    ├── src/
    │   ├── app/
    │   │   └── page.tsx          # Main UI — Alice deposit + Bob scan/withdraw
    │   └── lib/
    │       ├── crypto.ts         # ECDH / stealth address derivation (X25519 + SHA256 + XOR)
    │       └── soroban.ts        # Soroban RPC helpers, deposit/withdraw/scan functions
    ├── deploy_all.mjs             # One-shot contract deployment script
    └── create_relayer.mjs         # Generates and funds a Relayer account via Friendbot
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org) | ≥ 20 | Frontend runtime |
| [Rust](https://rustup.rs) | stable | Contract compilation |
| `wasm32v1-none` target | — | WASM compilation for Soroban |
| [Freighter Wallet](https://freighter.app) | latest | Alice's browser wallet for deposits |

Install the Rust WASM target:
```bash
rustup target add wasm32v1-none
```

---

## Getting Started

### 1. Clone & Install

```bash
git clone <repo-url>
cd "Stellar Project/frontend"
npm install
```

### 2. Run the Frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app connects to the **Stellar Testnet** automatically — no configuration needed.

### 3. Deploy the Contract (optional)

> The contract is **already deployed** on Testnet at the address listed below. Only follow this section if you want to redeploy from scratch.

First, fund a deployer account via Friendbot, then run:

```bash
cd frontend
node deploy_all.mjs
```

Update `CONTRACT_ID`, `PCS_TOKEN_ID`, and `LIQUIDITY_POOL_ID` in `src/lib/soroban.ts` with the output contract addresses.

---

## Cryptographic Protocol

All cryptographic operations run **entirely in the browser** — no secrets ever leave the client.

### Key Generation (Bob)

```typescript
// Uses @noble/curves X25519
const metaKey = generateMetaKey();
// → { privateKeyHex: "...", publicKeyHex: "..." }
```

Bob keeps `privateKeyHex` secret. He shares only `publicKeyHex` (his Meta-Key Public Key).

### Stealth Address Derivation (Alice)

```typescript
const result = deriveStealthAddress(bobPublicKeyHex);
// → { ephemeralPubHex, encryptedSeedHex, stealthAddress }
```

Internally:
1. Generate random ephemeral X25519 keypair.
2. `sharedSecret = ECDH(ephemeralPriv, bobMetaPub)`
3. `key = SHA256(sharedSecret)` — 32 bytes
4. Generate a fresh random Stellar keypair (the stealth address).
5. `encryptedSeed = stellarSeed XOR key` — XOR one-time pad

### Stealth Address Recovery (Bob)

```typescript
const recovered = checkStealthAddress(ephemeralPubHex, encryptedSeedHex, bobPrivateKeyHex);
// → { stealthAddress, stealthSeedSecret, stealthKeypair } | null
```

Internally:
1. `sharedSecret = ECDH(bobMetaPriv, ephemeralPub)` — same result by Diffie-Hellman
2. `key = SHA256(sharedSecret)`
3. `seed = encryptedSeed XOR key` — decrypts the seed
4. Reconstruct the Stellar keypair from the decrypted seed.

---

## Smart Contract

**Contract ID (Testnet):** `CBMB7QOASALQ4VAABYLAN3WP74HG6ZVZWIQGYDDGL2QZN2BNNN4I4JRJ`

**Network:** Stellar Testnet (`https://soroban-testnet.stellar.org`)

### `deposit`

```rust
pub fn deposit(
    env: Env,
    from: Address,          // Alice's wallet — must sign
    stealth_pubkey: BytesN<32>, // Derived by Alice
    ephemeral_key: BytesN<32>,
    encrypted_seed: BytesN<32>,
    token: Address,         // Native XLM token contract
    amount: i128,
) -> bool
```

- Requires `from.require_auth()` — Alice's Freighter wallet signs.
- Transfers `amount` from Alice into the contract's own custody.
- Stores `balance[stealth_pubkey] += amount` in **persistent storage** with a ~30-day TTL extension.
- Emits a `StealthDepositEvent` containing `ephemeral_key`, `encrypted_seed`, and `stealth_pubkey` — the only information Bob needs to scan.

### `withdraw`

```rust
pub fn withdraw(
    env: Env,
    stealth_pubkey: BytesN<32>,
    token: Address,
    destination: Address,   // Bob's main wallet
    relayer: Address,       // Relayer receives 0.5% fee
    signature: BytesN<64>,  // Ed25519 signature over payload
)
```

- Verifies the `signature` using `env.crypto().ed25519_verify()` — **only the stealth keypair** (derived by Bob) can authorize this.
- The signed payload commits to `(contract_address, token, destination, relayer)` preventing replay and malleability.
- Clears `balance[stealth_pubkey]` atomically before transfers (re-entrancy safe).
- Transfers `0.5%` of the balance to the Relayer.
- Transfers the remaining `99.5%` to Bob's destination address.

### Build

```bash
cd contracts
cargo build --target wasm32v1-none --release
```

Output: `contracts/target/wasm32v1-none/release/stealth_contract.wasm`

---

## Relayer

The Relayer is a **funded Stellar account** that acts as the transaction source for all withdrawals, solving the bootstrapping problem: a brand-new stealth address has no XLM to pay transaction fees.

**Relayer Account (Testnet):** `GAUNZRTAMAA2YNHACK7C6YRJ66Q4LU3MO4NLM5IUHEWFJYPFZMQVTHHF`

### How the Relayer Submits Withdrawals

The Relayer acts as the **Stellar transaction source account** (providing sequence number and fee), but it cannot steal or redirect funds. Here's why:

1. The `withdraw` Soroban call accepts an Ed25519 `signature`.
2. The Stealth Keypair signs a payload concatenating the XDR representations of: `[Contract ID, Token, Destination, Relayer]`.
3. If the Relayer modifies any argument (e.g. changes the destination), the signature validation (`ed25519_verify`) fails and the transaction is rejected by the smart contract.
4. The Relayer only signs the outer **transaction envelope** for sequence number / fee purposes — it has zero authority over the Soroban invocation parameters.

```
Bob's Stealth Keypair ─── signs ──→ Payload (Contract + Token + Dest + Relayer)
                                                 │
                                     ✅ Contract verifies this signature
                                                 │
Relayer Keypair ─────── signs ──→  Transaction Envelope (seq number + fee)
                                     ❌ Cannot change Soroban args
```

### Fee

The Relayer earns **0.5%** of each withdrawal, deducted automatically by the smart contract. On a 10 XLM withdrawal: Bob receives **9.95 XLM**, Relayer receives **0.05 XLM**.

> **Production note:** The Relayer secret key is currently hardcoded in `soroban.ts` for demo purposes only. In a production deployment, the Relayer must be a separate, secured backend service that accepts pre-signed Soroban auth entries from clients and submits them — never exposing its own secret key to the browser.

---

## Security Considerations

| Concern | Status | Notes |
|---------|--------|-------|
| On-chain privacy | ✅ | Stealth address has no link to Bob's identity |
| Bob's meta-key privacy | ✅ | Only public key is shared; private key never leaves browser |
| Relayer cannot steal funds | ✅ | Enforced by Soroban auth cryptography at contract level |
| Re-entrancy | ✅ | Balance zeroed before transfers |
| Hardcoded Relayer secret | ⚠️ | Demo only — move to secure backend before mainnet |
| Meta-key reuse | ⚠️ | Reusing the same private meta-key for many transactions is safe cryptographically but increases scanning workload |
| Network privacy | ⚠️ | The Soroban RPC endpoint can observe which accounts scan for events — use a self-hosted RPC node or anonymous proxy for stronger privacy |

---

## Testnet Deployment

| Parameter | Value |
|-----------|-------|
| Network | Stellar Testnet |
| RPC URL | `https://soroban-testnet.stellar.org` |
| Contract ID | `CBMB7QOASALQ4VAABYLAN3WP74HG6ZVZWIQGYDDGL2QZN2BNNN4I4JRJ` |
| Native XLM Token | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Relayer Address | `GAUNZRTAMAA2YNHACK7C6YRJ66Q4LU3MO4NLM5IUHEWFJYPFZMQVTHHF` |

Testnet accounts can be funded for free via [Friendbot](https://friendbot.stellar.org).

---

## Roadmap

- [ ] **Mainnet deployment** — swap constants, use production Relayer backend
- [ ] **Relayer as a service** — secure Express.js API accepting pre-signed Soroban auth entries
- [ ] **Multi-asset support** — accept any Stellar/Soroban token, not just native XLM
- [ ] **Scanning optimization** — cache scanned ledger ranges in `localStorage` to avoid re-scanning
- [ ] **Meta-Key Registry** — optional on-chain or IPFS registry so senders can look up Bob's Meta-Key by his main wallet address
- [ ] **ZK-based amount hiding** — explore Pedersen commitments for hiding deposit amounts on-chain

---

## License

MIT
