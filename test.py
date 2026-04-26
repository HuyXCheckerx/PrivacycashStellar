import time
import requests
import concurrent.futures
from stellar_sdk import Server, Keypair, Network, TransactionBuilder
from stellar_sdk.exceptions import NotFoundError

# --- CONFIGURATION ---
TARGET_ADDRESS = "GCGEID4OYTFPAWVUETPYF6SUXABX6WVBITKO3ZPPQOI2LSVSYEAKU5S7"
NUM_ACCOUNTS = 100
MAX_CONCURRENT_THREADS = 5 # Do not set this too high or Friendbot will IP ban you
FRIENDBOT_URL = "https://friendbot.stellar.org/"

server = Server("https://horizon-testnet.stellar.org")

def process_single_account(task_id):
    """The function that each thread will execute."""
    try:
        # 1. Generate Keypair
        temp_keypair = Keypair.random()
        temp_pub = temp_keypair.public_key
        print(f"[Task {task_id}] Created account: {temp_pub}")

        # 2. Fund with Friendbot (with retry logic for rate limits)
        funded = False
        for attempt in range(3): # Try 3 times
            response = requests.get(f"{FRIENDBOT_URL}?addr={temp_pub}")
            if response.status_code == 200:
                print(f"[Task {task_id}] Funded successfully!")
                funded = True
                break
            elif response.status_code == 429:
                wait_time = 3 * (attempt + 1)
                print(f"[Task {task_id}] Rate limited! Retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"[Task {task_id}] Friendbot Error: {response.status_code}. Retrying...")
                time.sleep(2)

        if not funded:
            return f"Task {task_id} Failed: Could not fund."

        # Horizon needs a moment to index the new account after Friendbot funds it
        time.sleep(2) 

        # 3. Load Account
        temp_account = None
        for attempt in range(3):
            try:
                temp_account = server.load_account(temp_pub)
                break
            except NotFoundError:
                print(f"[Task {task_id}] Account not found on ledger yet. Waiting 2s...")
                time.sleep(2)

        if not temp_account:
            return f"Task {task_id} Failed: Could not load account from network."

        # 4. Build Account Merge Transaction
        transaction = (
            TransactionBuilder(
                source_account=temp_account,
                network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE,
                base_fee=100
            )
            .append_account_merge_op(destination=TARGET_ADDRESS)
            .set_timeout(30)
            .build()
        )

        # 5. Sign and Submit
        transaction.sign(temp_keypair)
        response = server.submit_transaction(transaction)
        
        tx_hash = response.get('hash')
        return f"[Task {task_id}] SUCCESS! Merged in Tx: {tx_hash}"

    except Exception as e:
        return f"[Task {task_id}] ERROR: {str(e)}"

# --- MAIN EXECUTION LOGIC ---
if __name__ == "__main__":
    print(f"Starting Multithreaded Drain to: {TARGET_ADDRESS}")
    print(f"Total Accounts: {NUM_ACCOUNTS} | Concurrent Threads: {MAX_CONCURRENT_THREADS}\n")
    
    start_time = time.time()
    
    # We use ThreadPoolExecutor to manage the multithreading
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_THREADS) as executor:
        # Submit all 100 tasks to the executor
        # The executor will only run MAX_CONCURRENT_THREADS at a time
        futures = {executor.submit(process_single_account, i): i for i in range(1, NUM_ACCOUNTS + 1)}
        
        # As each thread completes, print its result
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            print(result)

    end_time = time.time()
    print(f"\nAll tasks finished in {round(end_time - start_time, 2)} seconds.")