use starknet::{ClassHash, ContractAddress};

#[derive(Serde, Copy, Drop)]
pub struct Tranche {
    pub allocation: u128,
    pub unlock_at: u64,
    pub expires_at: u64,
}

#[starknet::interface]
pub trait IDistributionFactory<TState> {
    fn create_campaign(ref self: TState, token: ContractAddress, decimals: u8, salt: felt252, tranches: Span<Tranche>) -> Span<ContractAddress>;
    fn is_series(self: @TState, series: ContractAddress) -> bool;
    fn series_class_hash(self: @TState) -> ClassHash;
}

/// Creates immutable series; never holds funds or receives recipient manifests.
/// Create all series together, then approve/fund them with a wallet multicall.
#[starknet::contract]
pub mod DroptronDistributionFactory {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ClassHash, ContractAddress, get_caller_address};
    use starknet::syscalls::deploy_syscall;
    use crate::claim_series::ClaimTerms;
    use super::Tranche;

    #[storage]
    struct Storage {
        series_class_hash: ClassHash,
        series: Map<ContractAddress, bool>,
        campaigns: Map<(ContractAddress, felt252), bool>,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { SeriesCreated: SeriesCreated }
    #[derive(Drop, starknet::Event)]
    struct SeriesCreated {
        #[key] creator: ContractAddress,
        #[key] campaign_salt: felt252,
        index: u32,
        series: ContractAddress,
        token: ContractAddress,
        allocation: u128,
        unlock_at: u64,
        expires_at: u64,
    }
    #[constructor]
    fn constructor(ref self: ContractState, series_class_hash: ClassHash) {
        assert(series_class_hash.is_non_zero(), 'INVALID_CLASS');
        self.series_class_hash.write(series_class_hash);
    }
    #[abi(embed_v0)]
    impl FactoryImpl of super::IDistributionFactory<ContractState> {
        fn is_series(self: @ContractState, series: ContractAddress) -> bool { self.series.entry(series).read() }
        fn series_class_hash(self: @ContractState) -> ClassHash { self.series_class_hash.read() }
        fn create_campaign(ref self: ContractState, token: ContractAddress, decimals: u8, salt: felt252, tranches: Span<Tranche>) -> Span<ContractAddress> {
            assert(token.is_non_zero(), 'INVALID_TOKEN');
            assert(decimals <= 18, 'INVALID_DECIMALS');
            assert(tranches.len() > 0 && tranches.len() <= 24, 'INVALID_TRANCHE_COUNT');
            let creator = get_caller_address();
            assert(creator.is_non_zero(), 'INVALID_OWNER');
            assert(!self.campaigns.entry((creator, salt)).read(), 'CAMPAIGN_EXISTS');
            self.campaigns.entry((creator, salt)).write(true);
            let mut result = array![];
            let mut index = 0;
            let mut previous_unlock = 0;
            for tranche in tranches {
                let tranche = *tranche;
                assert(index == 0 || tranche.unlock_at > previous_unlock, 'UNORDERED_TRANCHES');
                let terms = ClaimTerms { owner: creator, underlying: token, decimals,
                    allocation: tranche.allocation, unlock_at: tranche.unlock_at, expires_at: tranche.expires_at };
                let mut calldata = array![];
                terms.serialize(ref calldata);
                // Namespaced by creator: another user cannot reserve their salt.
                let deployment_salt = poseidon_hash_span(array![creator.into(), salt, index.into()].span());
                let (series, _) = deploy_syscall(self.series_class_hash.read(), deployment_salt, calldata.span(), false).unwrap();
                self.series.entry(series).write(true);
                self.emit(SeriesCreated { creator, campaign_salt: salt, index, series, token,
                    allocation: tranche.allocation, unlock_at: tranche.unlock_at, expires_at: tranche.expires_at });
                result.append(series);
                previous_unlock = tranche.unlock_at;
                index += 1;
            };
            result.span()
        }
    }
}
