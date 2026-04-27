#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_initialize_and_metadata() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), String::from_str(&env, "PrivacyCashStellar"));
    assert_eq!(client.symbol(), String::from_str(&env, "PCS"));
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_admin_mint() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    // Admin can mint
    client.mint(&admin, &user, &1000);
    assert_eq!(client.balance(&user), 1000);
    assert_eq!(client.total_supply(), 1000);
}

#[test]
fn test_authorized_minter() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    // Add minter
    client.add_minter(&minter);
    assert_eq!(client.is_minter(&minter), true);

    // Authorized minter can mint
    client.mint(&minter, &user, &500);
    assert_eq!(client.balance(&user), 500);
    assert_eq!(client.total_supply(), 500);
}

#[test]
#[should_panic(expected = "unauthorized minter")]
fn test_unauthorized_mint_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let random = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    // Random address should NOT be able to mint
    client.mint(&random, &user, &500);
}

#[test]
fn test_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    client.mint(&admin, &alice, &1000);
    client.transfer(&alice, &bob, &300);

    assert_eq!(client.balance(&alice), 700);
    assert_eq!(client.balance(&bob), 300);
}

#[test]
fn test_burn() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    client.mint(&admin, &user, &1000);
    client.burn(&user, &400);

    assert_eq!(client.balance(&user), 600);
    assert_eq!(client.total_supply(), 600);
}

#[test]
fn test_approve_and_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let spender = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    client.mint(&admin, &alice, &1000);
    client.approve(&alice, &spender, &500, &0);

    assert_eq!(client.allowance(&alice, &spender), 500);

    client.transfer_from(&spender, &alice, &bob, &200);
    assert_eq!(client.balance(&alice), 800);
    assert_eq!(client.balance(&bob), 200);
    assert_eq!(client.allowance(&alice, &spender), 300);
}

#[test]
fn test_remove_minter() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PCSToken, ());
    let client = PCSTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let minter = Address::generate(&env);

    client.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "PrivacyCashStellar"),
        &String::from_str(&env, "PCS"),
    );

    client.add_minter(&minter);
    assert_eq!(client.is_minter(&minter), true);

    client.remove_minter(&minter);
    assert_eq!(client.is_minter(&minter), false);
}
