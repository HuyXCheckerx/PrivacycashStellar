import { rpc, TransactionBuilder, Networks, Address, nativeToScVal, Contract, Keypair } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; 

async function run() {
  const sender = Keypair.random();
  // Fund the sender so it exists
  await fetch(`https://friendbot.stellar.org?addr=${sender.publicKey()}`);

  const stealth = Keypair.random();
  const contract = new Contract(CONTRACT_ID);
  
  const ephemeral = Buffer.alloc(32, 1);
  const seed = Buffer.alloc(32, 2);

  const args = [
    new Address(sender.publicKey()).toScVal(),
    new Address(stealth.publicKey()).toScVal(),
    nativeToScVal(ephemeral),
    nativeToScVal(seed),
    new Address(NATIVE_TOKEN).toScVal(),
    nativeToScVal(100000000n, { type: "i128" }),
  ];

  const sourceAccount = await server.getAccount(sender.publicKey());
  const tx = new TransactionBuilder(sourceAccount, { fee: "100", networkPassphrase })
    .addOperation(contract.call("deposit", ...args))
    .setTimeout(300)
    .build();

  const simResponse = await server.simulateTransaction(tx);
  console.log("Simulation complete. Assembling...");
  try {
    const assembledTx = rpc.assembleTransaction(tx, networkPassphrase, simResponse).build();
    console.log("Assemble success!");
  } catch (e) {
    console.error("Assemble failed:", e);
    console.log(JSON.stringify(simResponse, null, 2));
  }
}

run().catch(console.error);
