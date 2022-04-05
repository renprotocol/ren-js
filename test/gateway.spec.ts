import chai from "chai";
import { config as loadDotEnv } from "dotenv";
import { Ethereum, Polygon } from "packages/chains/chains-ethereum/src";
import {
    BinanceSmartChain,
    Bitcoin,
    Fantom,
    Solana,
} from "packages/chains/chains/src";
import RenJS from "packages/ren/src";
import { GatewayParams } from "packages/ren/src/params";
import { RenNetwork } from "packages/utils/src";

import { defaultGatewayHandler } from "./utils/defaultGatewayHandler";
import { initializeChain } from "./utils/testUtils";

chai.should();

loadDotEnv();

describe("Gateway", () => {
    it("DAI: Ethereum to Polygon", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;
        const renJS = new RenJS(network);

        const asset = "DAI";
        const from = initializeChain(Ethereum);
        const to = initializeChain(Polygon);
        renJS.withChains(from, to);

        const gatewayParams: GatewayParams = {
            asset,
            from: from.Account({ amount: "0.1", convertUnit: true }),
            to: to.Account(),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("ETH: BSC to Ethereum", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;

        const asset = Ethereum.assets.ETH;
        const bsc = initializeChain(BinanceSmartChain);
        const ethereum = initializeChain(Ethereum);

        const renJS = new RenJS(network).withChains(bsc, ethereum);

        const gatewayParams: GatewayParams = {
            asset,
            from: bsc.Account({ amount: 0.001, convertUnit: true }),
            to: ethereum.Account(),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("BTC/fromEthereum", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;

        const asset = Bitcoin.assets.BTC;
        const ethereum = initializeChain(Ethereum);
        const bitcoin = initializeChain(Bitcoin);

        const renJS = new RenJS(network).withChains(bitcoin, ethereum);

        const gatewayParams = {
            asset,
            // from: ethereum.Transaction({
            //     // txidFormatted:
            //     // "0xef9d844602f21bae9cc38db39ce077f1bcff0517ae735f87c274b0d70e1fd6e5",
            //     txid: "752ERgLyG66cw42znOB38bz_BReuc1-HwnSw1w4f1uU",
            // }),
            from: ethereum.Account({ amount: 0.0001, convertUnit: true }),
            to: bitcoin.Address("miMi2VET41YV1j6SDNTeZoPBbmH8B4nEx6"),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("BTC/toSolana", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;
        const asset = Bitcoin.assets.BTC;
        const from = initializeChain(Bitcoin);
        const to = initializeChain(Solana);
        const renJS = new RenJS(network).withChains(from, to);

        const gatewayParams: GatewayParams = {
            asset,
            from: from.GatewayAddress(),
            to: to.Account(),
            nonce: 7,
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("BTC/fromSolana", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;
        const renJS = new RenJS(network);

        const asset = Bitcoin.assets.BTC;
        const solana = initializeChain(Solana);
        const bitcoin = initializeChain(Bitcoin);
        renJS.withChains(bitcoin, solana);

        const fees = await renJS.getFees({
            asset,
            from: solana,
            to: bitcoin,
        });

        const minimumAmount = fees.minimumAmount;
        const amount = minimumAmount.times(2);

        const gatewayParams: GatewayParams = {
            asset: asset,
            from: solana.Account({ amount }),
            to: bitcoin.Address("miMi2VET41YV1j6SDNTeZoPBbmH8B4nEx6"),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("DAI/fromBinanceSmartChain", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;

        const asset = Ethereum.assets.DAI;
        const ethereum = initializeChain(Ethereum);
        const bsc = initializeChain(BinanceSmartChain);

        const renJS = new RenJS(network).withChains(bsc, ethereum);

        const gatewayParams = {
            asset,
            from: bsc.Account({ amount: 0.5, convertUnit: true }),
            to: ethereum.Account(),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("DAI/fromBSCtoFantom", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;

        const asset = Ethereum.assets.DAI;
        const bsc = initializeChain(BinanceSmartChain);
        const fantom = initializeChain(Fantom);

        const renJS = new RenJS(network).withChains(bsc, fantom);

        const gatewayParams: GatewayParams = {
            asset,
            from: bsc.Account({ amount: 0.5, convertUnit: true }),
            to: fantom.Account(),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });

    it("DAI/toBinanceSmartChain", async function () {
        this.timeout(100000000000);

        const network = RenNetwork.Testnet;

        const asset = Ethereum.assets.DAI;
        const ethereum = initializeChain(Ethereum);
        const bsc = initializeChain(BinanceSmartChain);

        const renJS = new RenJS(network).withChains(bsc, ethereum);

        const gatewayParams: GatewayParams = {
            asset,
            from: ethereum.Account({ amount: 1, convertUnit: true }),
            // from: ethereum.Transaction({
            //     chain: "Ethereum",
            //     txidFormatted:
            //         "0x27a7df5508abf38946ee418c120c7ad9ae1c682ea5b7d9c6a5fa92b730cf3946",
            //     txid: "J6ffVQir84lG7kGMEgx62a4caC6lt9nGpfqStzDPOUY",
            //     txindex: "0",
            // }),
            to: bsc.Account(),
        };

        await defaultGatewayHandler(await renJS.gateway(gatewayParams));
    });
});
