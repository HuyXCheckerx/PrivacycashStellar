import { rpc, TransactionBuilder, Networks, Keypair, Contract, xdr, Asset, Operation } from "@stellar/stellar-sdk";
import fs from "fs";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const networkPassphrase = Networks.TESTNET;

  const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());

  const wasm = fs.readFileSync("../contracts/target/wasm32v1-none/release/stealth_contract.wasm");

  console.log("Uploading WASM...");
  const uploadTx = new TransactionBuilder(relayerAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(
      Operation.uploadContractWasm({ wasm })
    )
    .setTimeout(300)
    .build();

  const simUpload = await server.simulateTransaction(uploadTx);
  let assembledUpload = rpc.assembleTransaction(uploadTx, simUpload).build();
  assembledUpload.sign(relayerKp);
  const sendUpload = await server.sendTransaction(assembledUpload);

  console.log("Upload hash:", sendUpload.hash);

  let getTxResponse = await server.getTransaction(sendUpload.hash);
  while (getTxResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getTxResponse = await server.getTransaction(sendUpload.hash);
  }

  if (getTxResponse.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error("Upload failed: " + JSON.stringify(getTxResponse));
  }

  const wasmId = getTxResponse.resultMetaXdr.v3().sorobanMeta().returnValue().bytes();
  console.log("Wasm ID:", wasmId.toString("hex"));

  relayerAccount.incrementSequenceNumber();

  console.log("Instantiating Contract...");
  const createTx = new TransactionBuilder(relayerAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(
      new rpc.CreateContractOperation({
        wasmId: wasmId,
        address: relayerKp.publicKey(),
      })
    )
    .setTimeout(300)
    .build();

  const simCreate = await server.simulateTransaction(createTx);
  let assembledCreate = rpc.assembleTransaction(createTx, simCreate).build();
  assembledCreate.sign(relayerKp);
  const sendCreate = await server.sendTransaction(assembledCreate);

  console.log("Create hash:", sendCreate.hash);

  let getTxResponseCreate = await server.getTransaction(sendCreate.hash);
  while (getTxResponseCreate.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getTxResponseCreate = await server.getTransaction(sendCreate.hash);
  }

  if (getTxResponseCreate.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error("Create failed: " + JSON.stringify(getTxResponseCreate));
  }

  const contractId = getTxResponseCreate.resultMetaXdr.v3().sorobanMeta().returnValue().address().contractId().toString("hex");
  const contractIdStr = new xdr.Address.contract(Buffer.from(contractId, "hex")).toString();
  console.log("Contract ID:", contractIdStr);
}

run().catch(console.error);
