/**
 * Coinrail order book event emitter.
 *
 * 999 - When a call is made exceeding a limited number of times. 20 times per second for the public API .
 * 10 times per second for the private API. If the above limit is exceeded, it will be stopped for 5 minutes.
 *
 */

const EventEmitter = require('events');
const request = require('request');
const config = require('config');
const debug = require('debug')('cointrage:order_book:coinrail');

const API_URL = 'https://api.coinrail.co.kr/public';
const API_MARKETS_URL = 'https://coinrail.co.kr/main';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

const parseMarketName = (str) => {
    const groups = str.split('-');
    return [groups[1].toUpperCase(), groups[0].toUpperCase()];
};

const getMarkets = () => new Promise((resolve, reject) => {

    const url = `${API_MARKETS_URL}/market_info?v=${new Date().getTime()}`;
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

        // filtering active markets only
        const markets = {};
        let counter = 0;

        for (let o of MARKETS) {
            let marketData = body[`${o.toLowerCase()}_market`];
            if (marketData) {
                for (let mt of marketData) {
                    let [market, ticker] = parseMarketName(mt.currency);

                    if (!markets[market]) {
                        markets[market] = [];
                    }

                    counter += 1;
                    markets[market].push(ticker);
                }
            }
        }

        debug(`Found ${counter} markets`);

        resolve(markets);

    });

});

const getOrderBook = (market, ticker) => new Promise((resolve, reject) => {

    const marketTicker = ticker + market;
    const url = `${API_URL}/orderbook/?currency=${ticker.toLowerCase()}-${market.toLowerCase()}`;
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
            asks: body.ask_orderbook.map(mapOrder),
            bids: body.bid_orderbook.map(mapOrder)
        };

        resolve(res);
    });
});

class CoinRailOrderBook extends EventEmitter {

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

module.exports = new CoinRailOrderBook();