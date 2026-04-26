import { rpc, TransactionBuilder, Networks, Address, nativeToScVal, Contract, xdr, Keypair } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;
const CONTRACT_ID = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; 

async function run() {
  const sender = Keypair.random();
  await fetch(`https://friendbot.stellar.org?addr=${sender.publicKey()}`);
  const senderPubKey = sender.publicKey();
  const stealthAddress = Keypair.random().publicKey();
  const ephemeralPubHex = "facc2d2a71e4ef44364bb1b1f6ac23a8a5756807211a0c0c008c4b263a557077c";
  const encryptedSeedHex = "64cd71cf8573552ddb9752a5c3a57f55731053ceabdb6a82d2cbb1517d12f36f";
  const amountStroops = 100000000n; // 10 XLM

  const contract = new Contract(CONTRACT_ID);

  const args = [
    new Address(senderPubKey).toScVal(),
    new Address(stealthAddress).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(ephemeralPubHex, "hex")),
    xdr.ScVal.scvBytes(Buffer.from(encryptedSeedHex, "hex")),
    new Address(NATIVE_TOKEN).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  try {
    const sourceAccount = await server.getAccount(senderPubKey);
    const tx = new TransactionBuilder(sourceAccount, { fee: "100", networkPassphrase })
      .addOperation(contract.call("deposit", ...args))
      .setTimeout(300)
      .build();

    console.log("Simulating transaction...");
    const simResponse = await server.simulateTransaction(tx);
    console.log("RAW SIM RESPONSE:");
    console.log("isSimulationSuccess?", rpc.Api.isSimulationSuccess(simResponse));
    console.log("isSimulationError?", rpc.Api.isSimulationError(simResponse));
    
    // PATCH
    if (!simResponse.result) {
      simResponse.result = { auth: [] };
    }
    console.log("simResponse.result:", simResponse.result);
    console.log("simResponse.result.auth:", simResponse.result.auth);
    
    try {
      const assembled = rpc.assembleTransaction(tx, simResponse).build();
      console.log("Assemble success!");
    } catch (e) {
      console.error("Assemble failed:", e);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
