import {
    QueryClient, setupDistributionExtension, SigningStargateClient

} from "@cosmjs/stargate";
import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
import { coins, Secp256k1HdWallet } from '@cosmjs/launchpad'
import dotenv from 'dotenv';
import { chainMap } from "./assets/chains.js";
dotenv.config();

async function getQueryClient(rpcEndpoint) {
    const tendermint34Client = await Tendermint34Client.connect(rpcEndpoint);
    const queryClient = QueryClient.withExtensions(
        tendermint34Client,
        setupDistributionExtension
    );
    return queryClient;
}

async function withdrawRewards(client, chain, address, validators,totalReward) {
    let ops = [];
    for (let validator of validators) {
        let msg = {
            typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
            value: {
                delegatorAddress: address,
                validatorAddress: validator
            },
        };
        ops.push(msg);
    }
    const fee = {
        amount: coins(chain.min_tx_fee, chain.denom),
        gas: "" + chain.gas*validators.length,
    };
    let result = await client.signAndBroadcast(address, ops, fee, '');
    if(result.code>0){
        console.log(`${address} failed to claim ${totalReward} ${chain.symbol}. ${result.rawLog}`);
    }else{
        console.log(`${address} claimed ${totalReward} ${chain.symbol}. Tx Hash: ${result.transactionHash}`);

    }

}




async function start(mnemonic, chain) {
    const rpcEndpoint = chain.rpc;
    const wallet = await Secp256k1HdWallet.fromMnemonic(
        mnemonic,
        {
            prefix: chain.prefix
        }
    );
    const [account] = await wallet.getAccounts();
    const queryClient = await getQueryClient(rpcEndpoint);
    let delegationRewards = await queryClient.distribution.delegationTotalRewards(account.address);
    let validators = [];
    let totalRewards = 0;
    if (delegationRewards.total.length > 0) {
        for (let reward of delegationRewards.rewards) {
            validators.push(reward.validatorAddress);
        }
        for (let total of delegationRewards.total) {
            if (total.denom == chain.denom) {
                totalRewards += Number(total.amount) / 1e24;
            }
        }
    }
    if (totalRewards > chain.claim_min && validators.length>0) {
        const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);
        await withdrawRewards(client,chain, account.address, validators,totalRewards);
    }
}

let keys = process.env.MNEMONICS.split(',');
for (const [k, chain] of Object.entries(chainMap)) {
    for (let key of keys) {
        start(key, chain);
    }
}