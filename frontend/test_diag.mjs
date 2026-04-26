/**
 * Diagnose the withdraw operation: check what hostFunction() returns,
 * and whether Operation.invokeHostFunction accepts it.
 */
import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, Operation, authorizeEntry, Keypair as KP,
} from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CB6JPL4XCB62A7EG6EFH4LC55NKRNA3UYQZBCPFLYG2NYJAX4GLA5V2Z";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

async function run() {
  // Use a dummy stealth keypair just to build and simulate
  const stealthKp = Keypair.random();
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  const destinationPubKey = relayerKp.publicKey(); // doesn't matter for this test

  console.log("Stealth address:", stealthKp.publicKey());

  const contract = new Contract(CONTRACT_ID);
  const args = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(destinationPubKey).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];

  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  const tx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...args))
    .setTimeout(300)
    .build();

  const simResponse = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResponse)) {
    console.error("Simulation error:", simResponse.error);
    // This is expected since stealth has no balance, but we can still inspect the op
  }

  // Assemble regardless
  try {
    const assembledTx = rpc.assembleTransaction(tx, simResponse).build();
    const rawInvokeOp = assembledTx.toEnvelope().v1().tx().operations()[0].body().value();
    const hf = rawInvokeOp.hostFunction();
    console.log("hostFunction type:", typeof hf, hf?.constructor?.name);
    console.log("hostFunction switch:", hf?.switch?.()?.name);
    console.log("Auth entries:", rawInvokeOp.auth()?.length);

    // Try Operation.invokeHostFunction
    const rebuiltOp = Operation.invokeHostFunction({
      func: hf,
      auth: [],
    });
    console.log("Operation.invokeHostFunction succeeded:", typeof rebuiltOp);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run().catch(console.error);
