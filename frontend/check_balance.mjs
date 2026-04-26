import { rpc } from "@stellar/stellar-sdk";

// Check balance of a stealth address in BOTH old and new contracts
const server = new rpc.Server("https://soroban-testnet.stellar.org");

const OLD_CONTRACT = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4";
const NEW_CONTRACT = "CB6JPL4XCB62A7EG6EFH4LC55NKRNA3UYQZBCPFLYG2NYJAX4GLA5V2Z";

const stealthAddr = process.argv[2];
if (!stealthAddr) {
  console.error("Usage: node check_balance.mjs <STEALTH_ADDRESS>");
  process.exit(1);
}

async function checkBalance(contractId, label) {
  try {
    const { xdr, Address, StrKey } = await import("@stellar/stellar-sdk");
    const accountId = xdr.AccountId.publicKeyTypeEd25519(
      StrKey.decodeEd25519PublicKey(stealthAddr)
    );
    const scAddress = xdr.ScAddress.scAddressTypeAccount(accountId);
    const scKey = xdr.ScVal.scvAddress(scAddress);
    const contractAddress = new Address(contractId).toScAddress();

    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contractAddress,
        key: scKey,
        durability: xdr.ContractDataDurability.persistent(),
      })
    );
    const res = await server.getLedgerEntries(key);
    if (res.entries.length === 0) {
      console.log(`[${label}] No storage entry found (balance = 0)`);
      return;
    }
    const val = res.entries[0].val.contractData().val();
    const balance = val.i128().toString();
    console.log(`[${label}] Balance = ${balance} stroops (${Number(balance) / 1e7} XLM)`);
  } catch (e) {
    console.log(`[${label}] Error:`, e.message);
  }
}

await checkBalance(OLD_CONTRACT, "OLD contract CAA4C...");
await checkBalance(NEW_CONTRACT, "NEW contract CB6JP...");
