/**
 * YoBit order book event emitter.
 */

const EventEmitter = require('events');
const request = require('request');
const config = require('config');
const debug = require('debug')('cointrage:order_book:yobit');

const API_URL = 'https://yobit.net/api/3';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

const parseMarketName = (str) => {
    const groups = str.split('_');
    return [groups[1].toUpperCase(), groups[0].toUpperCase()];
};

const getMarkets = () => new Promise((resolve, reject) => {

    const url = `${API_URL}/info`;
    debug(`Getting markets list from url ${url}...`);

    request({
        uri: url,
        json: true,
        method: 'GET'
    }, (err, response, body) => {
        if (err) return reject(err);

        if (response.statusCode !== 200) {
            // some other error
            return reject(`Invalid status code received from url ${url}: ${response.statusCode}`);
        }

        if (!body) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }
        else if (!body.pairs) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }

        // filtering active markets only
        const markets = {};
        let counter = 0;

        for (let mt in body.pairs) {
            let [market, ticker] = parseMarketName(mt);
            if (MARKETS.indexOf(market) === -1) {
                continue;
            }

            if (!markets[market]) {
                markets[market] = [];
            }

            counter += 1;
            markets[market].push(ticker);
        }

        debug(`Found ${counter} markets`);

        resolve(markets);

    });

});

const getOrderBook = (market, ticker) => new Promise((resolve, reject) => {

    let marketTicker = ticker + market;
    const url = `${API_URL}/depth/${ticker.toLowerCase()}_${market.toLowerCase()}`;
    debug(`Getting order book for market ${marketTicker} from url ${url}...`);

    const mapOrder = (o) => {
        return {
            rate: o[0],
            quantity: o[1]
        };
    };

    request({
        uri: url,
        json: true,
        method: 'GET'
    }, (err, response, body) => {
        if (err) return reject(err);

        if (response.statusCode !== 200) {
            return reject(`Invalid status code received from url ${url}: ${response.statusCode}`);
        }

        if (!body) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }

        let bookData = body[`${ticker.toLowerCase()}_${market.toLowerCase()}`];
        if (!bookData) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }

        // formatting response
        const res = {
            market: market,
            ticker: ticker,
            asks: bookData.asks ? bookData.asks.map(mapOrder) : [],
            bids: bookData.bids ? bookData.bids.map(mapOrder) : []
        };

        resolve(res);
    });
});

class YoBitOrderBook extends EventEmitter {

    constructor() {
        super();

        this._book = {};
    }

    listen() {

        const handleError = (err) => {
            debug(err);
            this.emit('error', err);
        };

        // let markets = {};
        // const refreshMarkets = () => {
        //     getMarkets()
        //         .then((m) => {
        //             markets = m;
        //         })
        //         .catch(handleError)
        //         .then(() => setTimeout(refreshMarkets, MARKETS_REFRESH_INTERVAL));
        // };
        //
        // // refreshing markets
        // refreshMarkets();
        //
        // const refreshOrderbooks = () => {
        //
        //     if (!Object.keys(markets).length) {
        //         return setTimeout(refreshOrderbooks, BOOKS_REFRSH_INTERVAL);
        //     }
        //
        //     const book = this._book;
        //     const self = this;
        //
        //     let counter = 0;
        //
        //     for (let m in markets) {
        //         for (let t of markets[m]) {
        //
        //             (function (market, ticker) {
        //                 setTimeout(() => {
        //                     getOrderBook(market, ticker)
        //                         .then((b) => {
        //                             if (!book[b.market]) {
        //                                 book[b.market] = {};
        //                             }
        //
        //                             book[b.market][b.ticker] = b;
        //                             self.emit('update', book, b.market, b.ticker);
        //                         })
        //                         .catch((err) => {
        //                             handleError(err);
        //
        //                             if (!book[market]) {
        //                                 book[market] = {};
        //                             }
        //
        //                             book[market][ticker] = null;
        //
        //                             // notifying about market removal
        //                             self.emit('update', book, market, ticker);
        //                         });
        //                 }, counter * 500);
        //
        //             })(m, t);
        //
        //             counter += 1;
        //
        //         }
        //     }
        //
        //     // schedule next update
        //     setTimeout(refreshOrderbooks, (counter * 500) + 500);
        // };
        //
        // // refreshing order books
        // refreshOrderbooks();

    }

};

module.exports = new YoBitOrderBook();