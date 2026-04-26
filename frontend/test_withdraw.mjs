/**
 * Quick local test: verifies that the withdraw transaction assembles, signs,
 * and submits without a txMalformed error.
 * 
 * Usage: node test_withdraw.mjs <STEALTH_SECRET> <DESTINATION_PUBKEY>
 * 
 * You can get STEALTH_SECRET from the "Recovered Key (Private)" shown in the UI
 * after scanning. DESTINATION_PUBKEY is Bob's main wallet address.
 */
import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, Operation, authorizeEntry,
} from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CB6JPL4XCB62A7EG6EFH4LC55NKRNA3UYQZBCPFLYG2NYJAX4GLA5V2Z";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

const [, , stealthSecret, destinationPubKey] = process.argv;
if (!stealthSecret || !destinationPubKey) {
  console.error("Usage: node test_withdraw.mjs <STEALTH_SECRET> <DESTINATION_PUBKEY>");
  process.exit(1);
}

async function run() {
  const stealthKp = Keypair.fromSecret(stealthSecret);
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  console.log("Stealth address:", stealthKp.publicKey());
  console.log("Destination:", destinationPubKey);
  console.log("Relayer:", relayerKp.publicKey());

  const contract = new Contract(CONTRACT_ID);
  const args = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(destinationPubKey).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];

  // 1. Build tx (Relayer as source)
  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  const tx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...args))
    .setTimeout(300)
    .build();
  console.log("Built tx.");

  // 2. Simulate
  const simResponse = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResponse)) {
    console.error("Simulation failed:", simResponse.error);
    process.exit(1);
  }
  console.log("Simulation OK.");

  // 3. Assemble
  const assembledTx = rpc.assembleTransaction(tx, simResponse).build();
  const rawInvokeOp = assembledTx.toEnvelope().v1().tx().operations()[0].body().value();
  const authEntriesXdr = rawInvokeOp.auth() ?? [];
  console.log("Auth entries:", authEntriesXdr.length);

  // 4. Sign auth entries with stealth keypair
  const ledger = simResponse.latestLedger;
  const expiration = ledger + 100;
  const signedAuthEntries = await Promise.all(
    authEntriesXdr.map((entry, i) => {
      console.log(`Signing auth entry ${i}...`);
      return authorizeEntry(entry, stealthKp, expiration, networkPassphrase);
    })
  );
  console.log("Auth entries signed.");

  // 5. Rebuild with Operation.invokeHostFunction (SDK factory)
  const rebuiltTx = TransactionBuilder.cloneFrom(assembledTx)
    .clearOperations()
    .addOperation(
      Operation.invokeHostFunction({
        func: rawInvokeOp.hostFunction(),
        auth: signedAuthEntries,
      })
    )
    .build();

  // 6. Sign envelope with relayer
  rebuiltTx.sign(relayerKp);
  console.log("Envelope signed by relayer.");

  // 7. Submit
  console.log("Submitting...");
  const sendResponse = await server.sendTransaction(rebuiltTx);
  console.log("Send status:", sendResponse.status);
  if (sendResponse.status === "ERROR") {
    console.error("ERROR result:", JSON.stringify(sendResponse, null, 2));
    process.exit(1);
  }
  console.log("Hash:", sendResponse.hash);

  // 8. Confirm
  let res = await server.getTransaction(sendResponse.hash);
  while (res.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(r => setTimeout(r, 2000));
    res = await server.getTransaction(sendResponse.hash);
    process.stdout.write(".");
  }
  console.log("\nFinal status:", res.status);
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
    console.error("Transaction FAILED on-chain.");
    process.exit(1);
  }
  console.log("✅ Withdrawal successful! Hash:", sendResponse.hash);
}

run().catch(err => { console.error(err); process.exit(1); });
