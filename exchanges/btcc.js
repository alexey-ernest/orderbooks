/**
 * BTCC order book event emitter.
 *
 * DAX platform is closed, so we have only BTC/USD exchange.
 *
 */

const EventEmitter = require('events');
const request = require('request');
const config = require('config');
const debug = require('debug')('cointrage:order_book:btcc');

const API_URL = 'https://spotusd-data.btcc.com';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

/////////////////////////

const getOrderBook = (market, ticker) => new Promise((resolve, reject) => {

    let marketTicker = market + ticker;
    const url = `${API_URL}/data/pro/orderbook?symbol=${ticker}${market}`;
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

        // formatting response
        const res = {
            market: market,
            ticker: ticker,
            asks: body.asks ? body.asks.map(mapOrder) : [],
            bids: body.bids ? body.bids.map(mapOrder) : []
        };

        resolve(res);
    });
});



class BTCCOrderBook extends EventEmitter {

    constructor() {
        super();

        this._book = {};
    }

    listen() {

        const handleError = (err) => {
            debug(err);
            this.emit('error', err);
        };

        let markets = { USD : ['BTC'] };

        const refreshOrderbooks = () => {

            if (!Object.keys(markets).length) {
                return setTimeout(refreshOrderbooks, BOOKS_REFRSH_INTERVAL);
            }

            const book = this._book;
            const self = this;

            let counter = 0;

            for (let m in markets) {
                for (let t of markets[m]) {

                    (function (market, ticker) {
                        setTimeout(() => {
                            getOrderBook(market, ticker)
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

                                    book[market][ticker] = null;

                                    // notifying about market removal
                                    self.emit('update', book, market, ticker);
                                });
                        }, counter * 250);

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

module.exports = new BTCCOrderBook();