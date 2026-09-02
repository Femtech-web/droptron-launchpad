use starknet::ContractAddress;

#[starknet::interface]
pub trait IDroptronDemoToken<TState> {
    fn name(self: @TState) -> ByteArray;
    fn symbol(self: @TState) -> ByteArray;
    fn decimals(self: @TState) -> u8;
    fn total_supply(self: @TState) -> u256;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn allowance(self: @TState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
}

/// Fixed-supply ERC-20-shaped token for Droptron's Sepolia integration tests.
/// It has no public mint entrypoint and must not be presented as a production asset.
#[starknet::contract]
pub mod DroptronDemoToken {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        total_supply: u256,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    struct Transfer {
        #[key]
        from: ContractAddress,
        #[key]
        to: ContractAddress,
        value: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Approval {
        #[key]
        owner: ContractAddress,
        #[key]
        spender: ContractAddress,
        value: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, recipient: ContractAddress, initial_supply: u256) {
        assert(recipient.is_non_zero(), 'INVALID_RECIPIENT');
        assert(initial_supply != 0, 'INVALID_SUPPLY');
        self.total_supply.write(initial_supply);
        self.balances.entry(recipient).write(initial_supply);
        self.emit(Transfer { from: 0.try_into().unwrap(), to: recipient, value: initial_supply });
    }

    #[abi(embed_v0)]
    impl DroptronDemoTokenImpl of super::IDroptronDemoToken<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            "Droptron Demo Token"
        }

        fn symbol(self: @ContractState) -> ByteArray {
            "DROP"
        }

        fn decimals(self: @ContractState) -> u8 {
            18
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let owner = get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            self.emit(Approval { owner, spender, value: amount });
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            self.transfer_balance(sender, recipient, amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowance = self.allowances.entry((sender, spender)).read();
            assert(allowance >= amount, 'INSUFFICIENT_ALLOWANCE');
            self.allowances.entry((sender, spender)).write(allowance - amount);
            self.emit(Approval { owner: sender, spender, value: allowance - amount });
            self.transfer_balance(sender, recipient, amount);
            true
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn transfer_balance(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            assert(recipient.is_non_zero(), 'INVALID_RECIPIENT');
            let sender_balance = self.balances.entry(sender).read();
            assert(sender_balance >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.entry(sender).write(sender_balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
        }
    }
}
