/**
 * Coinut order book event emitter.
 */

const EventEmitter = require('events');
const request = require('request');
const config = require('config');
const debug = require('debug')('cointrage:order_book:coinut');

const API_URL = 'https://api-eu.coinut.com';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

const getMarkets = (nonce) => new Promise((resolve, reject) => {

    const url = `${API_URL}`;
    debug(`Getting markets list from url ${url}...`);

    request({
        uri: url,
        json: true,
        body: {"request": "inst_list", "sec_type": "SPOT", "nonce": nonce},
        method: 'POST'
    }, (err, response, body) => {
        if (err) return reject(err);

        if (response.statusCode !== 200) {
            // some other error
            return reject(`Invalid status code received from url ${url}: ${response.statusCode}`);
        }

        if (!body) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }
        else if (!body.SPOT) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }

        // filtering active markets only
        const markets = {};
        let counter = 0;

        for (let mt in body.SPOT) {
            let md = body.SPOT[mt][0];
            if (!md) {
                continue;
            }

            let [market, ticker, id] = [md.quote, md.base, md.inst_id];
            if (MARKETS.indexOf(market) === -1) {
                continue;
            }

            if (!markets[market]) {
                markets[market] = [];
            }

            counter += 1;
            markets[market].push({ticker, id});
        }

        debug(`Found ${counter} markets`);

        resolve(markets);

    });

});

const getOrderBook = (market, ticker, id, nonce) => new Promise((resolve, reject) => {

    const marketTicker = ticker + market;
    const url = `${API_URL}`;
    debug(`Getting order book for market ${marketTicker} from url ${url}...`);

    const mapOrder = (o) => {
        return {
            rate: Number(o.price),
            quantity: Number(o.qty)
        };
    };

    request({
        uri: url,
        json: true,
        body: {"request" : "inst_order_book", "inst_id" : id, "nonce" : nonce},
        method: 'POST'
    }, (err, response, body) => {
        if (err) return reject(err);

        if (response.statusCode !== 200) {
            return reject(`Invalid status code received from url ${url}: ${response.statusCode}`);
        }

        if (!body) {
            return reject(`Invalid response: ${JSON.stringify(body)}`);
        }

        // formatting response
        const res = {
            market: market,
            ticker: ticker,
            asks: body.sell ? body.sell.map(mapOrder) : [],
            bids: body.buy ? body.buy.map(mapOrder) : []
        };

        resolve(res);
    });
});

class CoinutOrderBook extends EventEmitter {

    constructor() {
        super();

        this._book = {};
        this._nonce = 1;
    }

    listen() {

        const handleError = (err) => {
            debug(err);
            this.emit('error', err);
        };

        let markets = {};
        const refreshMarkets = () => {
            getMarkets(this._nonce++)
                .then((m) => {
                    markets = m;
                })
                .catch(handleError)
                .then(() => setTimeout(refreshMarkets, MARKETS_REFRESH_INTERVAL));
        };

        // refreshing markets
        refreshMarkets();

        const refreshOrderbooks = () => {

            if (!Object.keys(markets).length) {
                return setTimeout(refreshOrderbooks, BOOKS_REFRSH_INTERVAL);
            }

            const book = this._book;
            const self = this;

            let counter = 0;

            for (let m in markets) {
                for (let t of markets[m]) {

                    (function (market, tickerInfo) {
                        setTimeout(() => {
                            getOrderBook(market, tickerInfo.ticker, tickerInfo.id, self._nonce++)
                                .then((b) => {
                                    if (!book[b.market]) {
                                        book[b.market] = {};
                                    }

                                    book[b.market][b.ticker] = b;
                                    self.emit('update', book, b.market, b.ticker);
                                })
                                .catch((err) => {
                                    handleError(err);

                                    if (!book[market]) {
                                        book[market] = {};
                                    }

                                    book[market][tickerInfo.ticker] = null;

                                    // notifying about market removal
                                    self.emit('update', book, market, tickerInfo.ticker);
                                });
                        }, counter * 50);

                    })(m, t);

                    counter += 1;

                }
            }

            // schedule next update
            setTimeout(refreshOrderbooks, BOOKS_REFRSH_INTERVAL);
        };

        // refreshing order books
        refreshOrderbooks();

    }

};

module.exports = new CoinutOrderBook();