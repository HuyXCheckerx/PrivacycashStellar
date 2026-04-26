import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, authorizeEntry, nativeToScVal, StrKey, xdr,
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

  // Fund Alice
  await fetch(`https://friendbot.stellar.org?addr=${aliceKp.publicKey()}`);
  console.log("Alice funded.");

  // Deposit
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
    ))
    .setTimeout(300).build();

  const depSim = await server.simulateTransaction(depositTx);
  const depAssembled = rpc.assembleTransaction(depositTx, depSim).build();
  depAssembled.sign(aliceKp);
  const depSend = await server.sendTransaction(depAssembled);
  let dep = await server.getTransaction(depSend.hash);
  while (dep.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(r => setTimeout(r, 2000));
    dep = await server.getTransaction(depSend.hash);
  }
  console.log("Deposit:", dep.status);

  // Now simulate withdraw and dump the auth entry
  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  const withdrawArgs = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(aliceKp.publicKey()).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];

  const withdrawTx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...withdrawArgs))
    .setTimeout(300).build();

  const sim = await server.simulateTransaction(withdrawTx);
  console.log("Sim success?", rpc.Api.isSimulationSuccess(sim));
  console.log("Sim error?", rpc.Api.isSimulationError(sim));

  const simResult = sim.result;
  console.log("simResult:", JSON.stringify(simResult ? { authLen: simResult.auth?.length } : null));

  if (!simResult?.auth?.length) {
    console.error("NO AUTH ENTRIES in sim result! Keys:", Object.keys(sim));
    return;
  }

  const entry = simResult.auth[0];
  const creds = entry.credentials();
  console.log("Credential switch:", creds.switch().name);

  if (creds.switch().name === "sorobanCredentialsAddress") {
    const addrCreds = creds.address();
    const addr = addrCreds.address();
    console.log("Address type:", addr.switch().name);
    if (addr.switch().name === "scAddressTypeAccount") {
      const pk = StrKey.encodeEd25519PublicKey(addr.accountId().ed25519());
      console.log("Auth address:", pk);
      console.log("Matches stealth:", pk === stealthKp.publicKey());
    }
    console.log("Nonce:", addrCreds.nonce().toString());
    console.log("ExpirationLedger (before sign):", addrCreds.signatureExpirationLedger());
  }

  // Sign
  const ledger = sim.latestLedger;
  const expiration = ledger + 100;
  console.log("Signing with expiration:", expiration);
  const signedEntry = await authorizeEntry(entry, stealthKp, expiration, networkPassphrase);
  const signedCreds = signedEntry.credentials();
  if (signedCreds.switch().name === "sorobanCredentialsAddress") {
    console.log("After sign - ExpirationLedger:", signedCreds.address().signatureExpirationLedger());
    const sig = signedCreds.address().signature();
    console.log("Signature ScVal type:", sig.switch().name);
  }

  // Inject and assemble
  simResult.auth = [signedEntry];
  const assembled = rpc.assembleTransaction(withdrawTx, sim).build();
  assembled.sign(relayerKp);

  console.log("Submitting...");
  const send = await server.sendTransaction(assembled);
  console.log("Send status:", send.status);
  if (send.status === "ERROR") {
    console.error("ERROR:", JSON.stringify(send.errorResult ?? send, null, 2));
    return;
  }

  let res = await server.getTransaction(send.hash);
  while (res.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(r => setTimeout(r, 2000));
    res = await server.getTransaction(send.hash);
  }
  console.log("Final:", res.status);
  if (res.status === "SUCCESS") console.log("✅ PASSED");
}

run().catch(console.error);
