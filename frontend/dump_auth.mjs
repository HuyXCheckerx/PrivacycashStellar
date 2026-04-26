/**
 * Dump the rootInvocation from the auth entry and compare
 * it to what we submit — find the exact mismatch.
 */
import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, authorizeEntry, nativeToScVal, StrKey, xdr, Operation,
} from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CB6JPL4XCB62A7EG6EFH4LC55NKRNA3UYQZBCPFLYG2NYJAX4GLA5V2Z";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

function decodeScVal(v) {
  const sw = v.switch().name;
  if (sw === "scvAddress") {
    const a = v.address();
    if (a.switch().name === "scAddressTypeAccount") {
      return "account:" + StrKey.encodeEd25519PublicKey(a.accountId().ed25519());
    }
    return "contract:" + StrKey.encodeContract(a.contractId());
  }
  if (sw === "scvI128") return "i128:" + v.i128().lo().toString();
  if (sw === "scvSymbol") return "sym:" + v.sym().toString();
  if (sw === "scvBytes") return "bytes:" + Buffer.from(v.bytes()).toString("hex").slice(0, 8) + "...";
  return sw;
}

function dumpInvocation(inv, indent = 0) {
  const pad = "  ".repeat(indent);
  const cid = StrKey.encodeContract(inv.function().contractFn().contractAddress().contractId());
  const fn = inv.function().contractFn().functionName().toString();
  const args = inv.function().contractFn().args().map(decodeScVal);
  console.log(`${pad}${cid.slice(0, 8)}... :: ${fn}(${args.join(", ")})`);
  for (const sub of (inv.subInvocations ? inv.subInvocations() : [])) {
    dumpInvocation(sub.subInvocation ? sub.subInvocation() : sub, indent + 1);
  }
}

async function run() {
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  const stealthKp = Keypair.random();
  const aliceKp = Keypair.random();

  console.log("Stealth:", stealthKp.publicKey());

  // Fund Alice and deposit
  await fetch(`https://friendbot.stellar.org?addr=${aliceKp.publicKey()}`);
  const aliceAccount = await server.getAccount(aliceKp.publicKey());
  const contract = new Contract(CONTRACT_ID);
  const depositTx = new TransactionBuilder(aliceAccount, { fee: "1000000", networkPassphrase })
    .addOperation(contract.call("deposit",
      new Address(aliceKp.publicKey()).toScVal(),
      new Address(stealthKp.publicKey()).toScVal(),
      nativeToScVal(Buffer.alloc(32, 1)),
      nativeToScVal(Buffer.alloc(32, 2)),
      new Address(NATIVE_TOKEN).toScVal(),
      nativeToScVal(10_000_000n, { type: "i128" }),
    )).setTimeout(300).build();
  const depSim = await server.simulateTransaction(depositTx);
  const depAssembled = rpc.assembleTransaction(depositTx, depSim).build();
  depAssembled.sign(aliceKp);
  const depSend = await server.sendTransaction(depAssembled);
  let dep = await server.getTransaction(depSend.hash);
  while (dep.status === "NOT_FOUND") { await new Promise(r => setTimeout(r, 2000)); dep = await server.getTransaction(depSend.hash); }
  console.log("Deposit:", dep.status, "\n");

  const withdrawArgs = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(aliceKp.publicKey()).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];

  // Simulate
  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  const withdrawTx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...withdrawArgs))
    .setTimeout(300).build();
  const sim = await server.simulateTransaction(withdrawTx);
  console.log("Sim success:", rpc.Api.isSimulationSuccess(sim));

  const entry = sim.result.auth[0];
  console.log("\n=== rootInvocation from sim auth entry ===");
  dumpInvocation(entry.rootInvocation());

  // Also show raw XDR of rootInvocation args
  const simArgs = entry.rootInvocation().function().contractFn().args();
  console.log("\nSim rootInvocation arg XDRs:");
  simArgs.forEach((a, i) => console.log(` arg[${i}]:`, Buffer.from(xdr.ScVal.toXDR(a)).toString("hex")));

  // Now show the args we're passing in the final tx
  console.log("\nOur withdrawArgs XDRs:");
  withdrawArgs.forEach((a, i) => console.log(` arg[${i}]:`, Buffer.from(xdr.ScVal.toXDR(a)).toString("hex")));

  // Check if they match
  const allMatch = withdrawArgs.every((a, i) =>
    Buffer.from(xdr.ScVal.toXDR(a)).equals(Buffer.from(xdr.ScVal.toXDR(simArgs[i])))
  );
  console.log("\nArgs match:", allMatch);
}

run().catch(console.error);
