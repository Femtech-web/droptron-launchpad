use starknet::ContractAddress;
use droptron_contracts::launch::{IDroptronLaunchDispatcher, IDroptronLaunchDispatcherTrait, IDroptronLaunchSafeDispatcher, IDroptronLaunchSafeDispatcherTrait};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address, stop_cheat_caller_address, start_cheat_block_timestamp};
use droptron_contracts::claim_series::{ClaimTerms, IClaimSeriesDispatcher, IClaimSeriesDispatcherTrait, IClaimSeriesSafeDispatcher, IClaimSeriesSafeDispatcherTrait};
use droptron_contracts::distribution_factory::{Tranche, IDistributionFactoryDispatcher, IDistributionFactoryDispatcherTrait, IDistributionFactorySafeDispatcher, IDistributionFactorySafeDispatcherTrait};
use droptron_contracts::claim_redemption::{IClaimRedemptionDispatcher, IClaimRedemptionSafeDispatcher, IClaimRedemptionSafeDispatcherTrait};
use droptron_contracts::mocks::mock_claim_asset::{IMockClaimAssetDispatcher, IMockClaimAssetDispatcherTrait};
use droptron_contracts::fixed_supply_token::{IDroptronFixedSupplyTokenDispatcher, IDroptronFixedSupplyTokenDispatcherTrait, IDroptronFixedSupplyTokenSafeDispatcher, IDroptronFixedSupplyTokenSafeDispatcherTrait};
use droptron_contracts::mocks::mock_claim_pool::{IMockClaimPoolDispatcher, IMockClaimPoolDispatcherTrait, IMockClaimPoolSafeDispatcher, IMockClaimPoolSafeDispatcherTrait};

fn addr(value: felt252) -> ContractAddress { value.try_into().unwrap() }
fn tickets(series: ContractAddress) -> IDroptronFixedSupplyTokenDispatcher { IDroptronFixedSupplyTokenDispatcher { contract_address: series } }
fn safe(series: ContractAddress) -> IClaimSeriesSafeDispatcher { IClaimSeriesSafeDispatcher { contract_address: series } }

fn deploy_token() -> IDroptronFixedSupplyTokenDispatcher {
    let class = declare("DroptronFixedSupplyToken").unwrap().contract_class();
    let mut calldata = array![];
    addr(111).serialize(ref calldata);
    1000000_u256.serialize(ref calldata);
    'Test'.serialize(ref calldata);
    4_u8.serialize(ref calldata);
    'TST'.serialize(ref calldata);
    3_u8.serialize(ref calldata);
    6_u8.serialize(ref calldata);
    tickets(class.deploy(@calldata).unwrap().0)
}
fn deploy_series(token: ContractAddress, expiry: u64) -> IClaimSeriesDispatcher {
    let class = declare("DroptronClaimSeries").unwrap().contract_class();
    let mut calldata = array![];
    ClaimTerms { owner: addr(111), underlying: token, decimals: 6, allocation: 1000, unlock_at: 100, expires_at: expiry }.serialize(ref calldata);
    IClaimSeriesDispatcher { contract_address: class.deploy(@calldata).unwrap().0 }
}
fn fund(token: IDroptronFixedSupplyTokenDispatcher, series: ContractAddress) {
    start_cheat_caller_address(token.contract_address, addr(111));
    token.approve(series, 1000);
    stop_cheat_caller_address(token.contract_address);
    start_cheat_caller_address(series, addr(111));
    IClaimSeriesDispatcher { contract_address: series }.fund();
    stop_cheat_caller_address(series);
}
fn funded(expiry: u64) -> (IDroptronFixedSupplyTokenDispatcher, IClaimSeriesDispatcher) {
    let token = deploy_token();
    let series = deploy_series(token.contract_address, expiry);
    fund(token, series.contract_address);
    start_cheat_block_timestamp(series.contract_address, 100);
    (token, series)
}
fn give(series: ContractAddress, to: ContractAddress, amount: u256) {
    start_cheat_caller_address(series, addr(111));
    tickets(series).transfer(to, amount);
    stop_cheat_caller_address(series);
}
fn deploy_factory() -> IDistributionFactoryDispatcher {
    let series = declare("DroptronClaimSeries").unwrap().contract_class();
    let factory = declare("DroptronDistributionFactory").unwrap().contract_class();
    let mut calldata = array![];
    series.class_hash.serialize(ref calldata);
    IDistributionFactoryDispatcher { contract_address: factory.deploy(@calldata).unwrap().0 }
}
fn private_setup() -> (IDroptronFixedSupplyTokenDispatcher, IClaimSeriesDispatcher, IMockClaimPoolDispatcher, IClaimRedemptionDispatcher) {
    let token = deploy_token();
    private_setup_with_token(token)
}
fn private_setup_with_token(token: IDroptronFixedSupplyTokenDispatcher) -> (IDroptronFixedSupplyTokenDispatcher, IClaimSeriesDispatcher, IMockClaimPoolDispatcher, IClaimRedemptionDispatcher) {
    let factory = deploy_factory();
    start_cheat_caller_address(factory.contract_address, addr(111));
    let created = factory.create_campaign(token.contract_address, 6, 1, array![Tranche { allocation: 1000, unlock_at: 100, expires_at: 0 }].span());
    let series = IClaimSeriesDispatcher { contract_address: *created.at(0) };
    fund(token, series.contract_address);
    start_cheat_block_timestamp(series.contract_address, 100);
    let pool_class = declare("MockClaimPool").unwrap().contract_class();
    let pool = IMockClaimPoolDispatcher { contract_address: pool_class.deploy(@array![]).unwrap().0 };
    let helper_class = declare("DroptronClaimRedemption").unwrap().contract_class();
    let mut calldata = array![];
    pool.contract_address.serialize(ref calldata);
    factory.contract_address.serialize(ref calldata);
    let helper = IClaimRedemptionDispatcher { contract_address: helper_class.deploy(@calldata).unwrap().0 };
    give(series.contract_address, pool.contract_address, 1000);
    (token, series, pool, helper)
}

fn bad_asset() -> IDroptronFixedSupplyTokenDispatcher {
    let class = declare("MockClaimAsset").unwrap().contract_class();
    tickets(class.deploy(@array![]).unwrap().0)
}
fn configure_asset(token: ContractAddress, mode: u8, target: ContractAddress) {
    IMockClaimAssetDispatcher { contract_address: token }.configure(mode, target);
}

fn settlement_launch(sale: IDroptronFixedSupplyTokenDispatcher, payment: IDroptronFixedSupplyTokenDispatcher) -> IDroptronLaunchDispatcher {
    let class = declare("DroptronLaunch").unwrap().contract_class();
    let mut calldata = array![];
    addr(111).serialize(ref calldata);
    sale.contract_address.serialize(ref calldata);
    payment.contract_address.serialize(ref calldata);
    6_u8.serialize(ref calldata);
    6_u8.serialize(ref calldata);
    0_u8.serialize(ref calldata);
    1000000000000000000_u256.serialize(ref calldata);
    0_u256.serialize(ref calldata);
    1000_u256.serialize(ref calldata);
    2000_u256.serialize(ref calldata);
    100_u64.serialize(ref calldata);
    200_u64.serialize(ref calldata);
    let launch = IDroptronLaunchDispatcher { contract_address: class.deploy(@calldata).unwrap().0 };
    start_cheat_caller_address(sale.contract_address, addr(111));
    sale.approve(launch.contract_address, 1000);
    stop_cheat_caller_address(sale.contract_address);
    start_cheat_caller_address(launch.contract_address, addr(111));
    launch.fund();
    launch
}

#[test]
#[feature("safe_dispatcher")]
fn owner_payout_proceeds_rejects_noop_transfer_and_preserves_retry() {
    let payment = bad_asset();
    let launch = settlement_launch(deploy_token(), payment);
    start_cheat_caller_address(payment.contract_address, addr(111));
    payment.approve(launch.contract_address, 100);
    stop_cheat_caller_address(payment.contract_address);
    start_cheat_block_timestamp(launch.contract_address, 100);
    launch.buy_exact_sale(100, 100);
    configure_asset(payment.contract_address, 7, launch.contract_address);
    start_cheat_block_timestamp(launch.contract_address, 200);
    let safe_launch = IDroptronLaunchSafeDispatcher { contract_address: launch.contract_address };
    assert(safe_launch.withdraw_proceeds().is_err(), 'NOOP_PROCEEDS_ACCEPTED');
    assert(payment.balance_of(launch.contract_address) == 100, 'PROCEEDS_CHANGED');
    configure_asset(payment.contract_address, 0, launch.contract_address);
    assert(launch.withdraw_proceeds() == 100, 'RETRY_FAILED');
}

#[test]
#[feature("safe_dispatcher")]
fn owner_payout_cancel_rejects_noop_transfer_and_preserves_retry() {
    let sale = bad_asset();
    let launch = settlement_launch(sale, deploy_token());
    configure_asset(sale.contract_address, 7, launch.contract_address);
    let safe_launch = IDroptronLaunchSafeDispatcher { contract_address: launch.contract_address };
    assert(safe_launch.cancel().is_err(), 'NOOP_CANCEL_ACCEPTED');
    assert(!launch.is_cancelled(), 'CANCEL_NOT_RESTORED');
    configure_asset(sale.contract_address, 0, launch.contract_address);
    launch.cancel();
    assert(sale.balance_of(launch.contract_address) == 0, 'RECOVERY_FAILED');
}

#[test]
#[feature("safe_dispatcher")]
fn owner_payout_unsold_rejects_noop_transfer_and_preserves_retry() {
    let sale = bad_asset();
    let launch = settlement_launch(sale, deploy_token());
    configure_asset(sale.contract_address, 7, launch.contract_address);
    start_cheat_block_timestamp(launch.contract_address, 200);
    let safe_launch = IDroptronLaunchSafeDispatcher { contract_address: launch.contract_address };
    assert(safe_launch.recover_unsold().is_err(), 'NOOP_RECOVERY_ACCEPTED');
    assert(launch.get_state().remaining_sale_raw == 1000, 'INVENTORY_NOT_RESTORED');
    configure_asset(sale.contract_address, 0, launch.contract_address);
    assert(launch.recover_unsold() == 1000, 'RETRY_FAILED');
}

#[test]
#[feature("safe_dispatcher")]
fn short_funding_never_issues_unbacked_tickets() {
    let token = bad_asset();
    let series = deploy_series(token.contract_address, 0);
    start_cheat_caller_address(token.contract_address, addr(111));
    token.approve(series.contract_address, 1000);
    stop_cheat_caller_address(token.contract_address);
    configure_asset(token.contract_address, 1, series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    assert(safe(series.contract_address).fund().is_err(), 'SHORT_FUNDING_ACCEPTED');
    assert(!series.is_funded(), 'FUNDING_FLAG_CHANGED');
    assert(tickets(series.contract_address).total_supply() == 0, 'UNBACKED_SUPPLY');
    assert(token.balance_of(addr(111)) == 1000000, 'FUNDS_NOT_RESTORED');
}

#[test]
#[feature("safe_dispatcher")]
fn short_payout_reverts_burn_and_preserves_reserve() {
    let token = bad_asset();
    let series = deploy_series(token.contract_address, 0);
    fund(token, series.contract_address);
    configure_asset(token.contract_address, 2, series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    start_cheat_block_timestamp(series.contract_address, 100);
    assert(safe(series.contract_address).redeem(100, addr(222)).is_err(), 'SHORT_PAYOUT_ACCEPTED');
    assert(tickets(series.contract_address).total_supply() == 1000, 'BURN_NOT_RESTORED');
    assert(series.remaining_reserve() == 1000, 'RESERVE_NOT_RESTORED');
    assert(token.balance_of(addr(222)) == 0, 'PAYOUT_NOT_RESTORED');
}

#[test]
#[feature("safe_dispatcher")]
fn reentrant_underlying_cannot_redeem_twice() {
    let token = bad_asset();
    let series = deploy_series(token.contract_address, 0);
    fund(token, series.contract_address);
    configure_asset(token.contract_address, 3, series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    start_cheat_block_timestamp(series.contract_address, 100);
    let result = safe(series.contract_address).redeem(100, addr(222));
    assert(result.is_err(), 'REENTRANCY_ACCEPTED');
    assert(series.remaining_reserve() == 1000, 'RESERVE_NOT_RESTORED');
    configure_asset(token.contract_address, 0, series.contract_address);
    IClaimSeriesDispatcher { contract_address: series.contract_address }.redeem(100, addr(222));
    assert(series.remaining_reserve() == 900, 'LOCK_NOT_RESTORED');
}

#[test]
#[feature("safe_dispatcher")]
fn failed_output_approval_rolls_back_private_claim() {
    let (token, series, pool, helper) = private_setup_with_token(bad_asset());
    configure_asset(token.contract_address, 4, series.contract_address);
    let safe_pool = IMockClaimPoolSafeDispatcher { contract_address: pool.contract_address };
    assert(safe_pool.claim(series.contract_address, helper.contract_address, 100, false).is_err(), 'APPROVAL_IGNORED');
    assert(series.remaining_reserve() == 1000, 'BAD_RESERVE');
    assert(tickets(series.contract_address).balance_of(pool.contract_address) == 1000, 'INPUT_NOT_RESTORED');
}

#[test]
#[feature("safe_dispatcher")]
fn failed_payout_rolls_back_public_claim() {
    let token = bad_asset();
    let series = deploy_series(token.contract_address, 0);
    fund(token, series.contract_address);
    configure_asset(token.contract_address, 5, series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    start_cheat_block_timestamp(series.contract_address, 100);
    assert(safe(series.contract_address).redeem(100, addr(222)).is_err(), 'FALSE_TRANSFER_IGNORED');
    assert(series.remaining_reserve() == 1000, 'BAD_RESERVE');
}

#[test]
#[feature("safe_dispatcher")]
fn underlying_decimals_must_match_ticket_units() {
    let token = bad_asset();
    let series = deploy_series(token.contract_address, 0);
    configure_asset(token.contract_address, 6, series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    assert(safe(series.contract_address).fund().is_err(), 'WRONG_DECIMALS_ACCEPTED');
    assert(tickets(series.contract_address).total_supply() == 0, 'UNBACKED_SUPPLY');
}

#[test]
fn tickets_are_minted_only_after_exact_funding() {
    let token = deploy_token();
    let series = deploy_series(token.contract_address, 200);
    assert(tickets(series.contract_address).total_supply() == 0, 'UNFUNDED_SUPPLY');
    fund(token, series.contract_address);
    assert(series.is_funded(), 'NOT_FUNDED');
    assert(series.remaining_reserve() == 1000, 'BAD_RESERVE');
    assert(token.balance_of(series.contract_address) == 1000, 'BAD_COLLATERAL');
    assert(tickets(series.contract_address).balance_of(addr(111)) == 1000, 'BAD_TICKETS');
    assert(tickets(series.contract_address).decimals() == 6, 'BAD_DECIMALS');
}

#[test]
#[feature("safe_dispatcher")]
fn funding_twice_cannot_increase_supply() {
    let (_, series) = funded(200);
    start_cheat_caller_address(series.contract_address, addr(111));
    assert(safe(series.contract_address).fund().is_err(), 'DOUBLE_FUNDED');
    assert(tickets(series.contract_address).total_supply() == 1000, 'SUPPLY_CHANGED');
}

#[test]
fn partial_then_final_claim_burns_supply_and_exhausts_reserve() {
    let (token, series) = funded(200);
    give(series.contract_address, addr(222), 1000);
    start_cheat_caller_address(series.contract_address, addr(222));
    series.redeem(350, addr(222));
    assert(series.remaining_reserve() == 650, 'BAD_PARTIAL_RESERVE');
    series.redeem(650, addr(222));
    assert(series.remaining_reserve() == 0, 'RESERVE_REMAINS');
    assert(tickets(series.contract_address).total_supply() == 0, 'SUPPLY_REMAINS');
    assert(token.balance_of(addr(222)) == 1000, 'BAD_PAYOUT');
}

#[test]
#[feature("safe_dispatcher")]
fn spent_tickets_cannot_be_claimed_again() {
    let (_, series) = funded(200);
    give(series.contract_address, addr(222), 50);
    start_cheat_caller_address(series.contract_address, addr(222));
    series.redeem(50, addr(222));
    assert(safe(series.contract_address).redeem(50, addr(222)).is_err(), 'DOUBLE_CLAIM');
    assert(series.remaining_reserve() == 950, 'RESERVE_CHANGED');
}

#[test]
#[feature("safe_dispatcher")]
fn early_claim_reverts_without_burning_tickets() {
    let (_, series) = funded(0);
    start_cheat_block_timestamp(series.contract_address, 99);
    start_cheat_caller_address(series.contract_address, addr(111));
    assert(safe(series.contract_address).redeem(1, addr(222)).is_err(), 'EARLY_CLAIM');
    assert(tickets(series.contract_address).total_supply() == 1000, 'BURNED_EARLY');
}

#[test]
#[feature("safe_dispatcher")]
fn expiry_is_exclusive_and_recovery_is_once_only() {
    let (token, series) = funded(200);
    start_cheat_caller_address(series.contract_address, addr(111));
    start_cheat_block_timestamp(series.contract_address, 199);
    series.redeem(100, addr(222));
    assert(safe(series.contract_address).recover_expired().is_err(), 'RECOVERED_EARLY');
    start_cheat_block_timestamp(series.contract_address, 200);
    assert(safe(series.contract_address).redeem(1, addr(222)).is_err(), 'EXPIRED_CLAIM');
    series.recover_expired();
    assert(series.remaining_reserve() == 0, 'RESERVE_REMAINS');
    assert(token.balance_of(addr(111)) == 999900, 'BAD_RECOVERY');
    assert(safe(series.contract_address).recover_expired().is_err(), 'DOUBLE_RECOVERY');
}

#[test]
#[feature("safe_dispatcher")]
fn non_expiring_vesting_cannot_be_recovered_by_creator() {
    let (_, series) = funded(0);
    start_cheat_caller_address(series.contract_address, addr(111));
    start_cheat_block_timestamp(series.contract_address, 9999999999);
    assert(safe(series.contract_address).recover_expired().is_err(), 'RECOVERED_VESTING');
    series.redeem(1000, addr(222));
}

#[test]
#[feature("safe_dispatcher")]
fn pause_stops_redemption_but_does_not_allow_early_recovery() {
    let (_, series) = funded(200);
    start_cheat_caller_address(series.contract_address, addr(111));
    series.set_paused(true);
    assert(safe(series.contract_address).redeem(1, addr(222)).is_err(), 'PAUSED_CLAIM');
    assert(safe(series.contract_address).recover_expired().is_err(), 'PAUSED_RECOVERY');
    series.set_paused(false);
    series.redeem(1, addr(222));
}

#[test]
#[feature("safe_dispatcher")]
fn owner_actions_reject_outsiders() {
    let token = deploy_token();
    let series = deploy_series(token.contract_address, 200);
    start_cheat_caller_address(series.contract_address, addr(222));
    assert(safe(series.contract_address).fund().is_err(), 'FUNDED_BY_OUTSIDER');
    assert(safe(series.contract_address).set_paused(true).is_err(), 'PAUSED_BY_OUTSIDER');
    start_cheat_block_timestamp(series.contract_address, 200);
    assert(safe(series.contract_address).recover_expired().is_err(), 'RECOVERED_BY_OUTSIDER');
}

#[test]
#[feature("safe_dispatcher")]
fn invalid_claim_amount_or_recipient_preserves_backing() {
    let (_, series) = funded(200);
    start_cheat_caller_address(series.contract_address, addr(111));
    assert(safe(series.contract_address).redeem(0, addr(222)).is_err(), 'ZERO_CLAIM');
    assert(safe(series.contract_address).redeem(1001, addr(222)).is_err(), 'OVER_CLAIM');
    assert(safe(series.contract_address).redeem(1, addr(0)).is_err(), 'ZERO_RECIPIENT');
    assert(safe(series.contract_address).redeem(1, series.contract_address).is_err(), 'SELF_RECIPIENT');
    assert(series.remaining_reserve() == 1000, 'BAD_RESERVE');
}

#[test]
#[feature("safe_dispatcher")]
fn tickets_of_one_tranche_cannot_redeem_another() {
    let (token, first) = funded(0);
    let second = deploy_series(token.contract_address, 300);
    fund(token, second.contract_address);
    give(first.contract_address, addr(222), 100);
    start_cheat_block_timestamp(second.contract_address, 150);
    start_cheat_caller_address(second.contract_address, addr(222));
    assert(safe(second.contract_address).redeem(100, addr(222)).is_err(), 'CROSS_TRANCHE_CLAIM');
    assert(second.remaining_reserve() == 1000, 'SECOND_DRAINED');
}

#[test]
fn ticket_transfer_and_allowance_preserve_total_supply() {
    let (_, series) = funded(0);
    let token = tickets(series.contract_address);
    start_cheat_caller_address(series.contract_address, addr(111));
    token.transfer(addr(111), 100);
    token.approve(addr(333), 100);
    start_cheat_caller_address(series.contract_address, addr(333));
    token.transfer_from(addr(111), addr(222), 40);
    assert(token.allowance(addr(111), addr(333)) == 60, 'BAD_ALLOWANCE');
    assert(token.balance_of(addr(111)) == 960, 'BAD_OWNER_BALANCE');
    assert(token.balance_of(addr(222)) == 40, 'BAD_RECIPIENT_BALANCE');
    assert(token.total_supply() == 1000, 'SUPPLY_CHANGED');
}

#[test]
#[feature("safe_dispatcher")]
fn ticket_transfer_cannot_burn_or_lock_tickets_at_series() {
    let (_, series) = funded(0);
    start_cheat_caller_address(series.contract_address, addr(111));
    let token = IDroptronFixedSupplyTokenSafeDispatcher { contract_address: series.contract_address };
    assert(token.transfer(addr(0), 1).is_err(), 'ZERO_TRANSFER');
    assert(token.transfer(series.contract_address, 1).is_err(), 'SELF_CONTRACT_TRANSFER');
}

#[test]
fn factory_creates_ordered_isolated_series_for_creator() {
    let factory = deploy_factory();
    let token = deploy_token();
    start_cheat_caller_address(factory.contract_address, addr(111));
    let result = factory.create_campaign(token.contract_address, 6, 44, array![
        Tranche { allocation: 100, unlock_at: 100, expires_at: 0 },
        Tranche { allocation: 200, unlock_at: 200, expires_at: 0 },
    ].span());
    assert(result.len() == 2 && *result.at(0) != *result.at(1), 'BAD_SERIES');
    for series in result {
        assert(factory.is_series(*series), 'NOT_REGISTERED');
        let claim = IClaimSeriesDispatcher { contract_address: *series };
        assert(claim.terms().owner == addr(111), 'WRONG_OWNER');
        assert(!claim.is_funded(), 'IMPLICIT_FUNDING');
    };
    start_cheat_caller_address(factory.contract_address, addr(222));
    let other = factory.create_campaign(token.contract_address, 6, 44, array![Tranche { allocation: 100, unlock_at: 100, expires_at: 0 }].span());
    assert(*other.at(0) != *result.at(0), 'SALT_COLLISION');
}

#[test]
#[feature("safe_dispatcher")]
fn duplicate_campaign_is_rejected() {
    let factory = deploy_factory();
    let token = deploy_token();
    start_cheat_caller_address(factory.contract_address, addr(111));
    let tranches = array![Tranche { allocation: 100, unlock_at: 100, expires_at: 0 }];
    factory.create_campaign(token.contract_address, 6, 44, tranches.span());
    let safe_factory = IDistributionFactorySafeDispatcher { contract_address: factory.contract_address };
    assert(safe_factory.create_campaign(token.contract_address, 6, 44, tranches.span()).is_err(), 'DUPLICATE_CAMPAIGN');
}

#[test]
#[feature("safe_dispatcher")]
fn invalid_factory_batch_rolls_back_salt_and_created_series() {
    let factory = deploy_factory();
    let token = deploy_token();
    start_cheat_caller_address(factory.contract_address, addr(111));
    let safe_factory = IDistributionFactorySafeDispatcher { contract_address: factory.contract_address };
    assert(safe_factory.create_campaign(token.contract_address, 6, 44, array![
        Tranche { allocation: 100, unlock_at: 200, expires_at: 0 },
        Tranche { allocation: 100, unlock_at: 100, expires_at: 0 },
    ].span()).is_err(), 'UNORDERED_ACCEPTED');
    let result = factory.create_campaign(token.contract_address, 6, 44, array![Tranche { allocation: 100, unlock_at: 200, expires_at: 0 }].span());
    assert(result.len() == 1, 'SALT_NOT_ROLLED_BACK');
}

#[test]
#[feature("safe_dispatcher")]
fn factory_rejects_empty_and_oversized_campaigns() {
    let factory = deploy_factory();
    let token = deploy_token();
    start_cheat_caller_address(factory.contract_address, addr(111));
    let safe_factory = IDistributionFactorySafeDispatcher { contract_address: factory.contract_address };
    assert(safe_factory.create_campaign(token.contract_address, 6, 44, array![].span()).is_err(), 'EMPTY_ACCEPTED');
    let mut tranches = array![];
    for i in 0..25_u64 { tranches.append(Tranche { allocation: 1, unlock_at: 100 + i, expires_at: 0 }); };
    assert(safe_factory.create_campaign(token.contract_address, 6, 44, tranches.span()).is_err(), 'OVERSIZED_ACCEPTED');
}

#[test]
fn private_claim_burns_tickets_pulls_output_and_clears_allowance() {
    let (token, series, pool, helper) = private_setup();
    pool.claim(series.contract_address, helper.contract_address, 100, false);
    assert(token.balance_of(pool.contract_address) == 100, 'POOL_NOT_PAID');
    assert(token.balance_of(helper.contract_address) == 0, 'OUTPUT_REMAINS');
    assert(tickets(series.contract_address).balance_of(helper.contract_address) == 0, 'TICKETS_REMAIN');
    assert(token.allowance(helper.contract_address, pool.contract_address) == 0, 'ALLOWANCE_REMAINS');
    assert(series.remaining_reserve() == 900, 'BAD_RESERVE');
    assert(tickets(series.contract_address).total_supply() == 900, 'TICKETS_NOT_BURNED');
}

#[test]
#[feature("safe_dispatcher")]
fn downstream_pool_failure_rolls_back_burn_payout_and_transfers() {
    let (token, series, pool, helper) = private_setup();
    let safe_pool = IMockClaimPoolSafeDispatcher { contract_address: pool.contract_address };
    assert(safe_pool.claim(series.contract_address, helper.contract_address, 100, true).is_err(), 'FAILURE_IGNORED');
    assert(series.remaining_reserve() == 1000, 'RESERVE_NOT_RESTORED');
    assert(tickets(series.contract_address).total_supply() == 1000, 'SUPPLY_NOT_RESTORED');
    assert(tickets(series.contract_address).balance_of(pool.contract_address) == 1000, 'TICKETS_NOT_RESTORED');
    assert(token.balance_of(pool.contract_address) == 0, 'PAYOUT_NOT_RESTORED');
    assert(token.balance_of(series.contract_address) == 1000, 'BACKING_NOT_RESTORED');
    pool.claim(series.contract_address, helper.contract_address, 100, false);
}

#[test]
#[feature("safe_dispatcher")]
fn private_helper_rejects_outsider_unknown_series_and_zero_amount() {
    let (token, _, pool, helper) = private_setup();
    let safe_helper = IClaimRedemptionSafeDispatcher { contract_address: helper.contract_address };
    assert(safe_helper.privacy_invoke(token.contract_address, 1, 1).is_err(), 'OUTSIDER_ACCEPTED');
    start_cheat_caller_address(helper.contract_address, pool.contract_address);
    assert(safe_helper.privacy_invoke(token.contract_address, 1, 1).is_err(), 'UNKNOWN_ACCEPTED');
    assert(safe_helper.privacy_invoke(token.contract_address, 0, 1).is_err(), 'ZERO_ACCEPTED');
}

#[test]
#[feature("safe_dispatcher")]
fn private_early_claim_restores_pool_ticket_balance() {
    let (_, series, pool, helper) = private_setup();
    start_cheat_block_timestamp(series.contract_address, 99);
    let safe_pool = IMockClaimPoolSafeDispatcher { contract_address: pool.contract_address };
    assert(safe_pool.claim(series.contract_address, helper.contract_address, 100, false).is_err(), 'EARLY_PRIVATE_CLAIM');
    assert(tickets(series.contract_address).balance_of(pool.contract_address) == 1000, 'INPUT_NOT_RESTORED');
}

#[test]
#[fuzzer(runs: 64)]
fn split_claims_conserve_exact_collateral(split: u16) {
    let (token, series) = funded(0);
    let first: u128 = (split % 999).into() + 1;
    start_cheat_caller_address(series.contract_address, addr(111));
    series.redeem(first, addr(222));
    assert(series.remaining_reserve() == (1000 - first).into(), 'BAD_PARTIAL');
    series.redeem(1000 - first, addr(222));
    assert(token.balance_of(addr(222)) == 1000, 'VALUE_NOT_CONSERVED');
    assert(tickets(series.contract_address).total_supply() == 0, 'SUPPLY_NOT_ZERO');
}
