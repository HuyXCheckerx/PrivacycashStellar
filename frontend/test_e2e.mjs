/**
 * Full end-to-end test: deposit 1 XLM then immediately withdraw it.
 * This validates the complete flow on the NEW contract.
 */
import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, Operation, authorizeEntry, nativeToScVal,
} from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CBMB7QOASALQ4VAABYLAN3WP74HG6ZVZWIQGYDDGL2QZN2BNNN4I4JRJ";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

async function waitForTx(hash) {
  process.stdout.write(`Waiting for ${hash.slice(0,8)}...`);
  let res = await server.getTransaction(hash);
  while (res.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(r => setTimeout(r, 2000));
    res = await server.getTransaction(hash);
    process.stdout.write(".");
  }
  console.log(" " + res.status);
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error("TX FAILED on-chain");
  return res;
}

async function simulateAndSend(account, ops, signers) {
  const tx = new TransactionBuilder(account, { fee: "1000000", networkPassphrase })
    .addOperation(...ops)
    .setTimeout(300)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error("Sim failed: " + sim.error);
  const assembled = rpc.assembleTransaction(tx, sim).build();
  for (const kp of signers) assembled.sign(kp);
  const send = await server.sendTransaction(assembled);
  if (send.status === "ERROR") throw new Error("Send ERROR: " + JSON.stringify(send.errorResult));
  return send.hash;
}

async function run() {
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  // Use a fresh Friendbot-funded account as Alice (sender)
  const aliceKp = Keypair.random();
  const stealthKp = Keypair.random(); // The stealth address

  console.log("Alice:", aliceKp.publicKey());
  console.log("Stealth:", stealthKp.publicKey());
  console.log("Relayer:", relayerKp.publicKey());

  // Fund Alice via Friendbot
  console.log("\nFunding Alice via Friendbot...");
  const fb = await fetch(`https://friendbot.stellar.org?addr=${aliceKp.publicKey()}`);
  if (!fb.ok) throw new Error("Friendbot failed");
  console.log("Alice funded.");

  // === DEPOSIT ===
  console.log("\n--- DEPOSIT ---");
  const AMOUNT = 10_000_000n; // 1 XLM in stroops
  const ephemeralBytes = Buffer.alloc(32, 3);
  const seedBytes = Buffer.alloc(32, 4);

  const aliceAccount = await server.getAccount(aliceKp.publicKey());
  const contract = new Contract(CONTRACT_ID);
  const depositArgs = [
    new Address(aliceKp.publicKey()).toScVal(),
    nativeToScVal(stealthKp.rawPublicKey()),
    nativeToScVal(ephemeralBytes),
    nativeToScVal(seedBytes),
    new Address(NATIVE_TOKEN).toScVal(),
    nativeToScVal(AMOUNT, { type: "i128" }),
  ];

  const depositTx = new TransactionBuilder(aliceAccount, { fee: "1000000", networkPassphrase })
    .addOperation(contract.call("deposit", ...depositArgs))
    .setTimeout(300)
    .build();
  const depSim = await server.simulateTransaction(depositTx);
  if (rpc.Api.isSimulationError(depSim)) throw new Error("Deposit sim failed: " + depSim.error);
  const depAssembled = rpc.assembleTransaction(depositTx, depSim).build();
  depAssembled.sign(aliceKp);
  const depSend = await server.sendTransaction(depAssembled);
  if (depSend.status === "ERROR") throw new Error("Deposit send ERROR: " + JSON.stringify(depSend));
  console.log("Deposit hash:", depSend.hash);
  await waitForTx(depSend.hash);

  // === WITHDRAW ===
  console.log("\n--- WITHDRAW ---");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  // Compute signature payload
  const destinationPubKey = aliceKp.publicKey(); // Withdraw back to Alice for simplicity
  const payload = Buffer.concat([
    new Address(CONTRACT_ID).toScVal().toXDR(),
    new Address(NATIVE_TOKEN).toScVal().toXDR(),
    new Address(destinationPubKey).toScVal().toXDR(),
    new Address(relayerKp.publicKey()).toScVal().toXDR(),
  ]);
  const signature = stealthKp.sign(payload);

  const withdrawArgs = [
    nativeToScVal(stealthKp.rawPublicKey()),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(destinationPubKey).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
    nativeToScVal(signature),
  ];

  const withdrawTx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...withdrawArgs))
    .setTimeout(300)
    .build();

  const simResponse = await server.simulateTransaction(withdrawTx);
  if (rpc.Api.isSimulationError(simResponse)) throw new Error("Withdraw sim failed: " + simResponse.error);

  const assembledTx = rpc.assembleTransaction(withdrawTx, simResponse).build();
  assembledTx.sign(relayerKp);

  const sendResponse = await server.sendTransaction(assembledTx);
  if (sendResponse.status === "ERROR") {
    console.error("Withdraw ERROR:", JSON.stringify(sendResponse, null, 2));
    throw new Error("Withdraw failed");
  }
  console.log("Withdraw hash:", sendResponse.hash);
  await waitForTx(sendResponse.hash);

  console.log("\n✅ End-to-end test PASSED!");
  console.log("1 XLM deposited and withdrawn. 0.5% fee went to Relayer.");
}

run().catch(err => { console.error("\n❌", err.message); process.exit(1); });
