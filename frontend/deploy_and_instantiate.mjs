import { rpc, TransactionBuilder, Networks, Keypair, Contract, xdr, Asset, Operation, Address, StrKey } from "@stellar/stellar-sdk";
import fs from "fs";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const networkPassphrase = Networks.TESTNET;

  const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());

  console.log("Uploading WASM...");
  const wasmFile = fs.readFileSync("../contracts/target/wasm32v1-none/release/stealth_contract.wasm");
  const uploadTx = new TransactionBuilder(relayerAccount, {
    fee: "5000000",
    networkPassphrase,
  })
    .addOperation(
      Operation.uploadContractWasm({
        wasm: wasmFile,
      })
    )
    .setTimeout(300)
    .build();

  const simUpload = await server.simulateTransaction(uploadTx);
  let assembledUpload = rpc.assembleTransaction(uploadTx, simUpload).build();
  assembledUpload.sign(relayerKp);
  const sendUpload = await server.sendTransaction(assembledUpload);
  
  console.log("Upload hash:", sendUpload.hash);
  
  let txResult;
  while (true) {
    txResult = await server.getTransaction(sendUpload.hash);
    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (txResult.status === rpc.Api.GetTransactionStatus.FAILED) {
    console.error("Upload failed!");
    return;
  }

  const wasmIdBuf = txResult.resultMetaXdr.v4().sorobanMeta().returnValue().bytes();
  console.log("WASM ID HEX:", wasmIdBuf.toString('hex'));

  console.log("Waiting for Testnet nodes to sync WASM...");
  let simCreate, assembledCreate;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      // Refetch account for new sequence number
      const relayerAccount2 = await server.getAccount(relayerKp.publicKey());
      const createTx = new TransactionBuilder(relayerAccount2, {
        fee: "1000000",
        networkPassphrase,
      })
        .addOperation(
          Operation.createCustomContract({
            wasmHash: wasmIdBuf,
            address: new Address(relayerKp.publicKey()),
          })
        )
        .setTimeout(300)
        .build();

      simCreate = await server.simulateTransaction(createTx);
      if (rpc.Api.isSimulationSuccess(simCreate)) {
        assembledCreate = rpc.assembleTransaction(createTx, simCreate).build();
        assembledCreate.sign(relayerKp);
        break;
      } else {
        console.log("Simulation failed, retrying...");
      }
    } catch (e) {
      console.log("Error during simulation, retrying...", e.message);
    }
  }

  if (!assembledCreate) {
    console.error("Failed to instantiate after multiple retries");
    return;
  }
  const sendCreate = await server.sendTransaction(assembledCreate);

  console.log("Create hash:", sendCreate.hash);

  while (true) {
    txResult = await server.getTransaction(sendCreate.hash);
    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const contractIdBuf = txResult.resultMetaXdr.v4().sorobanMeta().returnValue().address().contractId();
  console.log("CONTRACT ID:", StrKey.encodeContract(contractIdBuf));
}

run().catch(console.error);
