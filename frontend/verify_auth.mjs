/**
 * Verify: are signed auth entries actually in the submitted tx XDR?
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

async function run() {
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  const stealthKp = Keypair.random();
  const aliceKp = Keypair.random();
  console.log("Stealth:", stealthKp.publicKey());

  // Fund + deposit
  await fetch(`https://friendbot.stellar.org?addr=${aliceKp.publicKey()}`);
  const aliceAcc = await server.getAccount(aliceKp.publicKey());
  const contract = new Contract(CONTRACT_ID);
  const depTx = new TransactionBuilder(aliceAcc, { fee: "1000000", networkPassphrase })
    .addOperation(contract.call("deposit",
      new Address(aliceKp.publicKey()).toScVal(),
      new Address(stealthKp.publicKey()).toScVal(),
      nativeToScVal(Buffer.alloc(32, 1)), nativeToScVal(Buffer.alloc(32, 2)),
      new Address(NATIVE_TOKEN).toScVal(),
      nativeToScVal(10_000_000n, { type: "i128" }),
    )).setTimeout(300).build();
  const depSim = await server.simulateTransaction(depTx);
  const depA = rpc.assembleTransaction(depTx, depSim).build();
  depA.sign(aliceKp);
  const dh = await server.sendTransaction(depA);
  let dep = await server.getTransaction(dh.hash);
  while (dep.status === "NOT_FOUND") { await new Promise(r => setTimeout(r, 2000)); dep = await server.getTransaction(dh.hash); }
  console.log("Deposit:", dep.status);

  // Simulate withdraw
  const withdrawArgs = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(aliceKp.publicKey()).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];
  const relAcc = await server.getAccount(relayerKp.publicKey());
  const wTx = new TransactionBuilder(relAcc, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...withdrawArgs))
    .setTimeout(300).build();
  const sim = await server.simulateTransaction(wTx);
  console.log("Sim success:", rpc.Api.isSimulationSuccess(sim));

  // Sign auth
  const ledger = sim.latestLedger;
  const expiration = ledger + 100;
  const rawAuth = sim.result.auth;
  console.log("Raw auth entries:", rawAuth.length);
  const signedAuth = await Promise.all(rawAuth.map((e, i) => {
    console.log(`Signing entry ${i}...`);
    return authorizeEntry(e, stealthKp, expiration, networkPassphrase);
  }));

  // Check signature is populated
  const cred = signedAuth[0].credentials().address();
  const sigScVal = cred.signature();
  console.log("Signature type:", sigScVal.switch().name);
  const sigVec = sigScVal.vec();
  console.log("Sig vec length:", sigVec.length);
  const sigMap = sigVec[0].map();
  console.log("Sig map entries:", sigMap.length);
  const pkEntry = sigMap.find(e => e.key().sym().toString() === "public_key");
  const sigEntry = sigMap.find(e => e.key().sym().toString() === "signature");
  const pkBytes = pkEntry.val().bytes();
  const sigBytes = sigEntry.val().bytes();
  console.log("public_key bytes:", Buffer.from(pkBytes).toString("hex").slice(0,16)+"...");
  console.log("signature bytes:", Buffer.from(sigBytes).toString("hex").slice(0,16)+"...");
  const expectedPk = stealthKp.rawPublicKey();
  console.log("Matches stealthKp.rawPublicKey():", Buffer.from(pkBytes).equals(Buffer.from(expectedPk)));

  // Build final tx using assembleTransaction (inject signed auth first)
  sim.result.auth = signedAuth;
  const finalTx = rpc.assembleTransaction(wTx, sim).build();
  finalTx.sign(relayerKp);

  // Verify auth in final tx XDR
  const opInFinal = finalTx.toEnvelope().v1().tx().operations()[0].body().value();
  const authInFinal = opInFinal.auth();
  console.log("\nAuth entries in final tx:", authInFinal.length);
  if (authInFinal.length > 0) {
    const credFinal = authInFinal[0].credentials().address();
    const sigFinal = credFinal.signature();
    console.log("Final tx sig type:", sigFinal.switch().name);
    const vecFinal = sigFinal.vec();
    console.log("Final tx sig vec length:", vecFinal?.length);
    const expLedger = credFinal.signatureExpirationLedger();
    console.log("ExpirationLedger in final tx:", expLedger, "== expiration:", expiration, "match:", expLedger === expiration);
  }

  // Submit and wait
  console.log("\nSubmitting...");
  const send = await server.sendTransaction(finalTx);
  console.log("Send status:", send.status, send.hash);
  if (send.status === "ERROR") { console.error("ERROR:", JSON.stringify(send.errorResult, null, 2)); return; }
  let res = await server.getTransaction(send.hash);
  while (res.status === "NOT_FOUND") { await new Promise(r => setTimeout(r, 2000)); res = await server.getTransaction(send.hash); }
  console.log("Result:", res.status);
  if (res.status === "SUCCESS") console.log("✅ PASSED!");
  else console.log("❌ FAILED");
}
run().catch(console.error);
