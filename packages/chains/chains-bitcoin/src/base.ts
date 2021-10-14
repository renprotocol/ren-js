import BigNumber from "bignumber.js";
import base58 from "bs58";

import {
    ChainTransaction,
    DepositChain,
    InputChainTransaction,
    OutputType,
} from "@renproject/interfaces";
import {
    assertType,
    fromBase64,
    fromHex,
    hash160,
    SECONDS,
    sleep,
    toURLBase64,
    tryNTimes,
} from "@renproject/utils";

import { APIWithPriority, BitcoinAPI, CombinedAPI } from "./APIs/API";
import { createAddressBuffer } from "./script/index";
import {
    BitcoinNetworkConfig,
    BitcoinNetworkConfigMap,
    BitcoinNetworkInput,
    BitcoinReleasePayload,
    isBitcoinNetworkConfig,
} from "./utils/types";
import { validateAddress } from "./utils/utils";

/**
 * A base Bitcoin chain class that is extended by each Bitcoin chain/fork.
 */
export abstract class BitcoinBaseChain
    implements
        DepositChain<
            {
                chain: string;
            },
            BitcoinReleasePayload
        >
{
    public static chain: string = "Bitcoin";
    public chain: string;

    public static configMap: BitcoinNetworkConfigMap = {};
    public configMap: BitcoinNetworkConfigMap = {};

    public network: BitcoinNetworkConfig;

    public api = new CombinedAPI();

    constructor(network: BitcoinNetworkInput) {
        const networkConfig = isBitcoinNetworkConfig(network)
            ? network
            : this.configMap[network];
        if (!networkConfig) {
            if (typeof network === "string") {
                throw new Error(`Unknown network ${network}.`);
            } else {
                throw new Error(`Invalid network config.`);
            }
        }
        this.network = networkConfig;
        this.chain = this.network.selector;
        for (const provider of this.network.providers) {
            this.withAPI(provider);
        }
    }

    public withAPI = (
        api: BitcoinAPI | APIWithPriority,
        { priority = 0 } = {},
    ) => {
        this.api.withAPI(api, { priority });
        return this;
    };

    public getOutputPayload = (
        asset: string,
        _type: OutputType.Release,
        toPayload: BitcoinReleasePayload,
    ): {
        to: string;
        payload: Buffer;
    } => {
        this.assertAssetIsSupported(asset);
        return {
            to: toPayload.address,
            payload: Buffer.from([]),
        };
    };

    addressExplorerLink = (address: string): string | undefined =>
        this.network.explorer.address(address);

    transactionExplorerLink = (tx: ChainTransaction): string | undefined =>
        this.network.explorer.transaction(this.transactionHash(tx));

    public getBalance = async (
        asset: string,
        address: string,
        // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<BigNumber> => {
        this.assertAssetIsSupported(asset);
        if (!this.validateAddress(address)) {
            throw new Error(`Invalid address ${address}.`);
        }
        // TODO: Implement.
        return new BigNumber(0);
    };

    public encodeAddress = base58.encode as (bytes: Buffer) => string;

    public validateAddress = (address: string): boolean =>
        validateAddress(
            address,
            this.network.nativeAsset.symbol,
            this.network.isTestnet ? "prod" : "testnet",
        );

    public transactionHash = (transaction: ChainTransaction) =>
        fromBase64(transaction.txid).reverse().toString("hex");

    validateTransaction = (transaction: ChainTransaction): boolean =>
        fromBase64(transaction.txid).length === 32 &&
        !new BigNumber(transaction.txindex).isNaN();

    /**
     * See [[LockChain.assetIsNative]].
     */
    assetIsNative = (asset: string): boolean =>
        asset === this.network.nativeAsset.symbol;
    assetIsSupported = this.assetIsNative;

    isDepositAsset = (asset: string) => {
        this.assertAssetIsSupported(asset);
        return true;
    };

    public readonly assertAssetIsSupported = (asset: string) => {
        if (!this.assetIsNative(asset)) {
            throw new Error(`Asset ${asset} not supported on ${this.chain}.`);
        }
    };

    /**
     * See [[LockChain.assetDecimals]].
     */
    assetDecimals = (asset: string): number => {
        this.assertAssetIsSupported(asset);
        return 8;
    };

    watchForDeposits = async (
        asset: string,
        fromPayload: { chain: string },
        address: string,
        onDeposit: (deposit: InputChainTransaction) => Promise<void>,
        _removeDeposit: (deposit: InputChainTransaction) => Promise<void>,
        listenerCancelled: () => boolean,
    ): Promise<void> => {
        if (fromPayload.chain !== this.chain) {
            throw new Error(
                `Invalid payload for chain ${fromPayload.chain} instead of ${this.chain}.`,
            );
        }
        this.assertAssetIsSupported(asset);

        try {
            const txs = await tryNTimes(
                async () => this.api.fetchTXs(address),
                2,
            );
            txs.map(async (tx) =>
                onDeposit({
                    txid: toURLBase64(fromHex(tx.txid).reverse()),
                    txindex: tx.txindex,
                    amount: tx.amount,
                }),
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // Ignore error and fallback to getUTXOs.
        }

        while (true) {
            if (listenerCancelled()) {
                return;
            }
            try {
                const utxos = await this.api.fetchUTXOs(address);
                utxos.map(async (tx) =>
                    onDeposit({
                        txid: toURLBase64(fromHex(tx.txid).reverse()),
                        txindex: tx.txindex,
                        amount: tx.amount,
                    }),
                );
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                console.error(error);
            }
            await sleep(15 * SECONDS);
        }
    };

    /**
     * See [[LockChain.transactionConfidence]].
     */
    public transactionConfidence = async (
        transaction: ChainTransaction,
    ): Promise<BigNumber> => {
        const { height } = await this.api.fetchUTXO(
            this.transactionHash(transaction),
            transaction.txindex,
        );
        if (!height) {
            return new BigNumber(0);
        } else {
            const latestHeight = new BigNumber(await this.api.fetchHeight());
            return latestHeight.minus(height).plus(1);
        }
    };

    /**
     * See [[LockChain.getGatewayAddress]].
     */
    createGatewayAddress = (
        asset: string,
        fromPayload: { chain: string },
        shardPublicKey: Buffer,
        gHash: Buffer,
    ): Promise<string> | string => {
        if (fromPayload.chain !== this.chain) {
            throw new Error(
                `Invalid payload for chain ${fromPayload.chain} instead of ${this.chain}.`,
            );
        }
        this.assertAssetIsSupported(asset);
        return this.encodeAddress(
            createAddressBuffer(
                hash160(shardPublicKey),
                gHash,
                this.network.p2shPrefix,
            ),
        );
    };

    // Methods for initializing mints and burns ////////////////////////////////

    /**
     * When burning, you can call `Bitcoin.Address("...")` to make the address
     * available to the burn params.
     *
     * @category Main
     */
    Address = (address: string): { chain: string; address: string } => {
        // Type validation
        assertType<string>("string", { address });

        return {
            chain: this.chain,
            address,
        };
    };

    burnPayload? = (burnPayloadConfig?: { chain: string; address: string }) => {
        return {
            to: burnPayloadConfig?.address,
        };
    };

    toSats = (value: BigNumber | string | number): string =>
        new BigNumber(value)
            .times(new BigNumber(10).exponentiatedBy(8))
            .decimalPlaces(0)
            .toFixed();

    fromSats = (value: BigNumber | string | number): string =>
        new BigNumber(value)
            .dividedBy(new BigNumber(10).exponentiatedBy(8))
            .toFixed();
}
