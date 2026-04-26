import { rpc, TransactionBuilder, Networks, Keypair, Contract, xdr, Asset, Operation, Address } from "@stellar/stellar-sdk";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const networkPassphrase = Networks.TESTNET;

  const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());
  
  const wasmId = Buffer.from("32f78c0f4e74488e88732392b5d7efed491308dbde0df9aa2fe6160708726332", "hex");

  console.log("Instantiating Contract...");
  const createTx = new TransactionBuilder(relayerAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(
      Operation.createCustomContract({
        wasmHash: wasmId,
        address: new Address(relayerKp.publicKey()),
      })
    )
    .setTimeout(300)
    .build();

  const simCreate = await server.simulateTransaction(createTx);
  let assembledCreate = rpc.assembleTransaction(createTx, simCreate).build();
  assembledCreate.sign(relayerKp);
  const sendCreate = await server.sendTransaction(assembledCreate);

  console.log("Create hash:", sendCreate.hash);
}

run().catch(console.error);
