use starknet::ContractAddress;

#[starknet::interface]
pub trait IDroptronFixedSupplyToken<TState> {
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

/// Configurable fixed-supply ERC-20 token created through Droptron.
/// Supply is created once and assigned to the treasury.
#[starknet::contract]
pub mod DroptronFixedSupplyToken {
    use core::byte_array::ByteArrayTrait;
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    #[storage]
    struct Storage {
        total_supply: u256,
        name: felt252,
        name_len: u8,
        symbol: felt252,
        symbol_len: u8,
        decimals: u8,
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
    fn constructor(
        ref self: ContractState,
        treasury: ContractAddress,
        total_supply: u256,
        name: felt252,
        name_len: u8,
        symbol: felt252,
        symbol_len: u8,
        decimals: u8,
    ) {
        assert(treasury.is_non_zero(), 'INVALID_TREASURY');
        assert(treasury != get_contract_address(), 'TREASURY_IS_TOKEN');
        assert(total_supply != 0, 'INVALID_SUPPLY');
        assert(name_len > 0 && name_len <= 31, 'INVALID_NAME');
        assert(symbol_len > 0 && symbol_len <= 10, 'INVALID_SYMBOL');
        assert(decimals <= 18, 'INVALID_DECIMALS');

        self.total_supply.write(total_supply);
        self.name.write(name);
        self.name_len.write(name_len);
        self.symbol.write(symbol);
        self.symbol_len.write(symbol_len);
        self.decimals.write(decimals);
        self.balances.entry(treasury).write(total_supply);
        self.emit(Transfer { from: 0.try_into().unwrap(), to: treasury, value: total_supply });
    }

    #[abi(embed_v0)]
    impl DroptronFixedSupplyTokenImpl of super::IDroptronFixedSupplyToken<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            let mut result: ByteArray = "";
            result.append_word(self.name.read(), self.name_len.read().into());
            result
        }

        fn symbol(self: @ContractState) -> ByteArray {
            let mut result: ByteArray = "";
            result.append_word(self.symbol.read(), self.symbol_len.read().into());
            result
        }

        fn decimals(self: @ContractState) -> u8 {
            self.decimals.read()
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
