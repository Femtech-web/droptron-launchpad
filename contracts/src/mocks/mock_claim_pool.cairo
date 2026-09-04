use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockClaimPool<TState> {
    fn claim(ref self: TState, series: ContractAddress, helper: ContractAddress, amount: u128, fail_after_pull: bool);
}

/// TEST ONLY: models atomic token movement, not proof validation or privacy.
#[starknet::contract]
pub mod MockClaimPool {
    use starknet::{ContractAddress, get_contract_address};
    use crate::claim_redemption::{IClaimRedemptionDispatcher, IClaimRedemptionDispatcherTrait};
    use crate::fixed_supply_token::{IDroptronFixedSupplyTokenDispatcher, IDroptronFixedSupplyTokenDispatcherTrait};
    #[storage]
    struct Storage {}
    #[abi(embed_v0)]
    impl PoolImpl of super::IMockClaimPool<ContractState> {
        fn claim(ref self: ContractState, series: ContractAddress, helper: ContractAddress, amount: u128, fail_after_pull: bool) {
            let ticket = IDroptronFixedSupplyTokenDispatcher { contract_address: series };
            assert(ticket.transfer(helper, amount.into()), 'INPUT_FAILED');
            let redemption = IClaimRedemptionDispatcher { contract_address: helper };
            let deposits = redemption.privacy_invoke(series, amount, 99);
            assert(deposits.len() == 1, 'BAD_OUTPUT_COUNT');
            let output = *deposits.at(0);
            assert(output.note_id == 99 && output.amount == amount, 'BAD_OUTPUT');
            let token = IDroptronFixedSupplyTokenDispatcher { contract_address: output.token };
            assert(token.transfer_from(helper, get_contract_address(), output.amount.into()), 'PULL_FAILED');
            assert(!fail_after_pull, 'SIMULATED_POOL_FAILURE');
        }
    }
}
