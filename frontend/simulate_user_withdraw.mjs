import { rpc, TransactionBuilder, Networks, Address, xdr, Keypair, Contract } from "@stellar/stellar-sdk";

async function run() {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const networkPassphrase = Networks.TESTNET;
  const CONTRACT_ID = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4";
  const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  const relayerKp = Keypair.fromSecret("SAMMHJGI33WL7YLM5WFE4M5NFU3SUDOEQSAAAOJVU5ZHKO5A4UAUDO5K");
  const relayerAccount = await server.getAccount(relayerKp.publicKey());

  const contract = new Contract(CONTRACT_ID);
  
  const args = [
    new Address("GDKQ2YMZNCUGN4BWPSACMSAWRX7O4AJXQU2KMXICRZSAUCNQOUFUE").toScVal(),
    new Address(NATIVE_TOKEN).toScVal(),
    new Address("GAFQKZ5UYS43C24RR7ANSSB45L43JB5QEYY3QFD2CA5JWAXHEALOV4C").toScVal(),
  ];

  let tx = new TransactionBuilder(relayerAccount, {
    fee: "1000",
    networkPassphrase,
  })
    .addOperation(contract.call("withdraw", ...args))
    .setTimeout(300)
    .build();

  console.log("Simulating...");
  const simResponse = await server.simulateTransaction(tx);
  console.log(JSON.stringify(simResponse, null, 2));
}

run().catch(console.error);
