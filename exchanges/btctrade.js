/**
 * BTC Trade order book event emitter.
 */

const EventEmitter = require('events');
const request = require('request');
const config = require('config');
const debug = require('debug')('cointrage:order_book:btctrade');
const async  = require('async');

const API_URL = 'https://www.btctrade.im';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

const getMarkets = () => new Promise((resolve, reject) => {
    const markets = {};
    let counter = 0;

    async.eachSeries(MARKETS, (mt, callback) => {
        let url = `${API_URL}/coin/${mt.toLowerCase()}/allcoin`;
        debug(`Getting markets list from url ${url}...`);

        request({
            uri: url,
            json: true,
            method: 'GET'
        }, (err, response, body) => {
            if (err) return callback(null);

            if (response.statusCode !== 200) {
                // some other error
                return callback(null);
            }

            if (!body) {
                return callback(null);
            }

            for (let tk in body) {
                let [market, ticker] = [mt, tk.toUpperCase()];

                if (!markets[market]) {
                    markets[market] = [];
                }

                counter += 1;
                markets[market].push(ticker);
            }

            callback(null);
        });
    }, (err) => {
        debug(`Found ${counter} markets`);

        resolve(markets);
    });
});

const getOrderBook = (market, ticker) => new Promise((resolve, reject) => {

    let marketTicker = ticker + market;
    const url = `${API_URL}/coin/${market.toLowerCase()}/${ticker.toLowerCase()}/trades`;
    debug(`Getting order book for market ${marketTicker} from url ${url}...`);

    const mapOrder = (o) => {
        return {
            rate: Number(o[0]),
            quantity: Number(o[1])
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
            asks: body.sell ? body.sell.map(mapOrder) : [],
            bids: body.buy ? body.buy.map(mapOrder) : []
        };

        resolve(res);
    });
});

class BtcTradeOrderBook extends EventEmitter {

    constructor() {
        super();

        this._book = {};
    }

    listen() {

        const handleError = (err) => {
            debug(err);
            this.emit('error', err);
        };

        let markets = {};
        const refreshMarkets = () => {
            getMarkets()
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
                        }, counter * 500);

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

module.exports = new BtcTradeOrderBook();


