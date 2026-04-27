import {
  rpc,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  xdr,
  Keypair,
  Contract,
  FeeBumpTransaction,
  Operation,
  StrKey,
} from "@stellar/stellar-sdk";

import { signTransaction, getNetworkDetails } from "@stellar/freighter-api";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;

export const CONTRACT_ID = "CDIFXPBD3MP52HLHBH4X3IW7427HF32ORWVF3QI4NERQEHIMZUFBS6AM";
export const PCS_TOKEN_ID = "CDNHCVOVEPYXWNLAGVYQN3EXANYBLN2NSMDSDSK553XB6NCDHAZA7E3Y";
export const LIQUIDITY_POOL_ID = "CAEWUFLAMV4YZZ7Z2PCQU2CB4IEBGHQ43HPGYSIKSWWWD2EL7PHTZOZZ";
export const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // Testnet XLM

// HARDCODED RELAYER ACCOUNT (ONLY FOR DEMO)
// In production, this would be a secure backend service wrapping transactions.
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

/**
 * Alice deposits funds to the Stealth Address via the smart contract.
 */
export async function submitDepositTx(
  senderPubKey: string,
  stealthAddress: string,
  ephemeralPubHex: string,
  encryptedSeedHex: string,
  amountXLM: string
) {
  // 1. Prepare Arguments
  const contract = new Contract(CONTRACT_ID);
  const amountStroops = BigInt(Math.floor(parseFloat(amountXLM) * 10000000));
  
  const args = [
    new Address(senderPubKey).toScVal(),
    nativeToScVal(StrKey.decodeEd25519PublicKey(stealthAddress)),
    xdr.ScVal.scvBytes(Buffer.from(ephemeralPubHex, "hex")),
    xdr.ScVal.scvBytes(Buffer.from(encryptedSeedHex, "hex")),
    new Address(NATIVE_TOKEN).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  // 2. Fetch Source Account
  const sourceAccount = await server.getAccount(senderPubKey);

  // 3. Build Transaction
  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100", 
    networkPassphrase,
  })
    .addOperation(contract.call("deposit", ...args))
    .setTimeout(300)
    .build();

  // 4. Simulate Transaction (Soroban requirement)
  const simResponse = await server.simulateTransaction(tx);
  console.log("simResponse", simResponse);
  
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Simulation Error: ${simResponse.error}`);
  }

  if (rpc.Api.isSimulationRestore(simResponse)) {
    throw new Error(`Simulation indicates state needs restoring. Please try again or fund the account.`);
  }

  if (!rpc.Api.isSimulationSuccess(simResponse)) {
    // If it's neither an error, restore, nor success, something is very weird.
    throw new Error(`Simulation failed (Unknown). Keys: ${Object.keys(simResponse).join(', ')}`);
  }

  // PATCH FOR STELLAR-SDK BUG: 
  if (!(simResponse as any).result) {
    (simResponse as any).result = { auth: [] };
  }

  // Double check our patch!
  if (!(simResponse as any).result) {
    throw new Error("Patch failed to apply to simResponse!");
  }
  if (!(simResponse as any).result.auth) {
    throw new Error("Patch applied but auth is missing!");
  }

  // 5. Assemble Transaction with exact gas/auths
  let assembledTx;
  try {
    assembledTx = rpc.assembleTransaction(tx, simResponse).build();
  } catch (e: any) {
    console.error("assembleTransaction failed:", e);
    throw new Error(`assembleTransaction failed. | error: ${e.message} | patch applied: ${!!(simResponse as any).result} | stack: ${e.stack}`);
  }

  // 6. Sign via Freighter
  let signedTxResponse;
  try {
    signedTxResponse = await signTransaction(assembledTx.toXDR(), { networkPassphrase });
  } catch (e: any) {
    console.error("Freighter sign failed:", e);
    throw new Error(`Freighter sign failed: ${e.message}`);
  }
  
  // Handle different Freighter API return formats
  const signedXdr = typeof signedTxResponse === 'string' 
    ? signedTxResponse 
    : (signedTxResponse as any).signedTxXdr || (signedTxResponse as any).tx || signedTxResponse;

  // Reconstruct the Transaction object using the SDK
  const finalTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as any;

  // 7. Submit to Soroban
  const sendResponse = await server.sendTransaction(finalTx);
  
  if (sendResponse.status === "ERROR") {
    throw new Error(`Submit failed: ${(sendResponse as any).errorResultXdr}`);
  }

  // Wait for confirmation
  let getTxResponse = await server.getTransaction(sendResponse.hash);
  while (getTxResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getTxResponse = await server.getTransaction(sendResponse.hash);
  }

  if (getTxResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error("Transaction failed on-chain.");
  }

  return sendResponse.hash;
}

/**
 * Bob withdraws funds. 
 * The Stealth Address signs the inner transaction.
 * The Relayer pays the gas fee via FeeBump!
 */
export async function submitWithdrawTx(
  stealthSecret: string,
  destinationPubKey: string
) {
  const stealthKp = Keypair.fromSecret(stealthSecret);
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);

  const contract = new Contract(CONTRACT_ID);
  
  // Compute the payload for the Ed25519 signature
  const payload = Buffer.concat([
    new Address(CONTRACT_ID).toScVal().toXDR(),
    new Address(NATIVE_TOKEN).toScVal().toXDR(),
    new Address(destinationPubKey).toScVal().toXDR(),
    new Address(relayerKp.publicKey()).toScVal().toXDR(),
  ]);
  const signature = stealthKp.sign(payload);

  const args = [
    nativeToScVal(stealthKp.rawPublicKey()),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(destinationPubKey).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(), // Relayer receives 0.5% fee
    nativeToScVal(signature),
  ];

  // 1. Fetch Relayer Account
  const relayerAccount = await server.getAccount(relayerKp.publicKey());

  // 2. Build Transaction (Relayer is the source)
  const tx = new TransactionBuilder(relayerAccount, {
    fee: "1000",
    networkPassphrase,
  })
    .addOperation(contract.call("withdraw", ...args))
    .setTimeout(300)
    .build();

  // 3. Simulate Transaction
  const simResponse = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Simulation failed: ${simResponse.error}`);
  }

  // 4. Assemble Transaction (adds resource fees + footprint)
  const assembledTx = rpc.assembleTransaction(tx, simResponse).build();

  // 5. Sign the transaction envelope with the Relayer keypair (source account)
  assembledTx.sign(relayerKp);

  // 6. Submit
  const sendResponse = await server.sendTransaction(assembledTx);
  if (sendResponse.status === "ERROR") {
    console.error("Submit ERROR:", sendResponse);
    throw new Error(`Submit failed: ${JSON.stringify(sendResponse)}`);
  }

  // Wait for confirmation
  let getTxResponse = await server.getTransaction(sendResponse.hash);
  while (getTxResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getTxResponse = await server.getTransaction(sendResponse.hash);
  }

  if (getTxResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
    const meta = (getTxResponse as any).resultMetaXdr;
    console.error("On-chain FAILED meta:", meta);
    throw new Error("Transaction failed on-chain.");
  }

  return sendResponse.hash;
}

export async function scanBlockchainForStealthEvents() {
  const latestLedgerResponse = await server.getLatestLedger();
  const latestLedger = latestLedgerResponse.sequence;
  const startLedger = Math.max(latestLedger - 10000, 0); // Scan last ~10000 ledgers

  const res = await fetch("https://soroban-testnet.stellar.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params: {
        startLedger: startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID]
          }
        ]
      }
    })
  });
  
  const json = await res.json();
  const foundEvents: any[] = [];

  if (json.result && json.result.events) {
    for (let event of json.result.events) {
      if (event.type !== "contract") continue;
      
      try {
        const parsedTopic = xdr.ScVal.fromXDR(event.topic[0], "base64");
        if (parsedTopic.sym().toString() === "stealth") {
          const val = xdr.ScVal.fromXDR(event.value, "base64");
          const map = val.map();
          
          if (!map) continue;

          let stealthAddress, ephemeralPubHex, encryptedSeedHex;
          
          for (let entry of map) {
            const key = entry.key().sym().toString();
            if (key === "stealth_pubkey") {
              stealthAddress = StrKey.encodeEd25519PublicKey(entry.val().bytes());
            }
            if (key === "ephemeral_key") {
              ephemeralPubHex = entry.val().bytes().toString("hex");
            }
            if (key === "encrypted_seed") {
              encryptedSeedHex = entry.val().bytes().toString("hex");
            }
          }
          
          if (stealthAddress && ephemeralPubHex && encryptedSeedHex) {
            foundEvents.push({ stealthAddress, ephemeralPubHex, encryptedSeedHex });
          }
        }
      } catch (e) {
        console.warn("Failed to parse an event", e);
      }
    }
  }
  
  return foundEvents;
}
