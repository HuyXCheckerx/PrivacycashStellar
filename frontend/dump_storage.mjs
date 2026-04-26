import { rpc, Address, xdr, scValToNative } from "@stellar/stellar-sdk";
const server = new rpc.Server("https://soroban-testnet.stellar.org");

async function run() {
  try {
    const stealthAddr = new Address("GDKQ2YMZNCUGN4BWPSACMSAWRX7O4AJXQU2KMXICRZSAUCNQOUFUE");
    const key = stealthAddr.toScVal();
    const res = await server.getLedgerEntries(
      xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: new Address("CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4").toScAddress(),
        key: key,
        durability: xdr.ContractDataDurability.persistent()
      }))
    );
    if (res.entries && res.entries.length > 0) {
      const entry = res.entries[0].val.contractData();
      console.log("Balance:", scValToNative(entry.val()));
    } else {
      console.log("ENTRY NOT FOUND!");
    }
  } catch (e) {
    console.error(e);
  }
}
run();
