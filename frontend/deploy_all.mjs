import { rpc, TransactionBuilder, Networks, Keypair, Operation, Address, StrKey, nativeToScVal } from "@stellar/stellar-sdk";
import fs from "fs";

// Using the relayer account for deployment
const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const networkPassphrase = Networks.TESTNET;

async function uploadWasm(wasmPath) {
  console.log(`Uploading ${wasmPath}...`);
  const account = await server.getAccount(relayerKp.publicKey());
  const wasmFile = fs.readFileSync(wasmPath);
  
  const uploadTx = new TransactionBuilder(account, {
    fee: "5000000",
    networkPassphrase,
  })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmFile }))
    .setTimeout(300)
    .build();

  const simUpload = await server.simulateTransaction(uploadTx);
  let assembledUpload = rpc.assembleTransaction(uploadTx, simUpload).build();
  assembledUpload.sign(relayerKp);
  const sendUpload = await server.sendTransaction(assembledUpload);
  
  console.log(`Waiting for upload ${sendUpload.hash}...`);
  let txResult;
  while (true) {
    txResult = await server.getTransaction(sendUpload.hash);
    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  if (txResult.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Upload failed for ${wasmPath}`);
  }

  return txResult.resultMetaXdr.v4().sorobanMeta().returnValue().bytes();
}

async function instantiateContract(wasmHash) {
  console.log(`Instantiating contract from WASM hash ${wasmHash.toString('hex')}...`);
  let simCreate, assembledCreate;
  
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const account = await server.getAccount(relayerKp.publicKey());
      const createTx = new TransactionBuilder(account, {
        fee: "1000000",
        networkPassphrase,
      })
        .addOperation(
          Operation.createCustomContract({
            wasmHash,
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
      }
    } catch (e) {
      console.log("Retry...", e.message);
    }
  }

  if (!assembledCreate) throw new Error("Failed to instantiate");
  
  const sendCreate = await server.sendTransaction(assembledCreate);
  console.log(`Waiting for instantiate ${sendCreate.hash}...`);
  
  let txResult;
  while (true) {
    txResult = await server.getTransaction(sendCreate.hash);
    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  const contractIdBuf = txResult.resultMetaXdr.v4().sorobanMeta().returnValue().address().contractId();
  return StrKey.encodeContract(contractIdBuf);
}

async function invokeContract(contractId, method, args) {
  console.log(`Invoking ${method} on ${contractId}...`);
  const account = await server.getAccount(relayerKp.publicKey());
  
  // Note: For a real app we'd use the Contract class, but this is a quick script
  const { Contract } = await import("@stellar/stellar-sdk");
  const contract = new Contract(contractId);
  
  const tx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(relayerKp);
  
  const send = await server.sendTransaction(assembled);
  let txResult;
  while (true) {
    txResult = await server.getTransaction(send.hash);
    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (txResult.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Invocation failed: ${method}`);
  }
  return txResult;
}

async function run() {
  console.log("🚀 Starting Full Protocol Deployment...");
  
  // 1. Upload & Instantiate PCS Token
  const pcsWasm = await uploadWasm("../contracts/target/wasm32v1-none/release/pcs_token.wasm");
  const pcsTokenId = await instantiateContract(pcsWasm);
  console.log(`✅ PCS Token deployed: ${pcsTokenId}`);

  // 2. Upload & Instantiate Liquidity Pool
  const poolWasm = await uploadWasm("../contracts/target/wasm32v1-none/release/liquidity_pool.wasm");
  const poolId = await instantiateContract(poolWasm);
  console.log(`✅ Liquidity Pool deployed: ${poolId}`);

  // 3. Upload & Instantiate Stealth Contract
  const stealthWasm = await uploadWasm("../contracts/target/wasm32v1-none/release/stealth_contract.wasm");
  const stealthId = await instantiateContract(stealthWasm);
  console.log(`✅ Stealth Contract deployed: ${stealthId}`);

  // 4. Initialize PCS Token
  console.log("⚙️ Initializing PCS Token...");
  await invokeContract(pcsTokenId, "initialize", [
    new Address(relayerKp.publicKey()).toScVal(), // Admin
    nativeToScVal(7, { type: "u32" }), // Decimals
    nativeToScVal("PrivacyCashStellar"), // Name
    nativeToScVal("PCS") // Symbol
  ]);

  // 5. Authorize Stealth Contract as Minter
  console.log("⚙️ Authorizing Stealth Contract as Minter...");
  await invokeContract(pcsTokenId, "add_minter", [
    new Address(stealthId).toScVal()
  ]);

  // 6. Initialize Liquidity Pool
  console.log("⚙️ Initializing Liquidity Pool...");
  const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // Testnet XLM
  await invokeContract(poolId, "initialize", [
    new Address(pcsTokenId).toScVal(),
    new Address(NATIVE_TOKEN).toScVal()
  ]);

  // 7. Initialize Stealth Contract
  console.log("⚙️ Initializing Stealth Contract...");
  await invokeContract(stealthId, "initialize", [
    new Address(relayerKp.publicKey()).toScVal(), // Admin
    new Address(pcsTokenId).toScVal(), // PCS Token
    nativeToScVal(10, { type: "i128" }) // Reward multiplier
  ]);

  console.log("\n🎉 Deployment Complete!");
  console.log("-----------------------------------------");
  console.log(`export const CONTRACT_ID = "${stealthId}";`);
  console.log(`export const PCS_TOKEN_ID = "${pcsTokenId}";`);
  console.log(`export const LIQUIDITY_POOL_ID = "${poolId}";`);
  console.log("-----------------------------------------");
}

run().catch(console.error);
