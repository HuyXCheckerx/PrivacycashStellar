import fetch from "node-fetch";

async function run() {
  const res = await fetch("https://horizon-testnet.stellar.org/transactions/7efc524e011023d7acb37419ed17649fa0e1338753564071f0ae26dba775aa65");
  const json = await res.json();
  if (json.successful) {
    console.log("Transaction was successful on ledger");
  } else {
    console.log("Transaction FAILED on ledger");
    console.log(json.result_xdr);
  }
}
run();
