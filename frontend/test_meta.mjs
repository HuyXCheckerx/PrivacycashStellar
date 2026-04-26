import { rpc } from "@stellar/stellar-sdk";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const tx = await server.getTransaction("6961621c06d9442d893154d723819081025f3e0bb4cf4b6db0d7605923a8c308");
  console.log(tx.resultMetaXdr);
}
run();
