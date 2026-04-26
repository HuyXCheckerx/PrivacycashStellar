import { rpc, Contract, Address, Networks, TransactionBuilder, Keypair, xdr } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const CONTRACT_ID = "CBMB7QOASALQ4VAABYLAN3WP74HG6ZVZWIQGYDDGL2QZN2BNNN4I4JRJ";
const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

async function run() {
  const kp = Keypair.random();
  await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  const acc = await server.getAccount(kp.publicKey());
  
  const dest = Keypair.random().publicKey();
  const relayer = Keypair.random().publicKey();
  
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(acc, { fee: "1000", networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call("test_payload", 
      new Address(NATIVE_TOKEN).toScVal(),
      new Address(dest).toScVal(),
      new Address(relayer).toScVal()
    ))
    .setTimeout(300).build();
    
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    console.error("error:", sim.error);
    return;
  }
  
  const ret = sim.result.retval;
  const bytes = ret.bytes();
  console.log("Soroban Payload:", bytes.toString("hex"));
  
  const jsPayload1 = Buffer.concat([
    new Address(CONTRACT_ID).toScAddress().toXDR(),
    new Address(NATIVE_TOKEN).toScAddress().toXDR(),
    new Address(dest).toScAddress().toXDR(),
    new Address(relayer).toScAddress().toXDR(),
  ]);
  
  const jsPayload2 = Buffer.concat([
    new Address(CONTRACT_ID).toScVal().toXDR(),
    new Address(NATIVE_TOKEN).toScVal().toXDR(),
    new Address(dest).toScVal().toXDR(),
    new Address(relayer).toScVal().toXDR(),
  ]);
  
  console.log("JS ScAddress XDR:", jsPayload1.toString("hex"));
  console.log("JS ScVal XDR:    ", jsPayload2.toString("hex"));
  
  if (bytes.toString("hex") === jsPayload1.toString("hex")) console.log("Matches ScAddress!");
  else if (bytes.toString("hex") === jsPayload2.toString("hex")) console.log("Matches ScVal!");
  else console.log("NO MATCH");
}

run().catch(console.error);
