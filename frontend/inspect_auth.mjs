/**
 * Inspect the auth entries that come back from simulation.
 * This will tell us exactly what type of auth Soroban is requesting.
 */
import {
  rpc, TransactionBuilder, Networks, Address, Keypair,
  Contract, authorizeEntry, nativeToScVal, StrKey,
} from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CB6JPL4XCB62A7EG6EFH4LC55NKRNA3UYQZBCPFLYG2NYJAX4GLA5V2Z";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const RELAYER_SECRET = "SDH4YXRC3MM5FVE7VKACX7HNAPOGCAVAPRWCG43KO7X4W3U55MI6UFMR";

async function run() {
  const relayerKp = Keypair.fromSecret(RELAYER_SECRET);
  const stealthKp = Keypair.random();

  console.log("Stealth:", stealthKp.publicKey());

  const contract = new Contract(CONTRACT_ID);
  const args = [
    new Address(stealthKp.publicKey()).toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
    new Address(relayerKp.publicKey()).toScVal(),
  ];

  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  const tx = new TransactionBuilder(relayerAccount, { fee: "1000", networkPassphrase })
    .addOperation(contract.call("withdraw", ...args))
    .setTimeout(300)
    .build();

  const simResponse = await server.simulateTransaction(tx);
  
  // Don't fail on sim error — we just want to inspect the auth structure
  // (sim will fail because stealth has no balance, but auth structure is still populated)
  
  // Look at raw sim auth
  if (simResponse.result && simResponse.result.auth) {
    console.log("\n=== Sim result auth entries:", simResponse.result.auth.length);
    for (let i = 0; i < simResponse.result.auth.length; i++) {
      const entry = simResponse.result.auth[i];
      console.log(`\nEntry ${i}:`);
      const creds = entry.credentials();
      const credType = creds.switch().name;
      console.log("  credential type:", credType);
      if (credType === "sorobanCredentialsAddress") {
        const addrCreds = creds.address();
        const addr = addrCreds.address();
        const addrType = addr.switch().name;
        console.log("  address type:", addrType);
        if (addrType === "scAddressTypeAccount") {
          const pubKeyBytes = addr.accountId().ed25519();
          const pubKeyStr = StrKey.encodeEd25519PublicKey(pubKeyBytes);
          console.log("  account pubkey:", pubKeyStr);
          console.log("  matches stealth?", pubKeyStr === stealthKp.publicKey());
        }
        console.log("  nonce:", addrCreds.nonce().toString());
        console.log("  signatureExpirationLedger:", addrCreds.signatureExpirationLedger());
      } else if (credType === "sorobanCredentialsSourceAccount") {
        console.log("  -> Source account auth (no extra signing needed)");
      }
    }
  } else {
    console.log("No result.auth in simulation response");
    console.log("Sim keys:", Object.keys(simResponse));
  }
}

run().catch(console.error);
