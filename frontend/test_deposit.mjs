import { rpc, TransactionBuilder, Networks, Address, nativeToScVal, xdr, Keypair, Contract } from "@stellar/stellar-sdk";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const networkPassphrase = Networks.TESTNET;
  const CONTRACT_ID = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4";
  const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());

  const stealthKp = Keypair.random();
  const contract = new Contract(CONTRACT_ID);
  
  const depTx = new TransactionBuilder(relayerAccount, {
    fee: "1000",
    networkPassphrase,
  }).addOperation(contract.call("deposit", 
    new Address(relayerKp.publicKey()).toScVal(),
    new Address(stealthKp.publicKey()).toScVal(),
    xdr.ScVal.scvBytes(Buffer.alloc(32, 1)),
    xdr.ScVal.scvBytes(Buffer.alloc(32, 2)),
    new Address(NATIVE_TOKEN).toScVal(),
    nativeToScVal(10000000n, {type: "i128"})
  )).setTimeout(300).build();
  
  const depSim = await server.simulateTransaction(depTx);
  console.log("RESULTS:", depSim.results);
  console.log("RESULT:", depSim.result);
  let depAss;
  try {
    depAss = rpc.assembleTransaction(depTx, depSim).build();
  } catch (e) {
    console.log("ASSEMBLE ERROR:", e.message);
    return;
  }
  depAss.sign(relayerKp);
  const sendRes = await server.sendTransaction(depAss);
  console.log("Deposit hash:", sendRes.hash);
  
  let getTx;
  while(true) {
    getTx = await server.getTransaction(sendRes.hash);
    if(getTx.status !== "NOT_FOUND") break;
    await new Promise(r=>setTimeout(r,1000));
  }
  console.log("Tx Status:", getTx.status);
  if(getTx.resultMetaXdr) {
     console.log("Result Meta exists. Did it fail inside Soroban?");
     // We can parse the meta to see if there's a soroban error
     const meta = getTx.resultMetaXdr;
     const resultMeta = xdr.TransactionMeta.fromXDR(meta, "base64");
     console.log(JSON.stringify(resultMeta, null, 2).substring(0, 500));
  }
}
run().catch(console.error);
