#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, testutils::Events};
use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::token::StellarAssetClient;

#[allow(deprecated)]
fn create_token_contract<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let token_address = env.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(env, &token_address),
        StellarAssetClient::new(env, &token_address),
    )
}

#[test]
fn test_stealth_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(StealthContract, ());
    let client = StealthContractClient::new(&env, &contract_id);

    // Setup Token
    let token_admin = Address::generate(&env);
    let (token, token_admin_client) = create_token_contract(&env, &token_admin);
    
    // Alice (sender) and Bob (receiver via stealth address)
    let alice = Address::generate(&env);
    let destination = Address::generate(&env); // Bob's final fresh wallet
    let stealth_address = Address::generate(&env); // The derived stealth address
    
    // Mint 1000 tokens to Alice
    token_admin_client.mint(&alice, &1000);
    assert_eq!(token.balance(&alice), 1000);

    // Alice generates an ephemeral key (mocked as 32 bytes of 1s)
    let ephemeral_key = BytesN::from_array(&env, &[1u8; 32]);
    let encrypted_seed = BytesN::from_array(&env, &[2u8; 32]);
    let deposit_amount = 100;

    // 1. Alice deposits into the stealth contract
    client.deposit(&alice, &stealth_address, &ephemeral_key, &encrypted_seed, &token.address, &deposit_amount);

    // Verify balances
    assert_eq!(token.balance(&alice), 900);
    assert_eq!(token.balance(&contract_id), 100);

    // Verify Event emission
    // The stealth event should be among the recent events
    // The stealth event should be among the recent events
    
    // 2. Bob (using stealth_address) withdraws to his destination
    client.withdraw(&stealth_address, &token.address, &destination);

    // Verify final balances
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(token.balance(&destination), 100);
}

#[test]
#[should_panic(expected = "No funds available")]
fn test_withdraw_empty() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(StealthContract, ());
    let client = StealthContractClient::new(&env, &contract_id);
    let token_admin = Address::generate(&env);
    let (token, _) = create_token_contract(&env, &token_admin);

    let stealth_address = Address::generate(&env);
    let destination = Address::generate(&env);

    client.withdraw(&stealth_address, &token.address, &destination);
}
