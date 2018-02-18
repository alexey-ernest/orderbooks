/**
 * BTC Markets order book event emitter.
 */

const EventEmitter = require('events');
const request = require('request');
const cheerio = require('cheerio');
const config = require('config');
const debug = require('debug')('cointrage:order_book:btcmarkets');

const API_URL = 'https://api.btcmarkets.net';
const MARKETS_URL = 'https://coinmarketcap.com/exchanges/btc-markets/';
const MARKETS_REFRESH_INTERVAL = 30000;
const BOOKS_REFRSH_INTERVAL = 30000;

const MARKETS = ['ETH', 'BTC', 'USDT', 'USD'];

const parseMarketName = (str) => {
    const groups = str.split('/');
    return [groups[1], groups[0]];
};

const getMarkets = () => new Promise((resolve, reject) => {

    const url = `${MARKETS_URL}`;
    debug(`Getting markets list from url ${url}...`);

    request(url, (err, response, html) => {
        if (err) return reject(err);

        if (response.statusCode !== 200) {
            // some other error
            return reject(`Invalid status code received from url ${url}: ${response.statusCode}`);
        }

        // filtering active markets only
        const markets = {};
        let counter = 0;

        const _$ = cheerio.load(html);

        _$('table#exchange-markets > tbody tr').each((i, row) => {
            let mt  = _$(row).find('a').not('.market-name').text();
            if (mt) {
                let [market, ticker] = parseMarketName(mt);
                if (MARKETS.indexOf(market) !== -1) {
                    if (!markets[market]) {
                        markets[market] = [];
                    }

                    counter += 1;
                    markets[market].push(ticker);
                }
            }
        });

        debug(`Found ${counter} markets`);

        resolve(markets);
    });

});

const getOrderBook = (market, ticker) => new Promise((resolve, reject) => {

    let marketTicker = market + ticker;
    const url = `${API_URL}/market/${ticker}/${market}/orderbook`;
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

class BTCMarketsOrderBook extends EventEmitter {

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

module.exports = new BTCMarketsOrderBook();